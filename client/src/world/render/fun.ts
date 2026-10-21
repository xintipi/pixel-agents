// Drawing of the office's little things (art/fun.ts on canvas, cached) and what moves each frame: the aquarium
// fish (and the food falling when someone clicks), the New Year countdown and the fireworks outside.
import type { Sprite } from '../../art/api';
import type { BufSprite } from '../../art/core/sprite';
import { AQUARIUM_WATER, renderAquarium, renderDock, renderPizzaBox, renderRobot } from '../../art/fun';
import { FIREWORK_RISE, FIREWORK_TUBES, fireworkBurst } from '../fireworks';

const cache = new Map<string, Sprite>();

function toSprite(b: BufSprite): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = b.buf.w;
  canvas.height = b.buf.h;
  canvas.getContext('2d')!.putImageData(new ImageData(b.buf.data, b.buf.w, b.buf.h), 0, 0);
  return { canvas, ax: b.ax, ay: b.ay };
}

function cached(key: string, make: () => BufSprite): Sprite {
  let s = cache.get(key);
  if (!s) cache.set(key, (s = toSprite(make())));
  return s;
}

export const robotSprite = (frame: number, led: 'green' | 'orange' | 'blue') => cached(`robot|${frame % 2}|${led}`, () => renderRobot(frame, led));
export const dockSprite = () => cached('dock', renderDock);
export const aquariumSprite = () => cached('aquarium', renderAquarium);
export const pizzaBoxSprite = () => cached('pizza', renderPizzaBox);

const FISH = ['#ff8a3c', '#ffd34d', '#ff5d7a', '#7ee0ff'];
/** Food lasts this long (ms) after the click. */
export const FEED_MS = 7_000;

/**
 * Fish of the aquarium anchored at (ax, ay): three little fish swimming back and forth; with food (recent fedAt), the flakes
 * sink from the top and the fish rise to catch them.
 */
export function drawFish(ctx: CanvasRenderingContext2D, ax: number, ay: number, now: number, fedAt: number): void {
  const w = AQUARIUM_WATER;
  const x0 = ax + w.x;
  const y0 = ay + w.y;
  const fed = now - fedAt < FEED_MS;
  const t = now / 1000;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w.w, w.h);
  ctx.clip();
  if (fed) {
    ctx.fillStyle = '#d9b26a';
    const k = (now - fedAt) / FEED_MS;
    for (let i = 0; i < 6; i++) {
      const fx = x0 + 4 + ((i * 7) % (w.w - 8));
      const fy = y0 + 1 + Math.min(w.h - 3, k * 30 + (i % 3) * 2);
      ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
    }
  }
  FISH.slice(0, 3).forEach((col, i) => {
    const speed = 0.35 + i * 0.12;
    const ph = t * speed + i * 2.1;
    const fx = x0 + 3 + ((Math.sin(ph) + 1) / 2) * (w.w - 7);
    const dir = Math.cos(ph) >= 0 ? 1 : -1;
    const baseY = y0 + 3 + i * 3;
    const fy = fed ? y0 + 2 + Math.abs(Math.sin(t * 3 + i)) * 2 : baseY + Math.sin(t * 1.7 + i) * 1;
    const x = Math.round(fx);
    const y = Math.round(fy);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 3, 2);
    ctx.fillRect(x - dir * 1, y, 1, 2); // tail
    ctx.fillStyle = '#1d2230';
    ctx.fillRect(x + (dir > 0 ? 2 : 0), y, 1, 1); // eye
  });
  // rising bubbles
  ctx.fillStyle = 'rgba(230,248,255,0.8)';
  for (let i = 0; i < 3; i++) {
    const by = y0 + w.h - (((t * 6 + i * 4) % w.h) | 0);
    ctx.fillRect(x0 + w.w - 5 + (i % 2), by, 1, 1);
  }
  ctx.restore();
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Firework palettes: [main color, the color it fades to, highlight]. */
const FW_COLORS: readonly [string, string, string][] = [
  ['255,196,64', '255,92,40', '255,246,200'], // gold
  ['255,84,128', '170,40,120', '255,214,230'], // pink
  ['90,210,255', '40,100,220', '220,248,255'], // blue
  ['130,255,120', '40,170,90', '230,255,220'], // green
  ['250,250,255', '160,170,255', '255,255,255'], // silver
  ['200,120,255', '120,50,210', '240,220,255'], // violet
];

/** Seeded per-burst random (the same burst always draws the same particles). */
function fwRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where a spark is `s` seconds after the burst: it shoots out fast and slows down (drag), while gravity pulls it.
 * `speed` in px/s at the start; `grav` in px/s².
 */
function sparkAt(cx: number, cy: number, ang: number, speed: number, grav: number, s: number, flat: number): [number, number] {
  const drag = 2.6;
  const d = (speed / drag) * (1 - Math.exp(-drag * s));
  return [cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * flat + 0.5 * grav * s * s];
}

/**
 * Fireworks outside the building, on top of the night (they glow): each tube's rocket rises with a wobbling spark
 * trail, then opens in one of five styles — peony (a sphere of one color), chrysanthemum (with trails), ring,
 * willow (gold, long drooping trails) and crossette (two colors that twinkle at the end). Sparks slow down, fall
 * with gravity, fade to a darker color and flicker before going out; glow adds up where they overlap.
 */
