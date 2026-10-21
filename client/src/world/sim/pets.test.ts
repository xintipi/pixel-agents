import { describe, expect, it } from 'vitest';
import { PET_FACINGS, PET_FRAME_COUNT, PET_POSES, renderPet } from '../../art/pets';
import { FREE, WalkGrid } from '../path/grid';
import { PathFinder } from '../path/astar';
import { PetHerd, nearFreeTile, type PetWorld } from './pets';

function world(w = 20, h = 12, resting: ReturnType<PetWorld['restingPeople']> = []): PetWorld & { finder: PathFinder } {
  const grid = new WalkGrid(w, h);
  grid.fill(1, 1, w - 2, h - 2, FREE);
  const finder = new PathFinder(grid);
  return {
    finder,
    grid: () => grid,
    findPath: (sx, sy, gx, gy, out) => finder.find(sx, sy, gx, gy, out),
    restingPeople: () => resting,
    personTile: (id) => (id === 'ana' ? { tx: 15, ty: 8 } : null),
  };
}

const run = (herd: PetHerd, w: PetWorld, seconds: number, t0 = 0) => {
  let now = t0;
  for (let i = 0; i < seconds * 30; i++) {
    now += 1000 / 30;
    herd.update(w, 1 / 30, now);
  }
  return now;
};

describe('bichos do escritório: arte', () => {
  it('todas as poses, quadros e vistas dos dois bichos, dentro da folha e com margem transparente', () => {
    for (const kind of ['dog', 'cat'] as const) {
      for (const pose of PET_POSES) {
        for (const facing of PET_FACINGS) {
          for (let f = 0; f < PET_FRAME_COUNT[pose]; f++) {
            for (const left of [false, true]) {
              const { buf, ax, ay } = renderPet(kind, pose, f, left, facing);
              const b = buf.bounds()!;
              expect(buf.countOpaque(), `${kind} ${pose} ${facing} ${f}`).toBeGreaterThan(30);
              expect(b.x, `${kind} ${pose} ${facing} ${f}`).toBeGreaterThan(0);
              expect(b.y).toBeGreaterThan(0);
              expect(b.x + b.w, `${kind} ${pose} ${facing} ${f}`).toBeLessThan(buf.w);
              expect(b.y + b.h).toBeLessThanOrEqual(ay + 1);
              expect(ax).toBe(buf.w / 2);
            }
          }
        }
      }
    }
  });

  it('andar e correr têm passada (quadros diferentes) em todas as vistas; frente e costas são outro desenho', () => {
    for (const kind of ['dog', 'cat'] as const) {
      for (const pose of PET_POSES) {
        for (const facing of PET_FACINGS) {
          const a = renderPet(kind, pose, 0, false, facing).buf.data;
          const b = renderPet(kind, pose, 1, false, facing).buf.data;
          expect(a.some((v, i) => v !== b[i]), `${kind} ${pose} ${facing}`).toBe(true);
        }
      }
      const side = renderPet(kind, 'walk', 0, false, 'side').buf.data;
      for (const facing of ['down', 'up'] as const) {
        const other = renderPet(kind, 'walk', 0, false, facing).buf.data;
        expect(side.some((v, i) => v !== other[i])).toBe(true);
      }
    }
  });
});

