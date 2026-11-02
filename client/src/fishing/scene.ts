// The pond scene of the fishing mini game, as layers that move: the sky and clouds, the far bank (backdrop, trees, bushes, reeds), water
// with its reflection, ripples and glints, the near bank with its props, and the ambient life and weather in front.
// The layers are hand-drawn in Pixelorama (scripts/assets/handdrawn/fishing/scene-*.png); everything here that moves is positioned with
// sub-pixel precision: the canvas is drawn at `scale` (device pixels per picture pixel) and positions are rounded to 1 / scale, so motion
// glides while every sprite pixel stays crisp. The static layers are redrawn only when the weather or the darkness changes.
import { paintGrid, type PixelGrid } from '../art/handdrawn/grid';
import type { Weather } from '../world/render/weather';
import { CLOUDS, css, mix, type Rgb } from './sky';
import { SCENE_BACKDROP } from './sprites/scene-backdrop';
import { SCENE_BANK } from './sprites/scene-bank';
import { SCENE_BENCH } from './sprites/scene-bench';
import { SCENE_BUSH } from './sprites/scene-bush';
import { SCENE_DOCK } from './sprites/scene-dock';
import { SCENE_LANTERN } from './sprites/scene-lantern';
import { SCENE_LILY_0 } from './sprites/scene-lily-0';
import { SCENE_LILY_1 } from './sprites/scene-lily-1';
import { SCENE_LILY_2 } from './sprites/scene-lily-2';
import { SCENE_OAK } from './sprites/scene-oak';
import { SCENE_PINE } from './sprites/scene-pine';
import { SCENE_REEDS_0 } from './sprites/scene-reeds-0';
import { SCENE_REEDS_1 } from './sprites/scene-reeds-1';
import { SCENE_REEDS_2 } from './sprites/scene-reeds-2';
import { SCENE_REEDS_3 } from './sprites/scene-reeds-3';
import { SCENE_ROCKS } from './sprites/scene-rocks';
import { SCENE_WILLOW } from './sprites/scene-willow';

export const W = 320;
export const H = 180;
/** Top of the water (picture px). */
const WATER_Y = 88;
/** Where the far bank meets the water. */
const SHORE_Y = 93;

export interface Env {
  /** 0 (day) to 1 (night). */
  dark: number;
  weather: Weather;
}

