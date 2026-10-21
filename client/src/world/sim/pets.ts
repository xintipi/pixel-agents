// Office pets: a dog and a cat that roam the building on their own. They are not agents (they stay out of
// sim.chars: no snapshot, no reserved place, no label or bubble). The cat naps a lot, likes to stay near
// whoever is still at their desk and sleeps next to whoever naps; the dog strolls more, sometimes runs, and goes
// running to celebrate with whoever just delivered a request. A click pets them (heart). Movement by dt and
// seeded draws: reproducible in tests, in the timelapse and in fast-forward.
import type { IconName } from '../../art/api';
import { TILE } from '../../art/api';
import type { PetFacing, PetKind, PetPose } from '../../art/pets';
import { mulberry32 } from '../../../../shared/hash';
import { FOOT_DX, FOOT_DY } from '../constants';
import { FREE, type WalkGrid } from '../path/grid';
import { Robot } from './robot';
import type { SoundCueKind } from '../api';

/** Speeds (tiles/s). */
const SPEED: Readonly<Record<PetKind, { walk: number; run: number }>> = {
  dog: { walk: 2.6, run: 6.5 },
  cat: { walk: 1.8, run: 5 },
};

/** What the building offers the pets (Sim implements it; in tests, a fake). */
export interface PetWorld {
  grid(): WalkGrid;
  /** Tile path (flattened x,y, without the origin) or false. */
  findPath(sx: number, sy: number, gx: number, gy: number, out: number[]): boolean;
  /** People still at their own desk (seat tile; `asleep`: napping). */
  restingPeople(): { id: string; tx: number; ty: number; asleep: boolean }[];
  /** Tile of a present person (to go celebrate), or null. */
  personTile(id: string): { tx: number; ty: number } | null;
  /** (Optional) A free sofa, armchair or pouf, already reserved for `by` (nobody sits on the cat). */
  cozySpot?(by: string, rng: () => number): CozySpot | null;
  /** (Optional) Gives back the place reserved by cozySpot. */
  releaseSpot?(id: string, by: string): void;
  /** (Optional) Where the robot vacuum's dock is (a free corner); null = no robot. */
  robotDock?(): { tx: number; ty: number } | null;
  /** (Optional) The dog arrived to wake someone who was napping (lick). */
  wake?(id: string): void;
}

export interface CozySpot {
  id: string;
  /** Approach tile (walkable). */
  tx: number;
  ty: number;
  /** Where the pet lies down (px) and the depth of whoever sits there. */
  x: number;
  y: number;
  sortY?: number;
}

/** The "fetch!" ball: on the ground, in the dog's mouth, or dropped until it vanishes. */
export interface Ball {
  x: number;
  y: number;
  tx: number;
  ty: number;
  carried: boolean;
  /** Vanishes after being dropped (ms). */
  until: number;
}

type Plan =
  | { t: 'wander'; run: boolean }
  | { t: 'visit'; who: string; sleepy: boolean }
  | { t: 'nap' }
  | { t: 'greet'; who: string }
  /** cat: lie on a sofa/armchair/pouf (jumps up at the end of the path) */
  | { t: 'perch'; spot: CozySpot }
  /** dog chasing the cat; the cat fleeing */
  | { t: 'chase' }
  | { t: 'flee' }
  /** cat: climb onto the robot (which is charging) and hitch a ride */
  | { t: 'mount' }
  /** dog: wake whoever is napping with a lick */
  | { t: 'wake'; who: string }
  /** dog: beg for pizza near the party table */
  | { t: 'beg' }
  /** dog: fetch the ball and bring it back to (bx,by) */
  | { t: 'fetch'; bx: number; by: number }
  | { t: 'return' };

export class Pet {
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  left = false;
  /** In profile, from the front or from behind (whoever walks vertically appears from the front or behind). */
  facing: PetFacing = 'side';
  pose: PetPose = 'sit';
  animT = 0;
  icon: IconName | null = null;
  iconUntil = 0;
  /** Path in progress and the index of the next tile. */
  path: number[] = [];
  pi = 0;
  run = false;
  /** Pose after arriving and until when to stay in it. */
  rest: PetPose = 'sit';
  restUntil = 0;
  plan: Plan | null = null;
  /** On top of furniture: drawing depth (like whoever sits there) and the reserved place. */
  sortY: number | undefined = undefined;
  spot: string | null = null;
  /** Riding on the robot vacuum. */
  riding = false;
  readonly rng: () => number;

  constructor(
    readonly id: string,
    readonly kind: PetKind,
    seed: number,
  ) {
    this.rng = mulberry32(seed);
  }

