// Street trees through the year (Hà Nội): each outdoor tree has a fixed species by its seed (phượng, bằng lăng or a plain
// shade tree) and the real month decides its look: phượng red in early summer, bằng lăng purple in late spring, new
// light-green leaves in spring, yellow leaves falling in autumn. Pure (no DOM): the renderer draws what this decides.

export type TreeLook = 'green' | 'spring' | 'phuong' | 'banglang' | 'autumn';

export type TreeSpecies = 'phuong' | 'banglang' | 'plain';

/** Species of a tree by its seed: about 2 in 5 are phượng, 1 in 5 bằng lăng, the rest plain shade trees. */
export function treeSpecies(seed: number): TreeSpecies {
  const k = (seed >>> 0) % 5;
  return k < 2 ? 'phuong' : k === 2 ? 'banglang' : 'plain';
}

/** Look of a tree in a month (1–12). */
export function treeLook(month: number, seed: number): TreeLook {
  const sp = treeSpecies(seed);
  if (sp === 'phuong' && month >= 5 && month <= 7) return 'phuong';
  if (sp === 'banglang' && month >= 4 && month <= 6) return 'banglang';
  if (month === 2 || month === 3) return 'spring';
  // autumn yellows the shade trees and the bằng lăng; the phượng keep their green (the street stays mixed)
  if ((month === 10 || month === 11) && sp !== 'phuong') return 'autumn';
  return 'green';
}

/** What falls from a tree with this look (petals or leaves), or null if nothing does. */
export function fallingColors(look: TreeLook): readonly string[] | null {
  switch (look) {
    case 'phuong':
      return ['#e8402e', '#ff6a3d'];
    case 'banglang':
      return ['#a77be0', '#c9a2f0'];
    case 'autumn':
      return ['#e8b23c', '#d9862f', '#f2cf5c'];
    default:
      return null;
  }
}

/** Petal/leaf `k` of a tree at time `now` (ms): drifts down from the canopy, swaying, and starts over. */
export function fallingAt(tree: { x: number; y: number; seed: number }, k: number, now: number): { x: number; y: number; alpha: number } {
  const period = 5_000 + ((tree.seed >>> 3) % 7) * 400;
  const ph = (((now + k * 2_300 + ((tree.seed >>> 0) % 997) * 7) / period) % 1 + 1) % 1;
  const startX = tree.x - 10 + (((tree.seed >>> (k + 2)) % 21) | 0);
  const x = startX + Math.sin(ph * Math.PI * 3 + k) * 4 + ph * 6;
  const y = tree.y - 34 + ph * 40;
  const alpha = ph < 0.1 ? ph / 0.1 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
  return { x, y, alpha };
}
