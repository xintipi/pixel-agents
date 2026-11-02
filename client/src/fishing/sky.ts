// Bits of sky shared by the pond and the Flappy mini game: colour mixing and the little hand-shaped clouds.
import type { PixelGrid } from '../art/handdrawn/grid';

export type Rgb = readonly [number, number, number];
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c: Rgb): string => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A cloud: overlapping puffs with a flat bottom and a grey-blue underside (w white, s underside, S shade). */
export function cloudGrid(w: number, h: number, puffs: readonly (readonly [number, number, number])[]): PixelGrid {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const inside = puffs.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r);
      row += inside ? (y >= h - 2 ? 'S' : y >= h - 4 ? 's' : 'w') : '.';
    }
    rows.push(row);
  }
  return { palette: { w: '#ffffff', s: '#dbe8f5', S: '#b8cde3' }, rows };
}
export const CLOUDS: readonly PixelGrid[] = [
  cloudGrid(34, 12, [
    [8, 8, 5],
    [15, 6, 7],
    [24, 8, 6],
    [30, 10, 4],
  ]),
  cloudGrid(26, 10, [
    [7, 7, 5],
    [14, 5, 6],
    [21, 7, 5],
  ]),
  cloudGrid(40, 11, [
    [8, 8, 5],
    [17, 6, 7],
    [27, 5, 6],
    [34, 8, 5],
  ]),
];