  get moving(): boolean {
    return this.pi < this.path.length;
  }

  depth(): number {
    return this.sortY ?? this.y;
  }

  placeAt(tx: number, ty: number): void {
    this.sortY = undefined;
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE + FOOT_DX;
    this.y = ty * TILE + FOOT_DY;
    this.path.length = 0;
    this.pi = 0;
  }

  setIcon(name: IconName | null, ms: number, now: number): void {
    this.icon = name;
    this.iconUntil = name ? now + ms : 0;
  }

  setPose(p: PetPose): void {
    if (p === 'sit' || p === 'sleep') this.facing = 'side';
    if (p === this.pose) return;
    this.pose = p;
    this.animT = 0;
  }
}

/** A random free tile of the building (no seat), or null. */
export function randomFreeTile(grid: WalkGrid, rng: () => number, tries = 60): { tx: number; ty: number } | null {
  for (let i = 0; i < tries; i++) {
    const tx = Math.floor(rng() * grid.w);
    const ty = Math.floor(rng() * grid.h);
    if (grid.get(tx, ty) === FREE) return { tx, ty };
  }
  return null;
}

/** A free tile near (tx,ty), preferably right next to it (to lie at someone's feet). */
export function nearFreeTile(grid: WalkGrid, tx: number, ty: number, rng: () => number): { tx: number; ty: number } | null {
  const ring: [number, number][] = [];
  for (let r = 1; r <= 2; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && grid.get(tx + dx, ty + dy) === FREE) ring.push([tx + dx, ty + dy]);
  if (!ring.length) return null;
  // those of the first ring come first: draws among the first 3
  const [x, y] = ring[Math.floor(rng() * Math.min(3, ring.length))];
  return { tx: x, ty: y };
}

export class PetHerd {
  readonly pets: Pet[];
  ball: Ball | null = null;
  readonly robot = new Robot();
  private nextThink = new Map<string, number>();
  /** Where the barks, meows and the robot's beeps go (the sim's sound list). */
  sfx: ((kind: SoundCueKind, x: number, y: number) => void) | null = null;

  constructor(seed = 7) {
    this.pets = [new Pet('pet:dog', 'dog', seed ^ 0x9e3779b9), new Pet('pet:cat', 'cat', seed ^ 0x85ebca6b)];
  }

  /** Places the pets on a free tile (at start and after the building changes). */
  place(world: PetWorld): void {
    if (world.robotDock) this.robot.setDock(world, world.robotDock());
    for (const p of this.pets) {
      if (world.grid().get(p.tx, p.ty) === FREE && (p.x || p.y)) continue;
      const t = randomFreeTile(world.grid(), p.rng, 400);
      if (t) p.placeAt(t.tx, t.ty);
    }
  }

  /** The building changed (new or torn-down room): whoever was on a blocked tile moves to another, paths restart. */
  relayout(world: PetWorld): void {
    if (world.robotDock) this.robot.setDock(world, world.robotDock());
    for (const p of this.pets) {
      if (p.riding) this.dismount(p, 0);
      p.path.length = 0;
      p.pi = 0;
      if (world.grid().get(p.tx, p.ty) !== FREE) {
        const t = nearFreeTile(world.grid(), p.tx, p.ty, p.rng) ?? randomFreeTile(world.grid(), p.rng, 400);
        if (t) p.placeAt(t.tx, t.ty);
      }
    }
  }

  /** Fast-forward (hidden tab, back from the city): everyone arrives where they were going. */
  fastForward(now: number): void {
    this.robot.fastForward();
    for (const p of this.pets) {
      if (p.riding) this.dismount(p, now);
      if (p.moving) {
        const i = p.path.length - 2;
        p.placeAt(p.path[i], p.path[i + 1]);
        p.path.length = 0;
        this.arrive(p, now);
      }
      p.restUntil = Math.min(p.restUntil, now);
    }
  }

  /**
   * "Fetch!": the ball lands on tile (tx,ty) and the dog runs to fetch it and brings it back to where it was. Returns
   * whether the ball was thrown (walkable tile and a path to it).
   */
  throwBall(world: PetWorld, tx: number, ty: number, now: number): boolean {
    const dog = this.pets.find((p) => p.kind === 'dog');
    if (!dog || world.grid().get(tx, ty) !== FREE) return false;
    const back = { bx: dog.tx, by: dog.ty };
    this.leaveSpot(world, dog);
    if (!this.goTo(world, dog, tx, ty, true) && !(dog.tx === tx && dog.ty === ty)) return false;
    this.ball = { x: tx * TILE + FOOT_DX, y: ty * TILE + FOOT_DY, tx, ty, carried: false, until: Infinity };
    dog.plan = { t: 'fetch', ...back };
    dog.rest = 'sit';
    dog.restUntil = 0;
    dog.setIcon('alert', 900, now);
    if (!dog.moving) this.arrive(dog, now, world);
    return true;
  }