function canvasOf(w: number, d: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = d;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** A steady pseudo-random number in 0..1 for (i, k): the same thing always lands in the same place. */
export function noise(i: number, k: number): number {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

const wrap = (v: number, span: number): number => ((v % span) + span) % span;

// ------------------------------------------------------------------ colours for the weather

/** Snow on the near bank: all the grass tones go to snow tones (the dirt path stays as it is). */
const SNOW_GROUND: Record<string, string> = {
  '#3f7a3a': '#b5c9de',
  '#4b8a3c': '#c4d5e8',
  '#5a9a48': '#d3e1f0',
  '#6fb25a': '#e4eef8',
  '#86c873': '#f4f8fd',
};
/** Frost on the trees: only the lightest tones turn white-ish, so the outlines and the dark undersides stay. */
const SNOW_TREE: Record<string, string> = { ...SNOW_GROUND, '#5aa45d': '#cfe3da', '#3f8550': '#6f9f86' };

const WATER_TONES = ['#7bb9d8', '#6aaed2', '#4c92bd', '#4086b0', '#357aa3', '#296490'];
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// ------------------------------------------------------------------ the layers, built once per (darkness, weather)

interface Layers {
  sky: HTMLCanvasElement;
  clouds: HTMLCanvasElement[];
  water: HTMLCanvasElement;
  /** The far bank without sway, for the reflection. */
  far: HTMLCanvasElement;
  backdrop: HTMLCanvasElement;
  oak: HTMLCanvasElement;
  oakFlip: HTMLCanvasElement;
  pine: HTMLCanvasElement;
  bush: HTMLCanvasElement;
  reeds: HTMLCanvasElement[];
  lilies: HTMLCanvasElement[];
  bank: HTMLCanvasElement;
  willow: HTMLCanvasElement;
  bench: HTMLCanvasElement;
  lantern: HTMLCanvasElement;
  rocks: HTMLCanvasElement;
  dock: HTMLCanvasElement;
}

function buildSky(env: Env): HTMLCanvasElement {
  const overcast = env.weather === 'rain' || env.weather === 'snow';
  const [c, ctx] = canvasOf(W, WATER_Y);
  const gray: Rgb = [138, 150, 166];
  const grey = { clear: 0, wind: 0.12, rain: 0.55, snow: 0.4 }[env.weather];
  const top = mix(mix([104, 176, 248], gray, grey), [8, 14, 38], env.dark);
  const low = mix(mix([204, 234, 255], gray, grey * 0.9), [44, 60, 104], env.dark);
  // a continuous gradient, one row at a time
  for (let y = 0; y < WATER_Y; y++) {
    ctx.fillStyle = css(mix(top, low, y / (WATER_Y - 1)));
    ctx.fillRect(0, y, W, 1);
  }
  if (!overcast && env.dark > 0.35) {
    ctx.fillStyle = `rgba(255,255,240,${Math.min(1, (env.dark - 0.35) * 2)})`;
    for (let i = 0; i < 34; i++) ctx.fillRect(Math.floor(noise(i, 1) * W), Math.floor(noise(i, 2) * 46), 1, 1);
  }
  if (!overcast) {
    if (env.dark < 0.55) {
      // the sun: a soft glow, the disc and a lighter middle
      for (const [r, col] of [
        [14, 'rgba(255,240,170,0.14)'],
        [11, 'rgba(255,240,170,0.26)'],
        [8, '#ffd95a'],
        [5, '#fff0a0'],
      ] as const) {
        const [ox, oy] = r === 5 ? [-1, -1] : [0, 0];
        for (let yy = -r; yy <= r; yy++) {
          for (let xx = -r; xx <= r; xx++) {
            if (xx * xx + yy * yy <= r * r + r) {
              ctx.fillStyle = col;
              ctx.fillRect(258 + ox + xx, 24 + oy + yy, 1, 1);
            }
          }
        }
      }
    } else {
      // crescent moon: a disc with a bite taken out of it
      for (let yy = -8; yy <= 8; yy++) {
        for (let xx = -8; xx <= 8; xx++) {
          if (xx * xx + yy * yy <= 40 && (xx - 3) * (xx - 3) + (yy + 2) * (yy + 2) > 30) {
            ctx.fillStyle = '#f4f1de';
            ctx.fillRect(258 + xx, 20 + yy, 1, 1);
          }
        }
      }
    }
  }
  return c;
}

const OUTLINE = [46, 54, 72];

/** A clean white cap on a prop: in each column, the first pixel under the top outline becomes snow (one deterministic row, no noise). */
function capWithSnow(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const at = (x: number, y: number) => (y * c.width + x) * 4;
  const isOutline = (i: number) => d[i] === OUTLINE[0] && d[i + 1] === OUTLINE[1] && d[i + 2] === OUTLINE[2];
  for (let x = 0; x < c.width; x++) {
    let y = 0;
    while (y < c.height && d[at(x, y) + 3] < 128) y++;
    if (y < c.height && isOutline(at(x, y))) y++;
    if (y >= c.height) continue;
    const i = at(x, y);
    if (d[i + 3] < 128 || isOutline(i)) continue;
    [d[i], d[i + 1], d[i + 2]] = [244, 248, 253];
  }
  ctx.putImageData(img, 0, 0);
}

/** A layer's pixels with the weather's tints on top: night, and the grey of an overcast day. */
function tinted(grid: PixelGrid, env: Env, recolor?: Record<string, string>, cap = false): HTMLCanvasElement {
  const [c, ctx] = canvasOf(grid.rows[0].length, grid.rows.length);
  paintGrid(ctx, grid, 0, 0, { recolor });
  if (cap) capWithSnow(c);
  ctx.globalCompositeOperation = 'source-atop';
  if (env.weather === 'rain' || env.weather === 'snow') {
    ctx.fillStyle = 'rgba(110,122,146,0.16)';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  if (env.dark > 0.02) {
    ctx.fillStyle = `rgba(14,24,58,${(0.34 * env.dark).toFixed(3)})`;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

function flipped(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = canvasOf(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

function buildWater(env: Env): HTMLCanvasElement {
  const [c, ctx] = canvasOf(W, H - WATER_Y);
  const n = WATER_TONES.length;
  for (let y = 0; y < c.height; y++) {
    const t = Math.min(1, y / (c.height - 1)) * (n - 1.001);
    const k = Math.floor(t);
    const fr = t - k;
    for (let x = 0; x < W; x++) {
      // a sparse ordered dither: each band fades into the next
      const f2 = Math.max(0, (fr - 0.45) / 0.55) * 0.85;
      ctx.fillStyle = WATER_TONES[f2 > (BAYER[y % 4][x % 4] + 0.5) / 16 && k < n - 1 ? k + 1 : k];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalCompositeOperation = 'source-atop';
  if (env.weather === 'rain' || env.weather === 'snow') {
    ctx.fillStyle = 'rgba(110,122,146,0.2)';
    ctx.fillRect(0, 0, W, c.height);
  }
  if (env.dark > 0.02) {
    ctx.fillStyle = `rgba(14,24,58,${(0.4 * env.dark).toFixed(3)})`;
    ctx.fillRect(0, 0, W, c.height);
  }
  return c;
}

function buildLayers(env: Env): Layers {
  const snow = env.weather === 'snow';
  const tree = snow ? SNOW_TREE : undefined;
  const ground = snow ? SNOW_GROUND : undefined;
  const oak = tinted(SCENE_OAK, env, tree);
  const pine = tinted(SCENE_PINE, env, tree);
  const bush = tinted(SCENE_BUSH, env, tree);
  const backdrop = tinted(SCENE_BACKDROP, env, tree);
  // the far bank as it stands (no sway), flattened for the reflection
  const [far, fctx] = canvasOf(W, 100);
  fctx.drawImage(backdrop, 0, 40);
  for (const [x, img] of [
    [86, oak],
    [170, pine],
    [262, flipped(oak)],
  ] as const)
    fctx.drawImage(img, Math.round(x - img.width / 2), 91 - img.height);
  for (const x of [128, 214, 304]) fctx.drawImage(bush, x - 15, 76);
  const clouds = CLOUDS.map((g) => {
    const overcast = env.weather === 'rain' || env.weather === 'snow';
    const base: Rgb = overcast ? [150, 160, 176] : [255, 255, 255];
    const night: Rgb = [60, 72, 108];
    const tone = mix(base, night, env.dark);
    return tinted(
      g,
      { dark: 0, weather: 'clear' },
      {
        '#ffffff': css(tone),
        '#dbe8f5': css(mix(tone, [190, 205, 225], 0.4)),
        '#b8cde3': css(mix(tone, [160, 180, 210], 0.5)),
      },
    );
  });
  return {
    sky: buildSky(env),
    clouds,
    water: buildWater(env),
    far,
    backdrop,
    oak,
    oakFlip: flipped(oak),
    pine,
    bush,
    reeds: [SCENE_REEDS_0, SCENE_REEDS_1, SCENE_REEDS_2, SCENE_REEDS_3].map((g) => tinted(g, env, tree)),
    lilies: [SCENE_LILY_0, SCENE_LILY_1, SCENE_LILY_2].map((g) => tinted(g, env)),
    bank: tinted(SCENE_BANK, env, ground),
    willow: tinted(SCENE_WILLOW, env, tree),
    bench: tinted(SCENE_BENCH, env, undefined, snow),
    lantern: tinted(SCENE_LANTERN, env, undefined, snow),
    rocks: tinted(SCENE_ROCKS, env, undefined, snow),
    dock: tinted(SCENE_DOCK, env, undefined, snow),
  };
}

// ------------------------------------------------------------------ the scene

export interface Scene {
  /** The darkness or the weather changed: redraw the layers (and the sway and the particles follow the new weather). */
  setEnv(env: Env): void;
  /** Device pixels per picture pixel (the canvas is drawn at this scale). */
  setScale(scale: number): void;
  /** Sky down to the dock: everything that stays behind the character. */
  drawBack(ctx: CanvasRenderingContext2D, t: number): void;
  /** In front of the character: ambient life, the weather, the night and the lamp's glow. */
  drawFront(ctx: CanvasRenderingContext2D, t: number): void;
}

export function createScene(initial: Env, calm: boolean): Scene {
  let env = initial;
  let L = buildLayers(env);
  let S = 3;
  /** Rounds a picture coordinate to a whole device pixel, so a moving sprite glides without ever blurring. */
  const snap = (v: number): number => Math.round(v * S) / S;
  /** How much the foliage moves: a little in calm weather, a lot in wind. */
  const swayAmp = (): number => ({ clear: 0.7, rain: 0.9, snow: 0.35, wind: 2.1 })[env.weather];
  const swaySpeed = (): number => (env.weather === 'wind' ? 2.1 : 1);

  /** Draws a sprite with its upper part (the canopy) swaying: it is sliced into 2-row strips, each shifted a little more the higher it is. */
  const sway = (
    ctx: CanvasRenderingContext2D,
    img: HTMLCanvasElement,
    x: number,
    y: number,
    hold: number,
    phase: number,
    t: number,
    k = 1,
  ) => {
    if (calm) return void ctx.drawImage(img, x, y);
    const amp = swayAmp() * k;
    const a = t * swaySpeed();
    for (let r = 0; r < img.height; r += 2) {
      const w = Math.max(0, 1 - r / hold);
      const off = w > 0 ? amp * w ** 1.4 * (Math.sin(a * 1.1 + phase) + 0.35 * Math.sin(a * 2.3 + phase * 1.7)) : 0;
      ctx.drawImage(img, 0, r, img.width, 2, snap(x + off), y + r, img.width, 2);
    }
  };

  const drawBack = (ctx: CanvasRenderingContext2D, t: number) => {
    const still = calm ? 0 : t;
    ctx.drawImage(L.sky, 0, 0);
    // clouds drift and wrap round; in wind they race
    const speed = env.weather === 'wind' ? 3.5 : 1;
    const count = env.weather === 'rain' || env.weather === 'snow' ? 6 : env.weather === 'wind' ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const img = L.clouds[i % L.clouds.length];
      const span = W + 90;
      ctx.drawImage(img, snap(wrap(i * 109 - still * (2.5 + i * 0.7) * speed, span) - 50), 8 + ((i * 17) % 36));
    }
    ctx.drawImage(L.water, 0, WATER_Y);
    // fish shadows under the surface: small, soft shapes with a wagging tail, drifting slowly back and forth
    const alpha = 0.13 * (1 - env.dark * 0.5);
    [
      { len: 16, x: 214, y: 124, speed: 0.12 },
      { len: 12, x: 262, y: 141, speed: 0.17 },
      { len: 20, x: 196, y: 158, speed: 0.1 },
    ].forEach((f, i) => {
      const a = still * f.speed + i * 2;
      const dir = Math.cos(a) >= 0 ? 1 : -1;
      shadow(ctx, snap(f.x + Math.sin(a) * 38), snap(f.y + Math.sin(still * 0.4 + i) * 3), f.len, dir, still * 5 + i, alpha, snap);
    });
    // the reflection of the far bank: continuous rows, each pushed sideways by a slow wave, fading with depth
    for (let r = 0; r < 26; r++) {
      const src = SHORE_Y - 2 - r * 1.35;
      if (src < 52) break;
      const off = calm ? 0 : Math.sin(still * 1.3 + r * 0.55) * (0.6 + r * 0.06) + Math.sin(still * 0.7 + r * 1.3) * 0.5;
      ctx.globalAlpha = 0.34 * (1 - r / 26) ** 1.4;
      ctx.drawImage(L.far, 0, Math.floor(src), W, 1, snap(off), SHORE_Y + 1 + r, W, 1);
    }
    ctx.globalAlpha = 1;
    // ripples: short bright dashes with a dark one under them, swaying back and forth and breathing; longer and bigger toward the viewer
    for (let i = 0; i < 34; i++) {
      const y = 98 + noise(i, 1) * 78;
      const near = (y - 98) / 78;
      const len = 4 + near * 10 + noise(i, 2) * 4;
      const x = noise(i, 3) * (W - len) + Math.sin(still * (0.4 + noise(i, 4) * 0.5) + i) * (2 + near * 3);
      const breathe = 0.5 + 0.5 * Math.sin(still * 0.8 + i * 1.9);
      ctx.fillStyle = `rgba(169,214,234,${(0.25 + 0.5 * breathe).toFixed(2)})`;
      ctx.fillRect(snap(x), snap(y), len, 1);
      ctx.fillStyle = `rgba(30,70,110,${(0.18 + 0.2 * breathe).toFixed(2)})`;
      ctx.fillRect(snap(x + 1), snap(y + 1), len - 2, 1);
    }
    // sun glitter on the water, under the sun
    if (env.dark < 0.5 && env.weather !== 'rain' && env.weather !== 'snow') {
      for (let i = 0; i < 16; i++) {
        const y = 98 + i * 4.5;
        const x = 258 + (noise(i, 5) - 0.5) * (10 + i * 2.2);
        const tw = Math.sin(still * 2.4 + i * 2.1);
        if (tw < 0.1) continue;
        ctx.fillStyle = `rgba(255,248,210,${(0.85 * tw).toFixed(2)})`;
        ctx.fillRect(snap(x), snap(y), 2 + (i % 3), 1);
      }
    }
    // the far bank
    ctx.drawImage(L.backdrop, 0, 40);
    for (const [i, x, img] of [
      [0, 86, L.oak],
      [1, 170, L.pine],
      [2, 262, L.oakFlip],
    ] as const)
      sway(ctx, img, Math.round(x - img.width / 2), 91 - img.height, img === L.pine ? 46 : 40, i * 2.1, still, img === L.pine ? 0.7 : 1);
    [128, 214, 304].forEach((x, i) => sway(ctx, L.bush, x - 15, 76, 12, i * 1.3 + 4, still, 0.6));
    // reeds, each with a ring on the water at its foot
    [110, 174, 230, 298].forEach((x, i) => {
      sway(ctx, L.reeds[i], x, 73, 22, i * 1.7, still, 1.8);
      const ring = calm ? 0.5 : (still * 0.5 + i * 0.27) % 1;
      ctx.fillStyle = `rgba(220,240,255,${(0.5 * (1 - ring)).toFixed(2)})`;
      const rr = 3 + ring * 7;
      ctx.fillRect(snap(x + 11 - rr), 97, rr * 2, 1);
    });
    // lily pads, riding the water
    for (const [x, y, k, flip] of [
      [190, 112, 0, false],
      [244, 126, 1, true],
      [212, 152, 2, false],
      [290, 138, 1, false],
      [168, 134, 0, true],
      [262, 160, 2, true],
    ] as const) {
      const bob = calm ? 0 : Math.sin(still * 1.1 + x * 0.1) * 0.5;
      const img = L.lilies[k];
      if (flip) {
        ctx.save();
        ctx.translate(snap(x) * 2 + img.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, snap(x), snap(y + bob));
        ctx.restore();
      } else ctx.drawImage(img, snap(x), snap(y + bob));
    }
    // the near bank and its props
    ctx.drawImage(L.bank, 0, 106);
    ctx.drawImage(L.bench, 28, 118);
    ctx.drawImage(L.lantern, 64, 76);
    sway(ctx, L.willow, -4, 49, 44, 0.8, still, 1.5);
    ctx.drawImage(L.rocks, 72, 148);
    // the dock's shade on the water, then the dock
    const shade = ctx.createRadialGradient(124, 143, 4, 124, 143, 40);
    shade.addColorStop(0, 'rgba(10,30,60,0.34)');
    shade.addColorStop(1, 'rgba(10,30,60,0)');
    ctx.save();
    ctx.translate(0, 143);
    ctx.scale(1, 0.22);
    ctx.translate(0, -143);
    ctx.fillStyle = shade;
    ctx.fillRect(80, 100, 90, 90);
    ctx.restore();
    ctx.drawImage(L.dock, 82, 108);
    // a ripple round each dock post
    if (!calm)
      for (const x of [89, 118, 148]) {
        const ring = (still * 0.45 + x * 0.013) % 1;
        ctx.fillStyle = `rgba(220,240,255,${(0.45 * (1 - ring)).toFixed(2)})`;
        const rr = 2 + ring * 6;
        ctx.fillRect(snap(x - rr), 147, rr * 2, 1);
      }
  };

  const drawFront = (ctx: CanvasRenderingContext2D, t: number) => {
    const still = calm ? 0 : t;
    const day = env.dark < 0.45 && env.weather !== 'rain' && env.weather !== 'snow';
    if (!calm) {
      if (day) {
        // two distant birds crossing the sky, flapping
        for (let i = 0; i < 2; i++) {
          const x = wrap(still * (11 + i * 4) + i * 190, W + 80) - 40;
          const y = 26 + i * 20 + Math.sin(still * 0.7 + i * 2) * 4;
          ctx.fillStyle = 'rgba(46,54,72,0.65)';
          const up = Math.sin(still * 8 + i) > 0;
          for (const [dx, dy] of up
            ? ([
                [0, 1],
                [1, 0],
                [2, 1],
                [3, 0],
                [4, 1],
              ] as const)
            : ([
                [0, 0],
                [1, 1],
                [2, 1],
                [3, 1],
                [4, 0],
              ] as const))
            ctx.fillRect(snap(x + dx), snap(y + dy), 1, 1);
        }
        // a dragonfly over the reeds
        const dx = 232 + Math.sin(still * 0.7) * 26 + Math.sin(still * 1.9) * 4;
        const dy = 86 + Math.sin(still * 1.1) * 10 + Math.sin(still * 3.1) * 2;
        ctx.fillStyle = '#2f9bd0';
        ctx.fillRect(snap(dx), snap(dy), 3, 1);
        ctx.fillStyle = `rgba(235,248,255,${(0.35 + 0.3 * Math.abs(Math.sin(still * 40))).toFixed(2)})`;
        ctx.fillRect(snap(dx + 1), snap(dy - 1), 2, 1);
        ctx.fillRect(snap(dx + 1), snap(dy + 1), 2, 1);
      } else if (env.dark > 0.5 && env.weather !== 'rain' && env.weather !== 'snow') {
        // fireflies: drifting, blinking dots with a small glow
        for (let i = 0; i < 10; i++) {
          const x = 30 + noise(i, 1) * 250 + Math.sin(still * (0.3 + noise(i, 2) * 0.3) + i) * 14;
          const y = 70 + noise(i, 3) * 80 + Math.sin(still * (0.4 + noise(i, 4) * 0.3) + i * 2) * 8;
          const blink = Math.max(0, Math.sin(still * (0.9 + noise(i, 5)) + i * 3));
          if (blink < 0.05) continue;
          ctx.fillStyle = `rgba(216,255,122,${(0.2 * blink).toFixed(2)})`;
          ctx.fillRect(snap(x) - 1, snap(y), 3, 1);
          ctx.fillRect(snap(x), snap(y) - 1, 1, 3);
          ctx.fillStyle = `rgba(236,255,170,${blink.toFixed(2)})`;
          ctx.fillRect(snap(x), snap(y), 1, 1);
        }
      }
    }
    // the weather
    if (env.weather === 'rain') rain(ctx, still, calm, snap);
    else if (env.weather === 'snow') snow(ctx, still, calm, snap);
    else if (env.weather === 'wind' && !calm) gust(ctx, still, snap);
    // the night over everything, and the lantern's glow
    if (env.dark > 0.02) {
      ctx.fillStyle = `rgba(12,22,56,${(0.14 * env.dark).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (env.dark > 0.3) {
      const flicker = calm ? 1 : 0.92 + 0.08 * Math.sin(t * 7) * Math.sin(t * 3.1);
      const g = ctx.createRadialGradient(72, 84, 2, 72, 90, 60);
      g.addColorStop(0, `rgba(255,214,120,${(0.5 * env.dark * flicker).toFixed(2)})`);
      g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(6, 24, 140, 130);
    }
  };

  return {
    setEnv(next) {
      env = next;
      L = buildLayers(env);
    },
    setScale(scale) {
      S = scale;
    },
    drawBack,
    drawFront,
  };
}

/** A fish seen from above through the water: a dark body that is widest forward, and a tail that wags. Faces `dir` (1 right, -1 left). */
function shadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  dir: 1 | -1,
  wag: number,
  alpha: number,
  snap: (v: number) => number,
): void {
  ctx.fillStyle = `rgba(14,40,70,${alpha.toFixed(3)})`;
  const ry = len * 0.16;
  for (let i = 0; i < len; i++) {
    const u = i / (len - 1);
    // the body fills the front 70%, tapering to a point at the nose; the tail is a narrow flare behind it
    const half = u > 0.3 ? ry * Math.sqrt(Math.max(0, 1 - ((u - 0.52) / 0.48) ** 2)) : 0.4 + (0.3 - u) * 3;
    const sway = u < 0.3 ? Math.sin(wag - u * 6) * (1.3 - u * 3) : 0;
    const cx = x + (dir === 1 ? i : len - 1 - i) - len / 2;
    ctx.fillRect(snap(cx), snap(y + sway - half), 1, Math.max(1 / 3, half * 2));
  }
}

// ------------------------------------------------------------------ weather particles (positions in picture px, rounded to device px)

type Snap = (v: number) => number;

/** Rain: two layers of drops slanting with the wind (far: short and faint, near: longer and brighter) and rings where they hit the water. */
function rain(ctx: CanvasRenderingContext2D, t: number, calm: boolean, snap: Snap): void {
  for (const [count, len, speed, color] of [
    [110, 2, 130, 'rgba(190,210,240,0.38)'],
    [60, 4, 215, 'rgba(228,238,255,0.72)'],
  ] as const) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const y = (noise(i, speed) * (H + 12) + t * speed) % (H + 12);
      const x = wrap(noise(i, speed + 1) * (W + 60) - t * speed * 0.3 + y * 0.5, W + 60);
      for (let j = 0; j < len; j++) ctx.fillRect(snap(x) - (j >> 1), snap(y) + j - 6, 1, 1);
    }
  }
  if (calm) return;
  ctx.fillStyle = 'rgba(235,244,255,0.8)';
  for (let i = 0; i < 16; i++) {
    const period = 0.7 + noise(i, 3) * 0.6;
    const cycle = Math.floor(t / period + noise(i, 4));
    const age = (t / period + noise(i, 4)) % 1;
    const x = 172 + Math.floor(noise(i, cycle + 5) * 140);
    const y = 100 + Math.floor(noise(i, cycle + 9) * 74);
    const r = 1 + Math.round(age * 4);
    ctx.globalAlpha = 1 - age;
    ctx.fillRect(x - r, y, 1, 1);
    ctx.fillRect(x + r, y, 1, 1);
    if (r >= 3) ctx.fillRect(x - r + 2, y - 1, r * 2 - 3, 1);
  }
  ctx.globalAlpha = 1;
}

/** Snow: three layers of flakes (faint dots, bright dots, little plus signs) drifting with the wind and swaying. */
function snow(ctx: CanvasRenderingContext2D, t: number, calm: boolean, snap: Snap): void {
  for (const [count, plus, speed, alpha] of [
    [80, false, 17, 0.5],
    [46, false, 29, 0.9],
    [14, true, 44, 0.95],
  ] as const) {
    ctx.fillStyle = `rgba(250,252,255,${alpha})`;
    for (let i = 0; i < count; i++) {
      const y = (noise(i, speed) * (H + 10) + t * speed) % (H + 10);
      const sway = calm ? 0 : Math.sin(t * (0.6 + noise(i, 2) * 0.8) + i * 1.7) * (plus ? 7 : 3);
      const x = snap(wrap(noise(i, speed + 1) * W + sway + t * 6, W));
      const yy = snap(y - 5);
      ctx.fillRect(x, yy, 1, 1);
      if (plus) {
        ctx.fillRect(x - 1, yy, 1, 1);
        ctx.fillRect(x + 1, yy, 1, 1);
        ctx.fillRect(x, yy - 1, 1, 1);
        ctx.fillRect(x, yy + 1, 1, 1);
      }
    }
  }
}

/** Wind: whitecaps running across the water and leaves tumbling along (the trees' sway is what really sells it). */
function gust(ctx: CanvasRenderingContext2D, t: number, snap: Snap): void {
  for (let i = 0; i < 14; i++) {
    const x = wrap(noise(i, 1) * 150 - t * (45 + noise(i, 2) * 40), 150) + 166;
    const y = 99 + Math.floor(noise(i, 3) * 74);
    const len = 3 + Math.floor(noise(i, 4) * 3);
    ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.45 * Math.abs(Math.sin(t * 2 + i))).toFixed(2)})`;
    ctx.fillRect(snap(x), y, len, 1);
    ctx.fillStyle = 'rgba(30,70,110,0.35)';
    ctx.fillRect(snap(x + 1), y + 1, len - 1, 1);
  }
  const colors = ['#7aa84a', '#d9893a', '#b88a3e'];
  for (let i = 0; i < 9; i++) {
    const x = wrap(noise(i, 6) * (W + 60) - t * (95 + noise(i, 7) * 70), W + 60) - 30;
    const y = 40 + noise(i, 8) * 100 + Math.sin(t * 2.2 + i * 2) * 9;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(snap(x + 3), snap(y), 4, 1);
    ctx.fillStyle = colors[i % 3];
    if (Math.floor(t * 7 + i) % 2) {
      ctx.fillRect(snap(x), snap(y), 3, 1);
      ctx.fillRect(snap(x + 1), snap(y + 1), 1, 1);
    } else {
      ctx.fillRect(snap(x), snap(y), 2, 1);
      ctx.fillRect(snap(x + 1), snap(y + 1), 2, 1);
    }
  }
}
