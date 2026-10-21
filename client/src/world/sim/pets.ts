// Bichos do escritório: um cachorro e um gato que andam pelo prédio por conta própria. Não são agentes (ficam fora de
// sim.chars: sem snapshot, sem lugar reservado, sem rótulo nem balão). O gato cochila muito, gosta de ficar perto
// de quem está parado na mesa e dorme ao lado de quem cochila; o cachorro passeia mais, às vezes corre, e vai
// correndo comemorar com quem acabou de entregar um pedido. Um clique faz carinho (coração). Movimento por dt e
// sorteios com semente: reproduzível nos testes, no timelapse e no avanço rápido.
import type { IconName } from '../../art/api';
import { TILE } from '../../art/api';
import type { PetKind, PetPose } from '../../art/pets';
import { mulberry32 } from '../../../../shared/hash';
import { FOOT_DX, FOOT_DY } from '../constants';
import { FREE, type WalkGrid } from '../path/grid';

/** Velocidades (tiles/s). */
const SPEED: Readonly<Record<PetKind, { walk: number; run: number }>> = {
  dog: { walk: 2.6, run: 6.5 },
  cat: { walk: 1.8, run: 5 },
};

/** O que o prédio oferece aos bichos (o Sim implementa; nos testes, um falso). */
export interface PetWorld {
  grid(): WalkGrid;
  /** Caminho de tiles (x,y achatados, sem a origem) ou false. */
  findPath(sx: number, sy: number, gx: number, gy: number, out: number[]): boolean;
  /** Pessoas paradas na própria mesa (tile do lugar; `asleep`: cochilando). */
  restingPeople(): { id: string; tx: number; ty: number; asleep: boolean }[];
  /** Tile de uma pessoa presente (para ir comemorar), ou null. */
  personTile(id: string): { tx: number; ty: number } | null;
}

type Plan = { t: 'wander'; run: boolean } | { t: 'visit'; who: string; sleepy: boolean } | { t: 'nap' } | { t: 'greet'; who: string };

export class Pet {
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  left = false;
  pose: PetPose = 'sit';
  animT = 0;
  icon: IconName | null = null;
  iconUntil = 0;
  /** Caminho em andamento e o índice do próximo tile. */
  path: number[] = [];
  pi = 0;
  run = false;
  /** Pose depois de chegar e até quando ficar nela. */
  rest: PetPose = 'sit';
  restUntil = 0;
  plan: Plan | null = null;
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

  placeAt(tx: number, ty: number): void {
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
    if (p === this.pose) return;
    this.pose = p;
    this.animT = 0;
  }
}

/** Um tile livre aleatório do prédio (sem assento), ou null. */
export function randomFreeTile(grid: WalkGrid, rng: () => number, tries = 60): { tx: number; ty: number } | null {
  for (let i = 0; i < tries; i++) {
    const tx = Math.floor(rng() * grid.w);
    const ty = Math.floor(rng() * grid.h);
    if (grid.get(tx, ty) === FREE) return { tx, ty };
  }
  return null;
}

/** Um tile livre perto de (tx,ty), de preferência logo ao lado (para deitar aos pés de alguém). */
export function nearFreeTile(grid: WalkGrid, tx: number, ty: number, rng: () => number): { tx: number; ty: number } | null {
  const ring: [number, number][] = [];
  for (let r = 1; r <= 2; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && grid.get(tx + dx, ty + dy) === FREE) ring.push([tx + dx, ty + dy]);
  if (!ring.length) return null;
  // os do primeiro anel vêm antes: sorteia entre os 3 primeiros
  const [x, y] = ring[Math.floor(rng() * Math.min(3, ring.length))];
  return { tx: x, ty: y };
}

export class PetHerd {
  readonly pets: Pet[];
  private nextThink = new Map<string, number>();

  constructor(seed = 7) {
    this.pets = [new Pet('pet:dog', 'dog', seed ^ 0x9e3779b9), new Pet('pet:cat', 'cat', seed ^ 0x85ebca6b)];
  }