export function drawFireworks(ctx: CanvasRenderingContext2D, view: Rect, building: Rect, now: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.rect(building.x + building.w, building.y, -building.w, building.h);
  ctx.clip('evenodd');
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < FIREWORK_TUBES; i++) {
    const b = fireworkBurst(i, now, building);
    const { p, cx, cy } = b;
    const period = 2.2 + (i % 3) * 0.5;
    const rnd = fwRand(b.cycle * 977 + i * 131);
    const style = Math.floor(rnd() * 5); // 0 peony, 1 chrysanthemum, 2 ring, 3 willow, 4 crossette
    const pal = FW_COLORS[style === 3 ? 0 : b.color];
    const pal2 = FW_COLORS[(b.color + 2) % FW_COLORS.length];
    if (p < FIREWORK_RISE) {
      // the rocket: rises from below with a wobble, sparks dripping behind
      const rise = p / FIREWORK_RISE;
      const ease = 1 - (1 - rise) * (1 - rise);
      const sx = cx + Math.sin(rise * 9 + i) * 2;
      const sy = cy + 70 * (1 - ease);
      for (let k = 0; k < 6; k++) {
        const back = k * 3;
        ctx.fillStyle = `rgba(255,${200 - k * 20},${120 - k * 15},${0.8 - k * 0.12})`;
        ctx.fillRect(Math.round(sx + Math.sin((rise - k * 0.02) * 9 + i) * 2), Math.round(sy + back), k < 2 ? 2 : 1, k < 2 ? 2 : 1);
      }
      for (let k = 0; k < 3; k++) {
        const ph = (rise * 5 + k / 3) % 1;
        ctx.fillStyle = `rgba(255,220,150,${0.6 * (1 - ph)})`;
        ctx.fillRect(Math.round(sx + (k - 1) * 2), Math.round(sy + 6 + ph * 14), 1, 1);
      }
      continue;
    }
    const s = (p - FIREWORK_RISE) * period; // seconds since it opened
    const life = (1 - FIREWORK_RISE) * period;
    const q = s / life; // 0..1
    // flash when it opens
    if (s < 0.18) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
      g.addColorStop(0, `rgba(${pal[2]},${0.55 * (1 - s / 0.18)})`);
      g.addColorStop(1, `rgba(${pal[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - 46, cy - 46, 92, 92);
    }
    const n = style === 2 ? 26 : style === 3 ? 30 : 36;
    const baseSpeed = style === 3 ? 70 : style === 2 ? 95 : 105;
    const grav = style === 3 ? 34 : 22;
    const flat = style === 2 ? 0.55 : 1;
    const trail = style === 1 || style === 3 ? (style === 3 ? 7 : 4) : 1;
    const fade = Math.max(0, 1 - Math.pow(q, style === 3 ? 0.9 : 1.4));
    for (let j = 0; j < n; j++) {
      const ang = (j / n) * Math.PI * 2 + (style === 2 ? 0 : (rnd() - 0.5) * 0.35);
      const speed = baseSpeed * (style === 2 ? 1 : 0.55 + rnd() * 0.5);
      const twoTone = style === 4 && j % 2 === 1;
      const color = twoTone ? pal2 : pal;
      // twinkle at the end (crossette and willow), otherwise a slow fade
      let a = fade;
      if ((style === 4 || style === 3) && q > 0.55) a *= (Math.floor(now / 70 + j * 3) % 3 === 0 ? 0.25 : 1);
      if (a <= 0.02) continue;
      for (let k = trail - 1; k >= 0; k--) {
        const ts = Math.max(0, s - k * 0.045);
        const [x, y] = sparkAt(cx, cy, ang, speed, grav, ts, flat);
        const ta = a * (k === 0 ? 1 : 0.45 * (1 - k / trail));
        // the head shifts from the bright color to the darker one as it burns out
        const rgb = k === 0 && q < 0.25 ? color[2] : q > 0.6 ? color[1] : color[0];
        ctx.fillStyle = `rgba(${rgb},${ta})`;
        const size = k === 0 && q < 0.5 ? 2 : 1;
        ctx.fillRect(Math.round(x), Math.round(y), size, size);
      }
    }
    // a soft glow where the burst is, fading with it
    if (q < 0.6) {
      const r = 18 + q * 40;
      const g = ctx.createRadialGradient(cx, cy + q * 10, 0, cx, cy + q * 10, r);
      g.addColorStop(0, `rgba(${pal[0]},${0.18 * (1 - q / 0.6)})`);
      g.addColorStop(1, `rgba(${pal[0]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy + q * 10 - r, 2 * r, 2 * r);
    }
  }
  ctx.restore();
}

/** New Year countdown: a lit scoreboard in the sky, above the middle of the building. */
export function drawCountdown(ctx: CanvasRenderingContext2D, building: Rect, secondsLeft: number, label: string): void {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const text = `${label} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const x = Math.round(building.x + building.w / 2);
  const y = Math.round(building.y - 26);
  ctx.save();
  ctx.font = 'bold 14px "Silkscreen", "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  ctx.fillStyle = 'rgba(16,14,30,0.85)';
  ctx.fillRect(x - w / 2, y - 11, w, 22);
  ctx.strokeStyle = '#ffd36b';
  ctx.strokeRect(x - w / 2 + 0.5, y - 10.5, w - 1, 21);
  ctx.fillStyle = secondsLeft <= 10 && secondsLeft % 2 === 0 ? '#ff6b8a' : '#ffd36b';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}
