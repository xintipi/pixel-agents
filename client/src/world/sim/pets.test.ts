import { describe, expect, it } from 'vitest';
import { PET_FRAMES, PET_POSES, renderPet } from '../../art/pets';
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
  it('todas as poses e quadros dos dois bichos, dentro da folha e com margem transparente', () => {
    for (const kind of ['dog', 'cat'] as const) {
      for (const pose of PET_POSES) {
        for (let f = 0; f < PET_FRAMES; f++) {
          for (const left of [false, true]) {
            const { buf, ax, ay } = renderPet(kind, pose, f, left);
            const b = buf.bounds()!;
            expect(buf.countOpaque(), `${kind} ${pose} ${f}`).toBeGreaterThan(30);
            expect(b.x).toBeGreaterThan(0);
            expect(b.x + b.w).toBeLessThan(buf.w);
            expect(b.y + b.h).toBeLessThanOrEqual(ay + 1);
            expect(ax).toBe(buf.w / 2);
          }
        }
      }
    }
  });

  it('os dois quadros de cada pose são diferentes (há animação)', () => {
    for (const kind of ['dog', 'cat'] as const) {
      for (const pose of PET_POSES) {
        const a = renderPet(kind, pose, 0).buf.data;
        const b = renderPet(kind, pose, 1).buf.data;
        expect(a.some((v, i) => v !== b[i]), `${kind} ${pose}`).toBe(true);
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
    // em algum momento cochilaram ou sentaram
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
    // quem não está no escritório: nada
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

  it('nearFreeTile acha um vizinho livre, ou nada num lugar fechado', () => {
    const w = world();
    const t = nearFreeTile(w.grid(), 5, 5, () => 0)!;
    expect(Math.max(Math.abs(t.tx - 5), Math.abs(t.ty - 5))).toBe(1);
    const closed = new WalkGrid(5, 5);
    expect(nearFreeTile(closed, 2, 2, () => 0)).toBeNull();
  });
});