  /** Coloca os bichos num tile livre (início e depois de o prédio mudar). */
  place(world: PetWorld): void {
    for (const p of this.pets) {
      if (world.grid().get(p.tx, p.ty) === FREE && (p.x || p.y)) continue;
      const t = randomFreeTile(world.grid(), p.rng, 400);
      if (t) p.placeAt(t.tx, t.ty);
    }
  }

  /** O prédio mudou (sala nova ou desmontada): quem ficou num tile bloqueado vai para outro, os caminhos recomeçam. */
  relayout(world: PetWorld): void {
    for (const p of this.pets) {
      p.path.length = 0;
      p.pi = 0;
      if (world.grid().get(p.tx, p.ty) !== FREE) {
        const t = nearFreeTile(world.grid(), p.tx, p.ty, p.rng) ?? randomFreeTile(world.grid(), p.rng, 400);
        if (t) p.placeAt(t.tx, t.ty);
      }
    }
  }

  /** Avanço rápido (aba escondida, volta da cidade): todo mundo chega aonde ia. */
  fastForward(now: number): void {
    for (const p of this.pets) {
      if (p.moving) {
        const i = p.path.length - 2;
        p.placeAt(p.path[i], p.path[i + 1]);
        p.setPose(p.rest);
      }
      p.restUntil = Math.min(p.restUntil, now);
    }
  }

  /** Alguém acabou de entregar um pedido: o cachorro vai correndo comemorar (se não estiver ocupado com isso). */
  celebrate(world: PetWorld, who: string, now: number): void {
    const dog = this.pets.find((p) => p.kind === 'dog');
    if (!dog || dog.plan?.t === 'greet') return;
    const at = world.personTile(who);
    if (!at) return;
    if (!this.goNear(world, dog, at.tx, at.ty, true, now)) return;
    dog.plan = { t: 'greet', who };
    dog.rest = 'sit';
    dog.restUntil = 0;
  }

  /** Carinho: coração e um tempinho parado sentado (o gato acorda, o cachorro abana o rabo). */
  pat(id: string, now: number): boolean {
    const p = this.pets.find((x) => x.id === id);
    if (!p) return false;
    p.setIcon('heart', 2400, now);
    if (!p.moving) {
      p.setPose('sit');
      p.restUntil = Math.max(p.restUntil, now + 4000);
    }
    return true;
  }

  update(world: PetWorld, dt: number, now: number): void {
    for (const p of this.pets) {
      p.animT += dt * 1000;
      if (p.icon && now >= p.iconUntil) p.setIcon(null, 0, now);
      if (p.moving) {
        this.move(p, dt);
        if (!p.moving) this.arrive(p, now);
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

  /** Chegou: fica na pose de descanso por um tempo que depende do plano. */
  private arrive(p: Pet, now: number): void {
    p.path.length = 0;
    p.pi = 0;
    p.run = false;
    const r = p.rng();
    const plan = p.plan;
    let ms: number;
    if (plan?.t === 'nap') ms = (p.kind === 'cat' ? 30_000 : 18_000) + r * 30_000;
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
    const out: number[] = [];
    if (!world.findPath(p.tx, p.ty, tx, ty, out) || !out.length) return false;
    p.path = out;
    p.pi = 0;
    p.run = run;
    return true;
  }

  /** Decide o próximo passeio. */
  private think(world: PetWorld, p: Pet, now: number): void {
    const r = p.rng();
    const cat = p.kind === 'cat';
    const resting = world.restingPeople();
    // gato: cochilo (40%), perto de alguém parado (35%, e dorme junto de quem cochila), passeio
    // cachorro: passeio (50%, às vezes correndo), visita (30%), cochilo
    const pNap = cat ? 0.4 : 0.2;
    const pVisit = cat ? 0.35 : 0.3;
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
      // sem lugar novo: cochila ali mesmo
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
