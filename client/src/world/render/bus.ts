// Sprites of the city bus and its stop (sim/bus.ts): the long green Sài Gòn bus seen from the side (route number on the
// LED sign over the front door and painted on the skirt, a row of windows, the two folding doors, the AC unit on the
// roof), the shelter (blue roof on two posts, a metal bench, an ad panel at the east end) and the blue sign post with the
// route numbers. Same art direction as render/props.ts.
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

const O = '#1d2733';
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
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(flip ? W - x - w : x, y, w, h);
  };
  const text = (t: string, x: number, y: number, color: string) => pixelText(ctx, t, flip ? W - x - pixelTextWidth(t) : x, y, color);
  const body = '#2f9e57';
  const dark = '#1f7a40';
  const light = '#6fcf8e';
  const glass = '#2a4660';
  const shine = '#6f97b8';
  shadowEllipse(ctx, AX, AY, 42, 2, 0.32);
  // the AC unit on the roof
  px(O, 30, 1, 28, 5);
  px('#d7dde4', 31, 2, 26, 3);
  px('#f4f6f8', 31, 2, 26, 1);
  for (let x = 34; x < 56; x += 4) px('#8a95a3', x, 3, 2, 1);
  // the body: outline with rounded corners, the roof lit, the skirt darker
  px(O, 3, 5, 82, 35);
  px(O, 2, 6, 84, 33);
  px(body, 3, 6, 82, 32);
  px(light, 4, 6, 80, 1);
  px(body, 4, 7, 80, 1);
  px(dark, 3, 29, 82, 9);
  px('#17603a', 3, 37, 82, 1);
  // the white and yellow stripe along the side
  px('#f4f4ee', 3, 27, 82, 1);
  px('#f2c94c', 3, 28, 82, 1);
  // the windows: dark glass, a light streak across each, the pillars in the body color
  for (const [a, b] of PANES) {
    px(O, a - 1, PANE_Y0 - 1, b - a + 3, PANE_Y1 - PANE_Y0 + 3);
    px(glass, a, PANE_Y0, b - a + 1, PANE_Y1 - PANE_Y0 + 1);
    px('#3c5e7e', a, PANE_Y0, b - a + 1, 1);
    for (let i = 0; i < 4; i++) px(shine, a + 2 + i, PANE_Y1 - 2 - i);
  }
  // the windshield, wrapping around the front
  px(O, 79, 8, 7, 21);
  px(glass, 80, 9, 5, 19);
  for (let i = 0; i < 5; i++) px(shine, 81 + Math.floor(i / 2), 24 - i * 3);
  // the LED sign over the front door: the route number in amber
  px(O, 63, 8, 17, 7);
  px('#11151d', 64, 9, 15, 5);
  text(route, 64 + Math.floor((15 - pixelTextWidth(route)) / 2), 9, '#ffb03a');
  // the doors: folding glass leaves in a dark frame, a grab rail in the middle
  for (const dx of [REAR_DOOR_X, FRONT_DOOR_X]) {
    px(O, dx - DOOR_HALF - 1, DOOR_Y0 - 1, DOOR_HALF * 2 + 3, DOOR_Y1 - DOOR_Y0 + 2);
    px(glass, dx - DOOR_HALF, DOOR_Y0, DOOR_HALF * 2 + 1, DOOR_Y1 - DOOR_Y0);
    px('#9aa3b5', dx, DOOR_Y0, 1, DOOR_Y1 - DOOR_Y0);
    px(shine, dx - 3, DOOR_Y0 + 3, 1, 4);
    px(shine, dx + 2, DOOR_Y0 + 3, 1, 4);
    px(dark, dx - DOOR_HALF, 31, DOOR_HALF * 2 + 1, 1);
  }
  // the route number painted on the skirt, between the doors
  text(route, 40, 31, '#f4f4ee');
  // mirror, headlight, tail lights, bumpers
  px(O, 86, 10, 2, 1);
  px(O, 87, 10, 1, 6);
  px('#fff3c4', 84, 31, 2, 2);
  px('#f2c94c', 84, 34, 2, 1);
  px('#e04a3a', 2, 29, 2, 5);
  px('#9aa3b5', 82, 37, 5, 2);
  px('#9aa3b5', 1, 37, 5, 2);
  // the wheels in their arches
  for (const wx of [17, 59]) {
    px(O, wx - 7, 32, 15, 2);
    px('#11151d', wx - 6, 34, 13, 4);
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        const d = Math.hypot(x, y);
        if (d > 5.3) continue;
        px(d > 3.4 ? '#1f2430' : d > 1.4 ? '#6b7385' : '#b8bfcc', wx + x, 38 + y);
      }
  }
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
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  shadowEllipse(ctx, 32, 47, 30, 2, 0.24);
  // the roof's shade on the ground
  ctx.fillStyle = 'rgba(28,36,52,0.10)';
  ctx.fillRect(6, 40, 52, 6);
  // posts
  for (const x of [3, 59]) {
    px(O, x - 1, 8, 4, 40);
    px('#8a95a3', x, 8, 2, 39);
    px('#c4c9d2', x, 8, 1, 39);
  }
  // the ad panel at the east end: a lit poster in a dark frame
  px(O, 48, 12, 11, 31);
  px('#3a4150', 49, 13, 9, 29);
  px('#f4f1e6', 50, 14, 7, 27);
  px('#f2c94c', 50, 14, 7, 9);
  px('#e8454a', 51, 16, 5, 5);
  px('#3d7ce0', 50, 26, 7, 2);
  px('#8a95a3', 51, 30, 5, 1);
  px('#8a95a3', 51, 33, 4, 1);
  px('#8a95a3', 51, 36, 5, 1);
  // the bench: perforated metal backrest and seat on two legs
  px(O, 9, 28, 38, 6);
  px('#9aa3b5', 10, 29, 36, 4);
  for (let x = 11; x < 46; x += 3) px('#6b7385', x, 30, 1, 2);
  px(O, 8, 36, 40, 4);
  px('#c4c9d2', 9, 37, 38, 1);
  px('#9aa3b5', 9, 38, 38, 1);
  for (const x of [11, 43]) px(O, x, 40, 2, 7);
  // the roof: a blue canopy, lit along the top, the front edge in shade
  px(O, 0, 2, 64, 8);
  px(O, 1, 1, 62, 1);
  px('#2b6cb4', 1, 2, 62, 6);
  px('#5c97da', 1, 2, 62, 1);
  px('#3f80c8', 1, 3, 62, 1);
  px('#1d4f8a', 1, 7, 62, 2);
  for (let x = 5; x < 60; x += 8) px('#7fb0f0', x, 4, 3, 1);
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
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  shadowEllipse(ctx, 11, 56, 4, 1, 0.25);
  // pole with the white/black band at the foot
  px('#6f7886', 10, 30, 2, 26);
  px('#a3abb8', 10, 30, 1, 26);
  px('#f4f6f8', 10, 50, 2, 2);
  px('#1d2230', 10, 52, 2, 2);
  // the plate: dark rim, blue face lit on top
  px('#14234a', 1, 0, 20, 31);
  px('#1f5fc4', 2, 1, 18, 29);
  px('#3d7ce0', 2, 1, 18, 1);
  // the bus pictogram: white body, blue windows, two wheels
  px('#ffffff', 5, 3, 12, 6);
  px('#1f5fc4', 6, 4, 2, 2);
  px('#1f5fc4', 9, 4, 2, 2);
  px('#1f5fc4', 12, 4, 2, 2);
  px('#1f5fc4', 15, 4, 1, 3);
  px('#ffffff', 6, 9, 2, 1);
  px('#ffffff', 14, 9, 2, 1);
  // the routes, one per line
  BUS_ROUTES.forEach((r, i) => pixelText(ctx, r, 11 - Math.ceil(pixelTextWidth(r) / 2), 12 + i * 6, '#ffffff'));
  const s = { canvas: c, ax: 11, ay: 56 };
  cache.set('bus_sign', s);
  return s;
}
