// Drawings of a traffic accident (sim/accident.ts): the ambulance (a white van with the checkered red band and the red
// cross on the side and a light bar flashing red and blue; its back doors open while the medics work), its lights' glow
// on the road at night, the fallen motorbike lying on its side, the bits of plastic around it, the flash of the impact
// and the orange traffic cones. Same art direction as render/props.ts; cached canvases, no per-frame allocation.
import { motorbikeSprites } from './props';
import { glowSprite } from './props';

interface Sprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const cache = new Map<string, Sprite>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const O = '#2e3648';
const WHITE = '#f6f7f8';
const SHADE = '#d3d8de';
const RED = '#d8302c';
/** The ambulance canvas (facing right): size and where its wheels touch the ground. */
const W = 62;
const H = 34;
const AX = 31;
const AY = 31;

/** The ambulance seen from the side, facing right (`flip`: left), without its light bar. */
function ambulanceSprite(flip: boolean): Sprite {
  const key = `amb:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = makeCanvas(W, H);
  ctx.save();
  if (flip) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // shadow
  ctx.fillStyle = 'rgba(28,36,52,0.3)';
  for (let y = -2; y <= 2; y++) {
    const half = Math.round(29 * Math.sqrt(Math.max(0, 1 - (y * y) / 4)));
    ctx.fillRect(31 - half, 31 + y, half * 2, 1);
  }
  // The body: the tall box at the back (rounded top corners) and the lower cab in front, its windshield raked; the
  // nose rounds off into the bumper. Outline first, then the paint, lit from above (bright top, shaded skirt).
  const cabRight = (y: number) => 52 + Math.min(6, Math.round((y - 10) * 0.75));
  px(O, 2, 4, 39, 1);
  px(O, 1, 5, 1, 22);
  px(O, 41, 4, 1, 6);
  for (let y = 10; y <= 26; y++) px(O, cabRight(y) + 1, y, 1);
  px(O, 42, 9, cabRight(10) - 41, 1);
  px(O, 2, 27, 57, 1);
  for (let y = 5; y <= 26; y++) {
    const x1 = y < 10 ? 40 : cabRight(y);
    const c = y <= 6 ? '#ffffff' : y >= 23 ? SHADE : y >= 21 ? '#e6eaee' : WHITE;
    px(c, 2, y, x1 - 1);
  }
  px(O, 2, 5, 1, 1);
  px(O, 40, 5, 1, 1);
  // roof: a vent and the antenna on the box, the cab's roof edge
  px('#9aa3b5', 8, 3, 7, 1);
  px(O, 8, 2, 7, 1);
  px('#c4cad4', 9, 3, 5, 1);
  px(O, 4, 1, 1, 3);
  px('#ffffff', 42, 10, cabRight(10) - 42, 1);
  // frosted window at the back of the box
  px(O, 5, 7, 8, 6);
  px('#b9cde0', 6, 8, 6, 4);
  px('#e3eef8', 6, 8, 2, 1);
  px('#9db4cb', 6, 11, 6, 1);
  // cab: side window (framed, with a glint), the raked windshield, the mirror
  for (let y = 11; y <= 17; y++) {
    const x1 = cabRight(y);
    px(O, 43, y, 8);
    px(O, 50, y, x1 - 50 + 1);
    if (y === 11 || y === 17) continue;
    px(y < 14 ? '#4d77a3' : '#3a5f86', 44, y, 6);
    px(y < 14 ? '#4d77a3' : '#3a5f86', 51, y, x1 - 51);
  }
  px('#a8d2f2', 45, 12, 2, 1);
  px('#a8d2f2', 44, 13, 1, 1);
  px('#a8d2f2', 52, 12, 1, 3);
  px(O, 51, 15, 1, 3);
  px('#5a6476', 50, 16, 1, 2);
  // doors: the side door's seam and handle, the back doors' seam and handle
  px(SHADE, 42, 11, 1, 15);
  px('#7d8698', 45, 23, 2, 1);
  px(SHADE, 3, 13, 1, 13);
  px('#7d8698', 5, 15, 1, 2);
  // the checkered band along the side (red and white squares, two rows), with a dark red line under it
  for (let k = 0, x = 2; x < 58; k++, x += 3) {
    const w = Math.min(3, cabRight(21) - x + 1);
    if (w <= 0) break;
    px(k % 2 ? WHITE : RED, x, 18, w, 2);
    px(k % 2 ? RED : '#ffffff', x, 20, w, 2);
  }
  px('#9c1f1d', 2, 22, cabRight(22) - 1, 1);
  // red cross on the box, with a white ring and a shaded edge
  px('#ffffff', 16, 6, 8, 12);
  px('#ffffff', 13, 9, 14, 6);
  px(RED, 17, 7, 6, 10);
  px(RED, 14, 10, 12, 4);
  px('#9c1f1d', 17, 16, 6, 1);
  px('#9c1f1d', 14, 13, 3, 1);
  px('#9c1f1d', 23, 13, 3, 1);
  px('#f06a62', 17, 7, 6, 1);
  // front: grille, headlight, the amber marker; back: tail lights and the reflector; the bumpers
  px('#5a6476', 57, 22, 2, 3);
  px('#3c4454', 58, 23, 1, 1);
  px('#fff6cf', 57, 19, 2, 2);
  px('#ffffff', 58, 19, 1, 1);
  px('#f2a93b', 56, 22, 1, 2);
  px('#e04a3a', 1, 7, 1, 4);
  px('#ff8a7a', 1, 7, 1, 1);
  px('#f2a93b', 1, 22, 1, 2);
  px('#7d8698', 54, 25, 6, 2);
  px('#c4cad4', 54, 25, 6, 1);
  px('#7d8698', 0, 25, 4, 2);
  px('#c4cad4', 0, 25, 4, 1);
  // wheels: a dark arch, then the tire, the rim and the hub nut
  for (const wx of [12, 48]) {
    for (let y = -6; y <= 0; y++)
      for (let x = -6; x <= 6; x++) if (Math.hypot(x, y) <= 6.4) px('#1f2430', wx + x, 26 + y);
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        const d = Math.hypot(x, y);
        if (d > 5.3) continue;
        px(d > 3.6 ? '#262b36' : d > 2.6 ? '#8c95a6' : d > 1.2 ? '#c9cfda' : '#5a6476', wx + x, 27 + y);
      }
    px('#3c4252', wx - 4, 24, 2, 1);
    px('#eef1f5', wx - 1, 25, 1, 1);
  }
  ctx.restore();
  const s = { canvas: c, ax: AX, ay: AY };
  cache.set(key, s);
  return s;
}

/** Which half of the light bar is lit now (0: red, 1: blue). */
function flash(now: number): number {
  return Math.floor(now / 220) % 2;
}

/**
 * The ambulance at (x, y) (wheels on the ground, bottom center) facing `dir`: the van, the light bar flashing red and
 * blue, and the back doors swung open while `doors`.
 */
export function drawAmbulance(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, now: number, doors: boolean): void {
  const s = ambulanceSprite(dir < 0);
  const left = Math.round(x - s.ax);
  const top = Math.round(y - s.ay);
  ctx.drawImage(s.canvas, left, top);
  // light bar on the box's roof, toward the front: a chrome base and two domes, the lit one with a bright core
  const f = flash(now);
  const bx = dir > 0 ? left + 29 : left + W - 29 - 10;
  ctx.fillStyle = O;
  ctx.fillRect(bx - 1, top + 1, 12, 4);
  ctx.fillStyle = '#c4cad4';
  ctx.fillRect(bx - 1, top + 3, 12, 1);
  const redX = dir > 0 ? bx : bx + 5;
  const blueX = dir > 0 ? bx + 5 : bx;
  ctx.fillStyle = f === 0 ? '#ff4a4a' : '#7a2626';
  ctx.fillRect(redX, top + 1, 5, 2);
  ctx.fillStyle = f === 1 ? '#5aa0ff' : '#253f7a';
  ctx.fillRect(blueX, top + 1, 5, 2);
  ctx.fillStyle = f === 0 ? '#ffd0c8' : '#cfe3ff';
  ctx.fillRect((f === 0 ? redX : blueX) + 2, top + 1, 1, 1);
  if (!doors) return;
  // the back doors open: two white panels swung out from the back, the dark inside showing
  const back = dir > 0 ? left + 1 : left + W - 2;
  ctx.fillStyle = '#3a4150';
  ctx.fillRect(dir > 0 ? back + 1 : back - 4, top + 8, 4, 17);
  ctx.fillStyle = O;
  ctx.fillRect(dir > 0 ? back - 5 : back + 1, top + 6, 5, 21);
  ctx.fillStyle = WHITE;
  ctx.fillRect(dir > 0 ? back - 4 : back + 1, top + 7, 4, 19);
  ctx.fillStyle = RED;
  ctx.fillRect(dir > 0 ? back - 4 : back + 1, top + 20, 4, 2);
}

/** At night, the light bar's red and blue glow on the van and the road around it (additive, flashing). */
export function drawSirenGlow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, night: number, now: number, still: boolean): void {
  if (night < 0.15) return;
  const f = still ? 0 : flash(now);
  const prev = ctx.globalCompositeOperation;
  const alpha = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const red = glowSprite('#ff3a3a', 64);
  const blue = glowSprite('#3a7dff', 64);
  const bx = x + dir * 5;
  const by = y - 28;
  // the lit half bright and wide, the other dim
  ctx.globalAlpha = 0.75 * night;
  ctx.drawImage(f === 0 ? red : blue, Math.round(bx - 30), Math.round(by - 18), 60, 36);
  ctx.globalAlpha = 0.4 * night;
  ctx.drawImage(f === 0 ? red : blue, Math.round(x - 52), Math.round(y - 22), 104, 40);
  ctx.globalAlpha = 0.18 * night;
  ctx.drawImage(f === 0 ? blue : red, Math.round(bx - 20), Math.round(by - 12), 40, 24);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = prev;
}

/**
 * The motorbike lying on its side in the lane (bottom center at x, y): the side view squashed flat and tipped, as seen
 * from above, wheels toward the curb.
 */
export function drawFallenBike(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number, dir: 1 | -1): void {
  const { back, front } = motorbikeSprites(variant, dir < 0);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(dir * 0.18);
  ctx.scale(1, -0.5);
  ctx.drawImage(back.canvas, -back.ax, -back.ay);
  ctx.drawImage(front.canvas, -front.ax, -front.ay);
  ctx.restore();
  // its shadow-side under it
  ctx.fillStyle = 'rgba(28,36,52,0.25)';
  ctx.fillRect(Math.round(x - 13), Math.round(y + 1), 26, 2);
}

/** The motorbike standing (wheeled by the officer, or parked at the curb). */
export function drawUprightBike(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number, dir: 1 | -1): void {
  const { back, front } = motorbikeSprites(variant, dir < 0);
  const l = Math.round(x - back.ax);
  const t = Math.round(y - back.ay);
  ctx.drawImage(back.canvas, l, t);
  ctx.drawImage(front.canvas, l, t);
}

const BITS = ['#9aa3b5', '#e04a3a', '#2e3648', '#f2f2ee', '#c9d4e0', '#f2a33a'];

/** Bits of plastic and glass scattered around the bike (stable for a crash `seed`). */
export function drawDebris(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  let h = (seed * 2654435761) >>> 0;
  for (let i = 0; i < 9; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const dx = ((h >>> 8) % 40) - 20;
    const dy = ((h >>> 16) % 10) - 6;
    ctx.fillStyle = BITS[(h >>> 4) % BITS.length];
    ctx.fillRect(Math.round(x + dx), Math.round(y + dy), 1 + ((h >>> 20) % 2), 1);
  }
}

/** The impact: a jagged white-and-yellow flash with lines flying out, over the first moments (`age` ms). */
export function drawImpact(ctx: CanvasRenderingContext2D, x: number, y: number, age: number): void {
  if (age > 700) return;
  const k = age / 700;
  const r = 4 + k * 12;
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = '#fff6c4';
  ctx.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
  ctx.fillStyle = '#ffd23a';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), 2, 2);
  }
  ctx.globalAlpha = 1;
}

/** A traffic cone (bottom center at x, y): orange with a white band, on a dark square base. */
export function drawCone(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const l = Math.round(x);
  const b = Math.round(y);
  ctx.fillStyle = 'rgba(28,36,52,0.25)';
  ctx.fillRect(l - 4, b, 9, 1);
  ctx.fillStyle = O;
  ctx.fillRect(l - 4, b - 2, 9, 2);
  ctx.fillRect(l - 3, b - 9, 7, 7);
  ctx.fillRect(l - 1, b - 11, 3, 2);
  ctx.fillStyle = '#ff7a1f';
  ctx.fillRect(l - 3, b - 3, 7, 1);
  ctx.fillRect(l - 2, b - 8, 5, 5);
  ctx.fillRect(l, b - 10, 1, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(l - 2, b - 6, 5, 1);
  ctx.fillStyle = '#ffb27a';
  ctx.fillRect(l - 1, b - 8, 1, 2);
}
