// Robot vacuum: roams the building cleaning tile by tile, with the battery draining; with low battery (the light turns
// orange, blinking) it returns to the dock and charges (blue light). Sometimes the cat climbs on it while it charges and
// rides along on the next lap (sim/pets.ts). Movement by dt and seeded draws, like the pets.
import { TILE } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { FOOT_DX, FOOT_DY } from '../constants';
import { FREE } from '../path/grid';
import { randomFreeTile, type PetWorld } from './pets';

/** Tiles per second (slow, like a real vacuum). */
const SPEED = 1.3;
/** Battery drained per second walking (full lasts about 3 min) and recharged per second at the dock (about 40 s). */
const DRAIN = 1 / 180;
const CHARGE = 1 / 40;
const LOW = 0.15;
/** At the dock, it stays at least this long (charging and resting) before leaving again. */
const DOCK_REST_MS = 70_000;

export type RobotState = 'clean' | 'home' | 'charge';

export class Robot {
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  left = false;
  battery = 1;
  state: RobotState = 'charge';
  path: number[] = [];
  pi = 0;
  /** Stopped (turning, "thinking") until. */
  pauseUntil = 0;
  /** Cleaning laps since it left the dock (the cat gets off after a few). */
  legs = 0;
  animT = 0;
  private dock: { tx: number; ty: number } | null = null;
  private readonly rng: () => number;

  constructor(seed = 13) {
    this.rng = mulberry32(seed ^ 0x27d4eb2f);
  }

  get moving(): boolean {
    return this.pi < this.path.length;
  }

  /** Dock tile (for drawing and for the cat), or null if the building has no room for it. */
  get dockTile(): { tx: number; ty: number } | null {
    return this.dock;
  }

  get led(): 'green' | 'orange' | 'blue' {
    return this.state === 'charge' ? 'blue' : this.battery < LOW + 0.05 ? 'orange' : 'green';
  }

  placeAt(tx: number, ty: number): void {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE + FOOT_DX;
    this.y = ty * TILE + FOOT_DY;
    this.path.length = 0;
    this.pi = 0;
  }

  /** Dock at the requested tile (or nearby) and the robot on it, charging. Called at start and when the building changes. */
  setDock(world: PetWorld, want: { tx: number; ty: number } | null): void {
    const grid = world.grid();
    let d = want && grid.get(want.tx, want.ty) === FREE ? want : null;
    d ??= randomFreeTile(grid, this.rng, 400);
    this.dock = d;
    if (!d) return;
    if (this.state === 'charge' || grid.get(this.tx, this.ty) !== FREE || (!this.x && !this.y)) {
      this.placeAt(d.tx, d.ty);
      this.state = 'charge';
      // at start, a little while on the dock before the first lap
      if (!this.pauseUntil) this.pauseUntil = -1;
    } else {
      this.path.length = 0;
      this.pi = 0;
    }
  }

  update(world: PetWorld, dt: number, now: number): void {
    this.animT += dt * 1000;
    if (this.state === 'charge') {
      // first time (pauseUntil -1): the initial rest counts from now
      if (this.pauseUntil < 0) this.pauseUntil = now + DOCK_REST_MS * 0.6;
      this.battery = Math.min(1, this.battery + CHARGE * dt);
      if (this.battery >= 1 && now >= this.pauseUntil) {
        this.state = 'clean';
        this.legs = 0;
        this.nextLeg(world, now);
      }
      return;
    }
    if (this.moving) {
      this.battery = Math.max(0, this.battery - DRAIN * dt);
      this.move(dt);
      if (!this.moving) this.arrive(world, now);
      return;
    }
    if (now < this.pauseUntil) return;
    if (this.state === 'clean' && this.battery < LOW) this.goHome(world);
    else if (this.state === 'clean') this.nextLeg(world, now);
    else this.goHome(world);
  }

  /** Fast-forward: arrives where it was going. */
  fastForward(): void {
    if (!this.moving) return;
    const i = this.path.length - 2;
    this.placeAt(this.path[i], this.path[i + 1]);
    if (this.state === 'home') this.state = 'charge';
  }

  private move(dt: number): void {
    let budget = SPEED * TILE * dt;
    while (budget > 0.0001 && this.pi < this.path.length) {
      const gx = this.path[this.pi] * TILE + FOOT_DX;
      const gy = this.path[this.pi + 1] * TILE + FOOT_DY;
      const dx = gx - this.x;
      const dy = gy - this.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01) this.left = dx < 0;
      if (d <= budget) {
        this.x = gx;
        this.y = gy;
        this.tx = this.path[this.pi];
        this.ty = this.path[this.pi + 1];
        this.pi += 2;
        budget -= d;
      } else {
        this.x += (dx / d) * budget;
        this.y += (dy / d) * budget;
        budget = 0;
      }
    }
  }

  private arrive(world: PetWorld, now: number): void {
    this.path.length = 0;
    this.pi = 0;
    if (this.state === 'home' && this.dock && this.tx === this.dock.tx && this.ty === this.dock.ty) {
      this.state = 'charge';
      // charges (about 35 s) and still rests a bit on the dock
      this.pauseUntil = now + DOCK_REST_MS;
      return;
    }
    this.legs++;
    // spins a bit before the next lap
    this.pauseUntil = now + 600 + this.rng() * 1200;
    void world;
  }

  private nextLeg(world: PetWorld, now: number): void {
    const grid = world.grid();
    // nearby: a few tiles in some direction, like a vacuum zigzagging
    for (let i = 0; i < 12; i++) {
      const tx = this.tx + Math.round((this.rng() * 2 - 1) * 8);
      const ty = this.ty + Math.round((this.rng() * 2 - 1) * 5);
      if (grid.get(tx, ty) !== FREE || (tx === this.tx && ty === this.ty)) continue;
      if (this.goTo(world, tx, ty)) return;
    }
    const t = randomFreeTile(grid, this.rng);
    if (!t || !this.goTo(world, t.tx, t.ty)) this.pauseUntil = now + 2_000;
  }

  private goHome(world: PetWorld): void {
    this.state = 'home';
    const d = this.dock;
    if (!d) {
      this.state = 'charge';
      return;
    }
    if (this.tx === d.tx && this.ty === d.ty) {
      this.state = 'charge';
      return;
    }
    if (!this.goTo(world, d.tx, d.ty)) {
      // no path (building changed): appears at the dock
      this.placeAt(d.tx, d.ty);
      this.state = 'charge';
    }
  }

  private goTo(world: PetWorld, tx: number, ty: number): boolean {
    const out: number[] = [];
    if (!world.findPath(this.tx, this.ty, tx, ty, out) || !out.length) return false;
    this.path = out;
    this.pi = 0;
    return true;
  }
}
