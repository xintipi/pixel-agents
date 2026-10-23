// Power cuts (sim/outage.ts), the drawn bits: the breaker box on the corridor wall, the power company's paper notice by
// the elevators, the rented generator on the sidewalk (shaking, puffing smoke) and the lightning flash. Small shapes
// drawn straight onto the canvas (no sprites, nothing allocated per frame).
import { flashLevel } from '../sim/outage';

/** Where the paper notice is taped: the reception wall, left of the first elevator (center x, top y; world px). */
export const NOTICE_AT = { x: 20, y: 7 } as const;

/** The breaker box (bottom center at x, y): a gray metal box with its little door, a red lever down while it's tripped. */
export function drawBreakerBox(ctx: CanvasRenderingContext2D, x: number, y: number, tripped: boolean): void {
  const x0 = Math.round(x - 5);
  const y0 = Math.round(y - 13);
  ctx.fillStyle = '#4a4f57';
  ctx.fillRect(x0, y0, 10, 13);
  ctx.fillStyle = '#9aa1ab';
  ctx.fillRect(x0 + 1, y0 + 1, 8, 11);
  ctx.fillStyle = '#b9c0c9';
  ctx.fillRect(x0 + 1, y0 + 1, 8, 1);
  // the switches behind the door's window, and the main lever
  ctx.fillStyle = '#2f343b';
  ctx.fillRect(x0 + 2, y0 + 3, 6, 4);
  ctx.fillStyle = '#e8e8e8';
  for (let i = 0; i < 3; i++) ctx.fillRect(x0 + 2 + i * 2, y0 + 4, 1, 2);
  ctx.fillStyle = tripped ? '#e0413a' : '#3d8c4a';
  ctx.fillRect(x0 + 7, tripped ? y0 + 5 : y0 + 3, 1, 2);
  // the yellow lightning sticker
  ctx.fillStyle = '#f2c94c';
  ctx.fillRect(x0 + 4, y0 + 8, 2, 1);
  ctx.fillRect(x0 + 3, y0 + 9, 2, 1);
  ctx.fillRect(x0 + 4, y0 + 10, 2, 1);
}

/** The scheduled cut's notice: a sheet of paper taped to the wall, red header, lines of text and a stamp. */
export function drawNotice(ctx: CanvasRenderingContext2D, cx: number, top: number): void {
  const x0 = Math.round(cx - 6);
  const y0 = Math.round(top);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x0 + 1, y0 + 1, 12, 15);
  ctx.fillStyle = '#fbf8ef';
  ctx.fillRect(x0, y0, 12, 15);
  // tape
  ctx.fillStyle = 'rgba(230,220,170,0.85)';
  ctx.fillRect(x0 + 4, y0 - 1, 4, 2);
  // header ("THÔNG BÁO") in red, then lines of text
  ctx.fillStyle = '#c8322b';
  ctx.fillRect(x0 + 2, y0 + 2, 8, 2);
  ctx.fillStyle = '#6b6f78';
  for (const [dy, w] of [
    [6, 8],
    [8, 7],
    [10, 8],
  ] as const)
    ctx.fillRect(x0 + 2, y0 + dy, w, 1);
  // the red round stamp
  ctx.fillStyle = '#d9534f';
  ctx.fillRect(x0 + 8, y0 + 11, 2, 2);
}

/**
 * The generator on the sidewalk (bottom center at x, y): a yellow box on little wheels, a dark panel and the exhaust.
 * `running`: it shakes and puffs gray smoke; `still` (reduced motion): no shaking, a steady puff.
 */
export function drawGenerator(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, running: boolean, still: boolean): void {
  const shake = running && !still ? (Math.floor(now / 45) % 2) : 0;
  const x0 = Math.round(x - 9) + shake;
  const y0 = Math.round(y - 13);
  // shadow and wheels
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x0 - 1, y0 + 12, 20, 2);
  ctx.fillStyle = '#26282c';
  ctx.fillRect(x0 + 1, y0 + 11, 3, 3);
  ctx.fillRect(x0 + 14, y0 + 11, 3, 3);
  // frame and body
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(x0, y0, 18, 12);
  ctx.fillStyle = '#e8b52a';
  ctx.fillRect(x0 + 1, y0 + 1, 16, 10);
  ctx.fillStyle = '#f6d36b';
  ctx.fillRect(x0 + 1, y0 + 1, 16, 2);
  // control panel, its lamp and the fuel cap
  ctx.fillStyle = '#2b2e33';
  ctx.fillRect(x0 + 3, y0 + 4, 6, 5);
  ctx.fillStyle = running ? '#7cff6a' : '#4a5a48';
  ctx.fillRect(x0 + 4, y0 + 5, 1, 1);
  ctx.fillStyle = '#c9ccd1';
  ctx.fillRect(x0 + 6, y0 + 6, 2, 2);
  ctx.fillStyle = '#2b2e33';
  ctx.fillRect(x0 + 12, y0, 3, 1);
  // exhaust pipe
  ctx.fillStyle = '#5b5f66';
  ctx.fillRect(x0 + 15, y0 - 3, 2, 4);
  if (!running) return;
  // smoke puffs rising from the pipe and drifting off, fading
  const t = still ? 0.4 : (now % 1400) / 1400;
  const alpha = ctx.globalAlpha;
  ctx.fillStyle = '#787c82';
  for (let i = 0; i < 3; i++) {
    const p = (t + i / 3) % 1;
    const r = 1 + Math.round(p * 3);
    ctx.globalAlpha = alpha * 0.55 * (1 - p);
    ctx.fillRect(Math.round(x0 + 16 + p * 7 - r / 2), Math.round(y0 - 4 - p * 14 - r / 2), r, r);
  }
  ctx.globalAlpha = alpha;
}

/**
 * The lightning flash `ms` after the strike: the outside goes white, the inside lights up a little through the windows.
 * `still` (reduced motion): a much softer flash.
 */
export function drawLightningFlash(
  ctx: CanvasRenderingContext2D,
  view: { x: number; y: number; w: number; h: number },
  building: { x: number; y: number; w: number; h: number },
  ms: number,
  still: boolean,
): void {
  const k = flashLevel(ms) * (still ? 0.3 : 1);
  if (k <= 0.01) return;
  ctx.save();
  ctx.fillStyle = '#eef3ff';
  // inside: a faint flicker
  ctx.globalAlpha = 0.18 * k;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  // outside: the bright flash (everything but the building)
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.rect(building.x + building.w, building.y, -building.w, building.h);
  ctx.clip('evenodd');
  ctx.globalAlpha = 0.6 * k;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.restore();
}
