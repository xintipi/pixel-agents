// The roll-up shutter (cửa cuốn) over the corridor's west glass entrance (sim/guard.ts): the housing box at the north
// end of the facade and the corrugated metal slats rolled down over the glass, `level` of the way (0 = up, 1 = closed).
import { CORRIDOR_H, CORRIDOR_Y, TILE } from '../constants';

/** The shutter's box and run along the west facade (world px). */
const X = 2;
const W = 12;
const TOP = CORRIDOR_Y * TILE - 19;
const BOTTOM = (CORRIDOR_Y + CORRIDOR_H) * TILE;
const BOX_H = 7;
/** Everything the shutter may cover (for the view test). */
export const SHUTTER_BOX = { x: X - 2, y: TOP, w: W + 4, h: BOTTOM - TOP } as const;

/** Depth of the shutter (its bottom edge right now), for sorting with the people walking by. */
export function shutterDepth(level: number): number {
  return TOP + BOX_H + level * (BOTTOM - TOP - BOX_H);
}

export function drawShutter(ctx: CanvasRenderingContext2D, level: number): void {
  const y0 = TOP + BOX_H;
  const h = Math.round(level * (BOTTOM - y0));
  if (h > 0) {
    // slats: light and shadow lines every 3 px, a highlight on the west edge, the guide rails on both sides
    ctx.fillStyle = '#8d96a3';
    ctx.fillRect(X, y0, W, h);
    for (let y = y0 + h - 1; y >= y0; y -= 3) {
      ctx.fillStyle = '#6c7480';
      ctx.fillRect(X, y, W, 1);
      if (y - 1 >= y0) {
        ctx.fillStyle = '#b3bbc6';
        ctx.fillRect(X, y - 1, W, 1);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(X + 1, y0, 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(X + W - 3, y0, 2, h);
    // the bottom bar with the lock handle
    const by = y0 + h;
    ctx.fillStyle = '#4b525e';
    ctx.fillRect(X - 1, by - 2, W + 2, 3);
    ctx.fillStyle = '#d9b44a';
    ctx.fillRect(X + (W >> 1) - 1, by - 2, 2, 2);
  }
  // guide rails along the facade and the housing box on top (always there)
  ctx.fillStyle = '#4b525e';
  ctx.fillRect(X - 1, y0, 1, BOTTOM - y0);
  ctx.fillRect(X + W, y0, 1, BOTTOM - y0);
  ctx.fillStyle = '#5c6470';
  ctx.fillRect(X - 2, TOP, W + 4, BOX_H);
  ctx.fillStyle = '#7a8390';
  ctx.fillRect(X - 2, TOP, W + 4, 2);
  ctx.fillStyle = '#3f4550';
  ctx.fillRect(X - 2, TOP + BOX_H - 1, W + 4, 1);
}
