// The reception's "work tree": grows with the tasks completed during the week. Five stages in the same ceramic
// pot (same sheet and anchor as the corner pots): sprout, seedling, sapling, full tree and, at the top, flowering and
// with little fruits. 5-tone ramps and outline at the end, like the rest of the furniture.
import { ramp } from './core/color';
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

export type WorkTreeStage = 0 | 1 | 2 | 3 | 4;

/** Tasks in the week needed to reach each stage. */
export const WORK_TREE_STEPS: readonly number[] = [0, 5, 15, 30, 60];

export function workTreeStage(tasks: number): WorkTreeStage {
  let s = 0;
  for (let i = 0; i < WORK_TREE_STEPS.length; i++) if (tasks >= WORK_TREE_STEPS[i]) s = i;
  return s as WorkTreeStage;
}

const LEAF = ramp('#4f9a52', 0.1);
const POT = ramp('#c8734a', 0.08);
const BARK = ramp('#7a5236', 0.08);

export function renderWorkTree(stage: WorkTreeStage): BufSprite {
  const b = new PixelBuf(40, 64);
  b.shadow(20, 59, 10, 2, '#252c39', 0.22);
  // pot: wide mouth, light band, narrower base
  b.rect(12, 48, 16, 3, POT.lt);
  b.rect(13, 51, 14, 7, POT.base);
  b.rect(14, 57, 12, 2, POT.dk);
  b.hline(13, 26, 53, POT.hi);
  b.rect(13, 48, 14, 1, '#5a3c2a'); // soil
  if (stage === 0) {
    // sprout: two little leaves
    b.vline(20, 43, 47, LEAF.dk);
    b.rect(17, 42, 3, 2, LEAF.base);
    b.rect(21, 41, 3, 2, LEAF.lt);
    b.set(22, 41, LEAF.hi);
  } else {
    const trunkTop = [0, 36, 28, 22, 18][stage];
    b.rect(19, trunkTop, 3, 48 - trunkTop, BARK.base);
    b.vline(19, trunkTop, 47, BARK.lt);
    b.vline(21, trunkTop + 2, 47, BARK.dk);
    if (stage >= 3) {
      b.line(20, 34, 14, 28, BARK.base, 2);
      b.line(21, 32, 27, 26, BARK.base, 2);
    }
    // canopy: overlapping leaf clumps, shadow below, highlight at the top left
    const blobs: [number, number, number, number][] =
      stage === 1
        ? [[20, 33, 5, 4]]
        : stage === 2
          ? [[20, 24, 8, 7], [15, 28, 5, 4], [25, 28, 5, 4]]
          : [[20, 16, 11, 9], [12, 23, 7, 6], [28, 22, 7, 6], [20, 26, 9, 5]];
    for (const [x, y, rx, ry] of blobs) b.ellipse(x, y + 1, rx, ry, LEAF.dk);
    for (const [x, y, rx, ry] of blobs) b.ellipse(x, y, rx - 1, ry - 1, LEAF.base);
    for (const [x, y, rx, ry] of blobs) b.ellipse(x - rx / 3, y - ry / 3, rx / 2, ry / 2, LEAF.lt);
    for (const [x, y] of blobs) b.set(Math.round(x - 2), Math.round(y - 3), LEAF.hi);
    if (stage === 4) {
      // pink flowers and little orange fruits
      for (const [x, y] of [[14, 13], [24, 11], [29, 19], [11, 21], [19, 20], [25, 25], [16, 27]]) {
        b.set(x, y, '#ffd3e0');
        b.set(x + 1, y, '#f58fb0');
        b.set(x, y + 1, '#f58fb0');
      }
      for (const [x, y] of [[18, 14], [27, 15], [13, 25], [22, 29], [30, 24]]) {
        b.rect(x, y, 2, 2, '#f39a2b');
        b.set(x, y, '#ffd27a');
      }
    }
  }
  b.outline();
  return { buf: b, ax: 20, ay: 60 };
}
