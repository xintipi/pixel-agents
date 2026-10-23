// Moths around the bulbs (pure): the orbit stays close to the bulb, moves, flaps and is deterministic.
import { describe, expect, it } from 'vitest';
import { makeMoths, mothOffset, type MothPos } from './moths';

const pos = (): MothPos => ({ dx: 0, dy: 0, front: false, wings: false });

describe('moths', () => {
  it('builds the same moths from the same seed', () => {
    expect(makeMoths(7, 4)).toEqual(makeMoths(7, 4));
    expect(makeMoths(7, 4)).not.toEqual(makeMoths(8, 4));
    expect(makeMoths(1, 3)).toHaveLength(3);
  });

  it('keeps every moth in a small orbit around the bulb', () => {
    for (const m of makeMoths(42, 4)) {
      for (let t = 0; t < 60; t += 0.037) {
        const p = mothOffset(m, t, 1, pos());
        expect(Math.abs(p.dx)).toBeLessThanOrEqual(m.r + 1.5 + 1e-9);
        expect(Math.abs(p.dy)).toBeLessThanOrEqual(m.r * m.ry + 1.5 + 1e-9);
      }
    }
  });

  it('scales the orbit (the small bulb of the cart)', () => {
    const [m] = makeMoths(3, 1);
    const a = mothOffset(m, 1.3, 1, pos());
    const b = mothOffset(m, 1.3, 0.5, pos());
    expect(b.dx).toBeCloseTo(a.dx / 2);
    expect(b.dy).toBeCloseTo(a.dy / 2);
  });

  it('flutters: moves around, goes in front and behind, beats its wings', () => {
    const [m] = makeMoths(5, 1);
    const xs = new Set<number>();
    let front = 0;
    let wings = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const p = mothOffset(m, i * 0.05, 1, pos());
      xs.add(Math.round(p.dx));
      if (p.front) front++;
      if (p.wings) wings++;
    }
    expect(xs.size).toBeGreaterThan(4);
    expect(front).toBeGreaterThan(N * 0.2);
    expect(front).toBeLessThan(N * 0.8);
    expect(wings).toBeGreaterThan(N * 0.2);
    expect(wings).toBeLessThan(N * 0.8);
  });

  it('writes into the given object (no allocation per frame)', () => {
    const [m] = makeMoths(9, 1);
    const out = pos();
    expect(mothOffset(m, 2, 1, out)).toBe(out);
  });
});
