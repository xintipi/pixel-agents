// Sprites of the city bus and its stop (sim/bus.ts): the long green Sài Gòn bus seen from the side (route number on the
// LED sign over the front door and painted on the skirt, a row of windows, the two folding doors, the AC unit on the
// roof), the shelter (blue roof on two posts, a metal bench, an ad panel at the east end) and the blue sign post with the
// route numbers. Same art direction as render/props.ts.
import { BUS } from '../../art/handdrawn/bus';
import { BUS_SHELTER } from '../../art/handdrawn/bus-shelter';
import { BUS_SIGN } from '../../art/handdrawn/bus-sign';
import { paintGrid } from '../../art/handdrawn/grid';
import { pixelText, pixelTextWidth } from '../../art/pixelfont';
import { BUS_FRONT_DOOR, BUS_HALF, BUS_REAR_DOOR, BUS_ROUTES } from '../sim/bus';
import type { Vehicle } from '../sim/traffic';

export interface BusSprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const cache = new Map<string, BusSprite>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function shadowEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a = 0.22): void {
  ctx.fillStyle = `rgba(28,36,52,${a})`;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    ctx.fillRect(cx - half, cy + y, half * 2, 1);
  }
}

/** The bus canvas (facing right): its size, where its wheels touch the ground (anchor) and its parts (x ranges, px). */
const W = 88;
const H = 46;
const AX = 44;
const AY = 43;
/** Window panes along the side (x from, to) and their rows. */
const PANES: readonly (readonly [number, number])[] = [
  [5, 12],
  [15, 24],
  [39, 47],
  [49, 57],
  [59, 67],
];
const PANE_Y0 = 15;
const PANE_Y1 = 25;
/** The doors' centers (facing right) and half width. */
const FRONT_DOOR_X = AX + BUS_FRONT_DOOR;
const REAR_DOOR_X = AX + BUS_REAR_DOOR;
const DOOR_HALF = 4;
const DOOR_Y0 = 15;
const DOOR_Y1 = 37;

/** The bus (facing right; `flip` facing left) showing route `route`. */
export function busSprite(route: string, flip: boolean): BusSprite {
  const key = `bus:${route}:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = makeCanvas(W, H);
  const text = (t: string, x: number, y: number, color: string) => pixelText(ctx, t, flip ? W - x - pixelTextWidth(t) : x, y, color);
  shadowEllipse(ctx, AX, AY, 42, 2, 0.32);
  // the bus itself is hand-drawn (scripts/assets/handdrawn/bus.png); only the route number is painted here
  paintGrid(ctx, BUS, 0, 0, { flip });
  // the LED sign over the front door: the route number in amber
  text(route, 64 + Math.floor((15 - pixelTextWidth(route)) / 2), 9, '#ffb03a');
  // the route number painted on the skirt, between the doors
  text(route, 40, 31, '#f4f4ee');
  const s = { canvas: c, ax: AX, ay: AY };
  cache.set(key, s);
  return s;
}

/** World x range of a part of the bus given facing right as [a, b] (inclusive). */
function span(car: Vehicle, a: number, b: number): [number, number] {
  return car.dir > 0 ? [car.x - AX + a, b - a + 1] : [car.x + AX - b - 1, b - a + 1];
}

/**
 * The bus on the street: the sprite, the warm lit windows after dark (`night` 0–1), the doors open at the stop (the
 * dark inside and the step), the turn signal blinking while it pulls over or out.
 */
export function drawBus(ctx: CanvasRenderingContext2D, car: Vehicle, now: number, night: number, open: boolean): void {
  const s = busSprite(car.bus ?? BUS_ROUTES[0], car.dir < 0);
  const x0 = Math.round(car.x);
  const y0 = Math.round(car.y);
  ctx.drawImage(s.canvas, x0 - s.ax, y0 - s.ay);
  const top = y0 - AY;
  if (night > 0.2) {
    ctx.globalAlpha = Math.min(0.6, night);
    ctx.fillStyle = '#ffc966';
    for (const [a, b] of PANES) {
      const [x, w] = span({ ...car, x: x0 }, a, b);
      ctx.fillRect(x, top + PANE_Y0 + 1, w, PANE_Y1 - PANE_Y0);
    }
    ctx.globalAlpha = 1;
  }
  if (open) {
    for (const d of [REAR_DOOR_X, FRONT_DOOR_X]) {
      const [x, w] = span({ ...car, x: x0 }, d - DOOR_HALF, d + DOOR_HALF);
      ctx.fillStyle = night > 0.2 ? '#6b5a3a' : '#151a24';
      ctx.fillRect(x, top + DOOR_Y0, w, DOOR_Y1 - DOOR_Y0);
      // the folded leaves at the sides, the handrail and the step
      ctx.fillStyle = '#2a4660';
      ctx.fillRect(x, top + DOOR_Y0, 1, DOOR_Y1 - DOOR_Y0);
      ctx.fillRect(x + w - 1, top + DOOR_Y0, 1, DOOR_Y1 - DOOR_Y0);
      ctx.fillStyle = '#c4c9d2';
      ctx.fillRect(x + 2, top + DOOR_Y0 + 4, 1, 12);
      ctx.fillStyle = '#8a95a3';
      ctx.fillRect(x, top + DOOR_Y1 - 2, w, 2);
    }
  }
  // turn signal (amber, front and rear corners) pulling over or out
  if ((car.phase === 'arrive' || car.phase === 'leave') && Math.floor(now / 350) % 2 === 0) {
    ctx.fillStyle = '#ffb020';
    for (const end of [-1, 1]) {
      const ex = x0 + end * (BUS_HALF - 1);
      ctx.fillRect(ex - 1, top + 30, 2, 2);
    }
  }
}

/** The shelter: blue roof on two posts, the bench under it, an ad panel at the east end. Anchor: bottom center. */
export function busShelterSprite(): BusSprite {
  const hit = cache.get('bus_shelter');
  if (hit) return hit;
  const Wd = 64;
  const Ht = 50;
  const [c, ctx] = makeCanvas(Wd, Ht);
  shadowEllipse(ctx, 32, 47, 30, 2, 0.24);
  // the roof's shade on the ground
  ctx.fillStyle = 'rgba(28,36,52,0.10)';
  ctx.fillRect(6, 40, 52, 6);
  // the shelter itself is hand-drawn (scripts/assets/handdrawn/bus-shelter.png)
  paintGrid(ctx, BUS_SHELTER);
  const s = { canvas: c, ax: 32, ay: 48 };
  cache.set('bus_shelter', s);
  return s;
}

/** The blue bus stop sign on its post: a bus pictogram and the route numbers stacked under it. Anchor: bottom center. */
export function busSignSprite(): BusSprite {
  const hit = cache.get('bus_sign');
  if (hit) return hit;
  const Wd = 22;
  const Ht = 58;
  const [c, ctx] = makeCanvas(Wd, Ht);
  shadowEllipse(ctx, 11, 56, 4, 1, 0.25);
  // the plate and pole are hand-drawn (scripts/assets/handdrawn/bus-sign.png)
  paintGrid(ctx, BUS_SIGN);
  // the routes, one per line
  BUS_ROUTES.forEach((r, i) => pixelText(ctx, r, 11 - Math.ceil(pixelTextWidth(r) / 2), 12 + i * 6, '#ffffff'));
  const s = { canvas: c, ax: 11, ay: 56 };
  cache.set('bus_sign', s);
  return s;
}