describe('bichos do escritório: comportamento', () => {
  it('nascem num tile livre e passeiam pelo prédio, sempre em tiles livres', () => {
    const w = world();
    const herd = new PetHerd(3);
    herd.place(w);
    const start = herd.pets.map((p) => [p.tx, p.ty]);
    for (const p of herd.pets) expect(w.grid().get(p.tx, p.ty)).toBe(FREE);
    let now = 0;
    const visited = new Set<string>();
    for (let i = 0; i < 300 * 30; i++) {
      now += 1000 / 30;
      herd.update(w, 1 / 30, now);
      for (const p of herd.pets) {
        expect(w.grid().get(p.tx, p.ty)).toBe(FREE);
        visited.add(`${p.id}:${p.tx},${p.ty}`);
      }
    }
    expect(herd.pets.map((p) => [p.tx, p.ty])).not.toEqual(start);
    expect(visited.size).toBeGreaterThan(6);
    // at some point they napped or sat
    expect(herd.pets.every((p) => ['walk', 'run', 'sit', 'sleep'].includes(p.pose))).toBe(true);
  });

  it('a mesma semente faz o mesmo passeio (timelapse e testes reproduzíveis)', () => {
    const a = new PetHerd(9);
    const b = new PetHerd(9);
    const wa = world();
    const wb = world();
    a.place(wa);
    b.place(wb);
    run(a, wa, 90);
    run(b, wb, 90);
    expect(a.pets.map((p) => [p.x, p.y, p.pose])).toEqual(b.pets.map((p) => [p.x, p.y, p.pose]));
  });

  it('o gato vai para perto de quem está parado na mesa', () => {
    const w = world(20, 12, [{ id: 'bia', tx: 4, ty: 4, asleep: true }]);
    const herd = new PetHerd(5);
    herd.place(w);
    const cat = herd.pets.find((p) => p.kind === 'cat')!;
    let near = false;
    let now = 0;
    for (let i = 0; i < 600 * 30 && !near; i++) {
      now += 1000 / 30;
      herd.update(w, 1 / 30, now);
      near = !cat.moving && Math.max(Math.abs(cat.tx - 4), Math.abs(cat.ty - 4)) <= 2 && cat.pose === 'sleep';
    }
    expect(near).toBe(true);
  });

  it('quem entrega um pedido ganha a visita do cachorro, correndo, e um coração', () => {
    const w = world();
    const herd = new PetHerd(1);
    herd.place(w);
    const dog = herd.pets.find((p) => p.kind === 'dog')!;
    dog.placeAt(2, 2);
    herd.celebrate(w, 'ana', 0);
    expect(dog.run).toBe(true);
    const now = run(herd, w, 6);
    expect(Math.max(Math.abs(dog.tx - 15), Math.abs(dog.ty - 8))).toBeLessThanOrEqual(2);
    expect(dog.icon === 'heart' || now > dog.iconUntil).toBe(true);
    // whoever isn't in the office: nothing
    const before = [dog.tx, dog.ty];
    herd.celebrate(w, 'ninguem', now);
    expect([dog.tx, dog.ty]).toEqual(before);
  });

  it('carinho: coração e sentadinho; avanço rápido leva ao destino', () => {
    const w = world();
    const herd = new PetHerd(2);
    herd.place(w);
    const cat = herd.pets.find((p) => p.kind === 'cat')!;
    expect(herd.pat('pet:cat', 100)).toBe(true);
    expect(cat.icon).toBe('heart');
    expect(herd.pat('pet:peixe', 100)).toBe(false);
    const dog = herd.pets.find((p) => p.kind === 'dog')!;
    dog.placeAt(2, 2);
    herd.celebrate(w, 'ana', 200);
    expect(dog.moving).toBe(true);
    herd.fastForward(300);
    expect(dog.moving).toBe(false);
    expect(Math.max(Math.abs(dog.tx - 15), Math.abs(dog.ty - 8))).toBeLessThanOrEqual(2);
  });

  it('pega!: o cachorro corre até a bola, traz de volta na boca, larga e a bola some', () => {
    const w = world();
    const herd = new PetHerd(4);
    herd.place(w);
    const dog = herd.pets.find((p) => p.kind === 'dog')!;
    dog.placeAt(3, 3);
    expect(herd.throwBall(w, 0, 0, 0)).toBe(false); // wall
    expect(herd.throwBall(w, 16, 9, 0)).toBe(true);
    expect(dog.run).toBe(true);
    let now = 0;
    let carried = false;
    let droppedAt: number[] | null = null;
    for (let i = 0; i < 30 * 30 && !droppedAt; i++) {
      now += 1000 / 30;
      herd.update(w, 1 / 30, now);
      if (herd.ball?.carried) carried = true;
      else if (carried && herd.ball) droppedAt = [dog.tx, dog.ty];
    }
    expect(carried).toBe(true);
    expect(droppedAt).toEqual([3, 3]);
    expect(dog.icon).toBe('heart');
    now = run(herd, w, 6, now);
    expect(herd.ball).toBeNull();
  });

  it('o gato deita no sofá (reservado, desenhado como quem senta ali) e devolve o lugar quando sai', () => {
    const reserved = new Set<string>();
    const w: PetWorld = {
      ...world(),
      cozySpot: (by) => (reserved.has('sofa1') ? null : (reserved.add('sofa1'), { id: 'sofa1', tx: 6, ty: 5, x: 6 * 16 + 8, y: 4 * 16 + 10, sortY: 4 * 16 + 12 })),
      releaseSpot: (id) => void reserved.delete(id),
    };
    const herd = new PetHerd(11);
    herd.place(w);
    const cat = herd.pets.find((p) => p.kind === 'cat')!;
    let perched = false;
    let now = 0;
    for (let i = 0; i < 900 * 30 && !perched; i++) {
      now += 1000 / 30;
      herd.update(w, 1 / 30, now);
      perched = cat.spot === 'sofa1' && !cat.moving;
    }
    expect(perched).toBe(true);
    expect(cat.sortY).toBe(4 * 16 + 12);
    expect(cat.pose).toBe('sleep');
    expect(reserved.has('sofa1')).toBe(true);
    // goes away (ball, celebration...): gets down and gives back the spot
    herd.celebrate(w, 'ana', now);
    (herd as unknown as { leaveSpot(w: PetWorld, p: typeof cat): void }).leaveSpot(w, cat);
    expect(cat.spot).toBeNull();
    expect(cat.sortY).toBeUndefined();
    expect(reserved.has('sofa1')).toBe(false);
  });

  it('de vez em quando o cachorro corre atrás do gato', () => {
    const w = world(30, 14);
    const herd = new PetHerd(6);
    herd.place(w);
    let chased = false;
    let now = 0;
    for (let i = 0; i < 1800 * 30 && !chased; i++) {
      now += 1000 / 30;
      herd.update(w, 1 / 30, now);
      chased = herd.pets.some((p) => p.plan?.t === 'chase') && herd.pets.some((p) => p.plan?.t === 'flee' && p.run);
    }
    expect(chased).toBe(true);
  });

  it('robô: limpa, gasta bateria, volta para a base e carrega; o gato pega carona', () => {
    const w: PetWorld = { ...world(24, 14), robotDock: () => ({ tx: 2, ty: 2 }) };
    const herd = new PetHerd(8);
    herd.place(w);
    const robot = herd.robot;
    expect(robot.state).toBe('charge');
    expect([robot.tx, robot.ty]).toEqual([2, 2]);
    const states = new Set<string>();
    let rode = false;
    let now = 0;
    for (let i = 0; i < 1800 * 30; i++) {
      now += 1000 / 30;
      herd.update(w, 1 / 30, now);
      states.add(robot.state);
      if (herd.pets.some((p) => p.riding)) rode = true;
      expect(robot.battery).toBeGreaterThanOrEqual(0);
    }
    expect(states).toEqual(new Set(['charge', 'clean', 'home']));
    expect(rode).toBe(true);
  });

  it('o cachorro vai acordar quem cochila (avisa na chegada) e pede pizza perto da mesa', () => {
    const woken: string[] = [];
    const w: PetWorld = { ...world(), wake: (id) => void woken.push(id) };
    const herd = new PetHerd(3);
    herd.place(w);
    const dog = herd.pets.find((p) => p.kind === 'dog')!;
    dog.placeAt(2, 2);
    expect(herd.wakeUp(w, 'ana', { tx: 14, ty: 8 }, 0)).toBe(true);
    run(herd, w, 8);
    expect(woken).toEqual(['ana']);
    herd.beg(w, { tx: 5, ty: 5 }, 10_000);
    run(herd, w, 8, 10_000);
    expect(Math.max(Math.abs(dog.tx - 5), Math.abs(dog.ty - 5))).toBeLessThanOrEqual(2);
  });

  it('nearFreeTile acha um vizinho livre, ou nada num lugar fechado', () => {
    const w = world();
    const t = nearFreeTile(w.grid(), 5, 5, () => 0)!;
    expect(Math.max(Math.abs(t.tx - 5), Math.abs(t.ty - 5))).toBe(1);
    const closed = new WalkGrid(5, 5);
    expect(nearFreeTile(closed, 2, 2, () => 0)).toBeNull();
  });
});
