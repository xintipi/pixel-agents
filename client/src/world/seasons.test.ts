// Street trees through the year: species by seed, the month's look and what falls from them.
import { describe, expect, it } from 'vitest';
import { fallingAt, fallingColors, treeLook, treeSpecies } from './seasons';

const seedOf = (sp: 'phuong' | 'banglang' | 'plain') => [0, 1, 2, 3, 4].find((s) => treeSpecies(s) === sp)!;

describe('street trees through the year', () => {
  it('phượng flowers red in early summer, bằng lăng purple in late spring', () => {
    expect(treeLook(6, seedOf('phuong'))).toBe('phuong');
    expect(treeLook(9, seedOf('phuong'))).toBe('green');
    expect(treeLook(4, seedOf('banglang'))).toBe('banglang');
    expect(treeLook(7, seedOf('banglang'))).toBe('green');
    expect(treeLook(6, seedOf('plain'))).toBe('green');
  });

  it('new leaves in spring for every species; yellow leaves in autumn, except the phượng (the street stays mixed)', () => {
    for (const sp of ['phuong', 'banglang', 'plain'] as const) {
      expect(treeLook(3, seedOf(sp))).toBe('spring');
      expect(treeLook(1, seedOf(sp))).toBe('green');
    }
    expect(treeLook(10, seedOf('plain'))).toBe('autumn');
    expect(treeLook(11, seedOf('banglang'))).toBe('autumn');
    expect(treeLook(10, seedOf('phuong'))).toBe('green');
  });

  it('petals and leaves fall only from flowering or autumn trees, near the tree and fading in and out', () => {
    expect(fallingColors('green')).toBeNull();
    expect(fallingColors('spring')).toBeNull();
    expect(fallingColors('autumn')?.length).toBeGreaterThan(0);
    const tree = { x: 100, y: 200, seed: 12345 };
    for (let t = 0; t < 20_000; t += 700) {
      const f = fallingAt(tree, 0, t);
      expect(Math.abs(f.x - tree.x)).toBeLessThan(30);
      expect(f.y).toBeGreaterThanOrEqual(tree.y - 34);
      expect(f.y).toBeLessThanOrEqual(tree.y + 6);
      expect(f.alpha).toBeGreaterThanOrEqual(0);
      expect(f.alpha).toBeLessThanOrEqual(1);
    }
  });
});
