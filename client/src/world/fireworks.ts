// New Year fireworks schedule (pure): where and when each burst rises and opens, the same for the drawing
// (render/fun.ts) and for the sound (sound-cues.ts) — the "boom" plays in the frame the burst opens.
import { hash32 } from '../../../shared/hash';

/** How many launch tubes fire in turns. */
export const FIREWORK_TUBES = 10;
/** Fraction of each cycle spent rising (the trail); then it opens. */
export const FIREWORK_RISE = 0.25;

export interface Burst {
  /** Tube (0..FIREWORK_TUBES-1). */
  tube: number;
  /** Cycle number of this tube (changes on each new launch). */
  cycle: number;
  /** 0..1 inside the cycle: < FIREWORK_RISE rising, then opening and falling. */
  p: number;
  /** Center of the burst (world px). */
  cx: number;
  cy: number;
  /** Index of the color (in the caller's palette). */
  color: number;
}

export interface BRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The burst of tube `tube` at `now` (ms), around the building (sides and the sky above). */
export function fireworkBurst(tube: number, now: number, building: BRect): Burst {
  const t = now / 1000;
  const period = 2.2 + (tube % 3) * 0.5;
  const x = t / period + tube * 0.37;
  const cycle = Math.floor(x);
  const p = x - cycle;
  const h = hash32(`fw:${tube}:${cycle}`);
  const side = h % 3;
  const cx = side === 0 ? building.x - 30 - (h % 90) : side === 1 ? building.x + building.w + 30 + (h % 90) : building.x + (h % Math.max(1, building.w));
  const cy = side === 2 ? building.y - 30 - ((h >>> 8) % 50) : building.y + 30 + ((h >>> 8) % Math.max(1, building.h - 60));
  return { tube, cycle, p, cx, cy, color: (h >>> 16) % 6 };
}