  /** Someone just delivered a request: the dog runs to celebrate (if it isn't already busy with that). */
  celebrate(world: PetWorld, who: string, now: number): void {
    const dog = this.pets.find((p) => p.kind === 'dog');
    if (!dog || dog.plan?.t === 'greet' || dog.plan?.t === 'fetch' || dog.plan?.t === 'return') return;
    const at = world.personTile(who);
    if (!at) return;
    this.leaveSpot(world, dog);
    if (!this.goNear(world, dog, at.tx, at.ty, true, now)) return;
    this.sfx?.('bark', dog.x, dog.y);
    dog.plan = { t: 'greet', who };
    dog.rest = 'sit';
    dog.restUntil = 0;
  }

  /** Someone has been napping for a long time: the dog goes there to give a lick (world.wake on arrival). Returns whether it went. */
  wakeUp(world: PetWorld, who: string, at: { tx: number; ty: number }, now: number): boolean {
    const dog = this.pets.find((p) => p.kind === 'dog');
    if (!dog || dog.riding || dog.plan?.t === 'fetch' || dog.plan?.t === 'return' || dog.plan?.t === 'wake') return false;
    this.leaveSpot(world, dog);
    if (!this.goNear(world, dog, at.tx, at.ty, true, now)) return false;
    dog.plan = { t: 'wake', who };
    dog.rest = 'sit';
    dog.restUntil = 0;
    return true;
  }

  /** Pizza party: the dog goes to sit near the table, begging for a slice. */
  beg(world: PetWorld, at: { tx: number; ty: number }, now: number): void {
    const dog = this.pets.find((p) => p.kind === 'dog');
    if (!dog || dog.riding || dog.plan?.t === 'fetch' || dog.plan?.t === 'return') return;
    this.leaveSpot(world, dog);
    if (!this.goNear(world, dog, at.tx, at.ty, false, now)) return;
    dog.plan = { t: 'beg' };
    dog.rest = 'sit';
    dog.restUntil = 0;
  }

  /** Gets off the robot right there. */
  private dismount(p: Pet, now: number): void {
    p.riding = false;
    p.sortY = undefined;
    p.placeAt(this.robot.tx, this.robot.ty);
    p.setPose('sit');
    p.restUntil = now + 3_000;
    p.plan = null;
  }

  /** Petting: heart and a little while sitting still (the cat wakes up, the dog wags its tail). */
  pat(id: string, now: number): boolean {
    const p = this.pets.find((x) => x.id === id);
    if (!p) return false;
    p.setIcon('heart', 2400, now);
    this.sfx?.(p.kind === 'dog' ? 'bark' : 'meow', p.x, p.y);
    if (!p.moving) {
      p.setPose('sit');
      p.restUntil = Math.max(p.restUntil, now + 4000);
    }
    return true;
  }

  /** `disco`: whoever is still sits and sways side to side to the beat (without deciding strolls). */
  update(world: PetWorld, dt: number, now: number, disco = false): void {
    if (this.ball && now >= this.ball.until) this.ball = null;
    if (this.robot.dockTile) {
      const was = this.robot.state;
      this.robot.update(world, dt, now);
      const is = this.robot.state;
      if (was === 'charge' && is === 'clean') this.sfx?.('robot_start', this.robot.x, this.robot.y);
      else if (was !== 'charge' && is === 'charge') this.sfx?.('robot_dock', this.robot.x, this.robot.y);
    }
    for (const p of this.pets) {
      if (p.riding) {
        // riding: goes along, sitting on top; gets off after a few laps or when the robot goes back to the dock
        p.animT += dt * 1000;
        p.x = this.robot.x;
        p.y = this.robot.y - 4;
        p.sortY = this.robot.y + 0.5;
        p.left = this.robot.left;
        p.setPose('sit');
        if ((this.robot.legs >= 3 && !this.robot.moving) || this.robot.state === 'home') this.dismount(p, now);
        continue;
      }
      p.animT += dt * 1000;
      if (p.icon && now >= p.iconUntil) p.setIcon(null, 0, now);
      if (disco && !p.moving) {
        p.setPose('sit');
        p.left = Math.floor(now / 400) % 2 === 1;
        continue;
      }
      if (p.moving) {
        this.move(p, dt);
        if (this.ball?.carried && p.kind === 'dog') this.carryBall(p);
        if (!p.moving) this.arrive(p, now, world);
        continue;
      }
      if (now < p.restUntil) continue;
      if (now < (this.nextThink.get(p.id) ?? 0)) continue;
      this.nextThink.set(p.id, now + 500);
      this.think(world, p, now);
    }
  }

