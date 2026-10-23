// The zebra crossing (vạch 7.3 of Vietnam's road marking standard, QCVN 41:2019), painted once on the outdoor background:
// plain white bars parallel to the road's center line, about 40 cm wide with 60 cm gaps, centered across the carriageway.
// At the street's scale (two lanes, about 7 m in 80 px) that is 5 px of paint and 7 px of asphalt.

export interface CrosswalkGeometry {
  /** Band (px): left edge and width (the width of the crossing, about 4 m). */
  x: number;
  w: number;
  /** Road (px): top edge and height; the dashed center line sits in the middle. */
  roadY: number;
  roadH: number;
}

/** Bar thickness and gap (px). */
export const BAR_H = 5;
export const BAR_GAP = 7;

const PAINT = '#eef0f3';
const PAINT_EDGE = '#d6dae1';

/** Bars (y and height, px): as many as fit, the group centered between the curbs. */
export function crosswalkBars(roadY: number, roadH: number): { y: number; h: number }[] {
  const room = roadH - 8;
  const n = Math.floor((room + BAR_GAP) / (BAR_H + BAR_GAP));
  const used = n * BAR_H + (n - 1) * BAR_GAP;
  const y0 = roadY + Math.floor((roadH - used) / 2);
  return Array.from({ length: n }, (_, i) => ({ y: y0 + i * (BAR_H + BAR_GAP), h: BAR_H }));
}

/** Whether the dashed center line must skip this dash (x, width 12): no line inside the crossing. */
export function crosswalkClearsDash(g: CrosswalkGeometry, x: number): boolean {
  return x + 12 > g.x - 4 && x < g.x + g.w + 4;
}

export function drawCrosswalk(ctx: CanvasRenderingContext2D, g: CrosswalkGeometry): void {
  for (const b of crosswalkBars(g.roadY, g.roadH)) {
    ctx.fillStyle = PAINT;
    ctx.fillRect(g.x, b.y, g.w, b.h);
    // the paint's bottom edge a touch darker, so the bars read crisp on the asphalt
    ctx.fillStyle = PAINT_EDGE;
    ctx.fillRect(g.x, b.y + b.h - 1, g.w, 1);
  }
}