  private move(p: Pet, dt: number): void {
    const sp = SPEED[p.kind];
    let budget = (p.run ? sp.run : sp.walk) * TILE * dt;
    while (budget > 0.0001 && p.pi < p.path.length) {
      const gx = p.path[p.pi] * TILE + FOOT_DX;
      const gy = p.path[p.pi + 1] * TILE + FOOT_DY;
      const dx = gx - p.x;
      const dy = gy - p.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01) p.left = dx < 0;
      if (d > 0.01) p.facing = Math.abs(dy) > Math.abs(dx) * 1.2 ? (dy < 0 ? 'up' : 'down') : 'side';
      if (d <= budget) {
        p.x = gx;
        p.y = gy;
        p.tx = p.path[p.pi];
        p.ty = p.path[p.pi + 1];
        p.pi += 2;
        budget -= d;
      } else {
        p.x += (dx / d) * budget;
        p.y += (dy / d) * budget;
        budget = 0;
      }
    }
    p.setPose(p.run ? 'run' : 'walk');
  }

  /** The ball in the dog's mouth (in front of the snout). */
  private carryBall(dog: Pet): void {
    if (!this.ball) return;
    this.ball.x = dog.x + (dog.left ? -9 : 9);
    this.ball.y = dog.y - 6;
  }

  /** Gets off the furniture (if it was on one) and gives back the place. */
  private leaveSpot(world: PetWorld, p: Pet): void {
    if (!p.spot && p.sortY === undefined) return;
    if (p.spot) world.releaseSpot?.(p.spot, p.id);
    p.spot = null;
    p.placeAt(p.tx, p.ty);
  }

  /** Arrived: stays in the resting pose for a time that depends on the plan. */
  private arrive(p: Pet, now: number, world?: PetWorld): void {
    p.path.length = 0;
    p.pi = 0;
    p.run = false;
    const r = p.rng();
    const plan = p.plan;
    let ms: number;
    if (plan?.t === 'fetch' && world) {
      // got the ball: trots back to where it was
      if (this.ball) this.ball.carried = true;
      this.carryBall(p);
      p.plan = { t: 'return' };
      if (this.goTo(world, p, plan.bx, plan.by, false)) return;
    }
    if (p.plan?.t === 'return' || plan?.t === 'return') {
      // drops the ball at the feet, wags its tail
      if (this.ball) {
        this.ball.carried = false;
        this.ball.x = p.x + (p.left ? -7 : 7);
        this.ball.y = p.y;
        this.ball.until = now + 4_000;
      }
      p.setIcon('heart', 2400, now);
      ms = 4_000;
    } else if (plan?.t === 'perch') {
      // hop onto the sofa: lies where people sit, drawn like them
      p.x = plan.spot.x;
      p.y = plan.spot.y + 2;
      p.sortY = plan.spot.sortY;
      p.spot = plan.spot.id;
      ms = 40_000 + r * 40_000;
    } else if (plan?.t === 'mount') {
      const d = this.robot.dockTile;
      if (this.robot.state === 'charge' && d && Math.max(Math.abs(p.tx - d.tx), Math.abs(p.ty - d.ty)) <= 1) {
        p.riding = true;
        p.plan = null;
        p.setIcon('heart', 1500, now);
        return;
      }
      ms = 2_000;
    } else if (plan?.t === 'wake') {
      p.setIcon('heart', 2000, now);
      world?.wake?.(plan.who);
      ms = 3_000;
    } else if (plan?.t === 'beg') {
      p.setIcon('heart', 3000, now);
      ms = 15_000 + r * 10_000;
    } else if (plan?.t === 'chase') {
      p.setIcon('heart', 1800, now);
      ms = 3_000 + r * 3_000;
    } else if (plan?.t === 'flee') {
      p.setIcon('sweat', 1800, now);
      ms = 4_000 + r * 4_000;
    } else if (plan?.t === 'nap') ms = (p.kind === 'cat' ? 30_000 : 18_000) + r * 30_000;
    else if (plan?.t === 'visit') ms = (plan.sleepy ? 25_000 : 12_000) + r * 15_000;
    else if (plan?.t === 'greet') {
      ms = 4_000 + r * 2_000;
      p.setIcon('heart', 2600, now);
    } else ms = 3_000 + r * 6_000;
    p.setPose(p.rest);
    p.restUntil = now + ms;
    p.plan = null;
  }

  private goNear(world: PetWorld, p: Pet, tx: number, ty: number, run: boolean, _now: number): boolean {
    const t = nearFreeTile(world.grid(), tx, ty, p.rng);
    if (!t) return false;
    return this.goTo(world, p, t.tx, t.ty, run);
  }

  private goTo(world: PetWorld, p: Pet, tx: number, ty: number, run: boolean): boolean {
    if (tx === p.tx && ty === p.ty) return false;
    this.leaveSpot(world, p);
    const out: number[] = [];
    if (!world.findPath(p.tx, p.ty, tx, ty, out) || !out.length) return false;
    p.path = out;
    p.pi = 0;
    p.run = run;
    return true;
  }

  /** Decides the next stroll. */
  private think(world: PetWorld, p: Pet, now: number): void {
    const r = p.rng();
    const cat = p.kind === 'cat';
    const resting = world.restingPeople();
    // cat: nap (40%), near someone still (35%, and sleeps next to whoever naps), stroll
    // dog: stroll (50%, sometimes running), visit (30%), nap
    const pNap = cat ? 0.4 : 0.2;
    const pVisit = cat ? 0.35 : 0.3;
    // dog: now and then chases the cat (which runs away), if the cat is idle
    const other = this.pets.find((x) => x !== p);
    if (!cat && other && r > 0.86 && !other.moving && !other.spot && other.plan === null && now >= other.restUntil - 60_000) {
      const t = randomFreeTile(world.grid(), p.rng);
      if (t && this.goTo(world, other, t.tx, t.ty, true)) {
        other.plan = { t: 'flee' };
        other.rest = 'sit';
        other.restUntil = 0;
        other.setIcon('alert', 1200, now);
        this.sfx?.('bark', p.x, p.y);
        if (this.goNear(world, p, t.tx, t.ty, true, now)) {
          p.plan = { t: 'chase' };
          p.rest = 'sit';
        }
        return;
      }
    }
    // cat: climbs onto the charging robot (to hitch a ride)
    // (with the robot on the dock, the urge to climb is much greater: it's ride time)
    const docked = this.robot.state === 'charge' && !!this.robot.dockTile;
    if (cat && docked && r < 0.3) {
      const d = this.robot.dockTile!;
      if (!this.pets.some((x) => x.riding) && this.goNear(world, p, d.tx, d.ty, false, now)) {
        p.plan = { t: 'mount' };
        p.rest = 'sit';
        return;
      }
    }
    // cat: half the naps are on a sofa, armchair or pouf
    if (cat && r >= pVisit && r < pVisit + pNap && p.rng() < 0.5 && world.cozySpot) {
      const spot = world.cozySpot(p.id, p.rng);
      if (spot) {
        if (this.goTo(world, p, spot.tx, spot.ty, false) || (p.tx === spot.tx && p.ty === spot.ty)) {
          p.plan = { t: 'perch', spot };
          p.rest = 'sleep';
          if (!p.moving) this.arrive(p, now, world);
          return;
        }
        world.releaseSpot?.(spot.id, p.id);
      }
    }
    if (r < pVisit && resting.length) {
      const who = resting[Math.floor(p.rng() * resting.length)];
      if (this.goNear(world, p, who.tx, who.ty, false, now)) {
        const sleepy = who.asleep;
        p.plan = { t: 'visit', who: who.id, sleepy };
        p.rest = sleepy || (cat && p.rng() < 0.5) ? 'sleep' : 'sit';
        return;
      }
    }
    if (r < pVisit + pNap) {
      const t = randomFreeTile(world.grid(), p.rng);
      if (t && this.goTo(world, p, t.tx, t.ty, false)) {
        p.plan = { t: 'nap' };
        p.rest = 'sleep';
        return;
      }
      // no new place: naps right there
      p.plan = { t: 'nap' };
      p.rest = 'sleep';
      this.arrive(p, now);
      return;
    }
    const t = randomFreeTile(world.grid(), p.rng);
    const run = !cat && p.rng() < 0.25;
    if (t && this.goTo(world, p, t.tx, t.ty, run)) {
      p.plan = { t: 'wander', run };
      p.rest = 'sit';
      return;
    }
    p.restUntil = now + 2_000;
  }
}
