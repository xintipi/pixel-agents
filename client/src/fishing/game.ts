// Fishing mini game: a modal <dialog> over the office, opened by clicking the pond across the street. A 320 x 180
// canvas scaled by whole numbers draws the scene (hand-drawn in Pixelorama: dock, willow, bench, lantern, reeds, the agent
// that was selected); the texts, the result card and the Fishdex are DOM. Loaded on first use (dynamic import).
// Local only: the Fishdex lives in localStorage ('habblaud:fishing'), nothing goes to the server.
import { tr } from '../../../shared/i18n';
import * as artModule from '../art';
import type { Appearance, ArtModule } from '../art/api';
import { paintGrid, type PixelGrid } from '../art/handdrawn/grid';
import { h, iconButton } from '../ui/dom';
import { ICONS } from '../ui/icons';
import { safeLocalStorage } from '../ui/prefs';
import { reducedMotion } from '../world/render/github-fx';
import type { Weather } from '../world/render/weather';
import { drawFish, drawMarker, FISH_BOX } from './art';
import { CLOUDS, css, lerp, mix, type Rgb } from './sky';
import { FISH, loadSave, RARITY, record, writeSave, type Catch, type Fish } from './fish';
import { PROP_BOBBER } from './sprites/prop-bobber';
import { SCENE_BG } from './sprites/scene-bg';
import { FISH_H, Session, TRACK_H, ZONE_H, type FishingEvent, type Phase } from './session';

const W = 320;
const H = 180;
const SHORE = 86;
const TIP_REST = { x: 132, y: 96 };

export interface FishingOptions {
  /** Where the dialog goes (the `.ui-root`, which carries the interface colours). */
  root: HTMLElement;
  /** The agent that fishes; without one, a default look. */
  appearance: Appearance | null;
  name: string | null;
  /** The office's darkness (0 day .. 1 night) and weather right now: read again as they change while the game is open. */
  env(): { dark: number; weather: Weather };
}

/** Where the float lands for a cast of strength p (0..1): farther is higher up the picture and farther right. */
const target = (p: number): { x: number; y: number } => ({
  x: 156 + p * 124,
  y: 146 - p * 36,
});

/** The rod from the hand to the tip: a dark wrapped grip with a little reel, then a shaft that thins out (light top edge) to a bright tip. */
function drawRod(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(lerp(x0, x1, t));
    const y = Math.round(lerp(y0, y1, t));
    if (t < 0.2) {
      ctx.fillStyle = i % 4 === 3 ? '#a83a33' : '#3a2a24';
      ctx.fillRect(x, y, 2, 2);
    } else {
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(x, y, t < 0.55 ? 2 : 1, t < 0.55 ? 2 : 1);
      ctx.fillStyle = '#c4955c';
      ctx.fillRect(x, y - 1, 1, 1);
      if (i % 9 === 5 && t < 0.9) {
        ctx.fillStyle = '#e8ecf5';
        ctx.fillRect(x, y + 1, 1, 1);
      }
    }
  }
  const rx = Math.round(lerp(x0, x1, 0.12));
  const ry = Math.round(lerp(y0, y1, 0.12));
  ctx.fillStyle = '#2e3648';
  ctx.fillRect(rx - 1, ry + 1, 4, 4);
  ctx.fillStyle = '#9aa3b2';
  ctx.fillRect(rx, ry + 2, 2, 2);
  ctx.fillStyle = '#e8454a';
  ctx.fillRect(Math.round(x1), Math.round(y1) - 1, 2, 2);
}

function plot(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string): void {
  ctx.fillStyle = color;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(lerp(x0, x1, i / n)), Math.round(lerp(y0, y1, i / n)), 1, 1);
}

function canvasOf(w: number, d: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = d;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** A pixel frame with cut corners and a light top-left edge; the inside (x+2, y+2, w-4, h-4) is the dark well. */
function pixelFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#2e3648';
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = '#5a6a8c';
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = '#161d2b';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
}

/** Green when it is going well, then yellow, then red: the colour of segment i of n. */
const segColor = (i: number, n: number): [string, string] =>
  i / n < 0.5 ? ['#5fd47a', '#b8f5c4'] : i / n < 0.8 ? ['#f2c94c', '#fff0a0'] : ['#e8605a', '#ffb0a0'];

/** A tiny deterministic generator, so the grass specks and stars don't move from one visit to the next. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ scenery (drawn once)

function drawSky(dark: number, weather: Weather): HTMLCanvasElement {
  const overcast = weather === 'rain' || weather === 'snow';
  const [c, ctx] = canvasOf(W, SHORE);
  const gray: Rgb = [138, 150, 166];
  const grey = { clear: 0, wind: 0.12, rain: 0.55, snow: 0.4 }[weather];
  const dayTop = mix([112, 184, 250], gray, grey);
  const dayLow = mix([204, 234, 255], gray, grey * 0.9);
  const top = mix(dayTop, [10, 16, 40], dark);
  const low = mix(dayLow, [40, 56, 98], dark);
  const bands = 12;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = css(mix(top, low, i / (bands - 1)));
    ctx.fillRect(0, Math.floor((i * SHORE) / bands), W, Math.ceil(SHORE / bands) + 1);
  }
  if (!overcast && dark > 0.35) {
    const r = rng(7);
    ctx.fillStyle = `rgba(255,255,240,${Math.min(1, (dark - 0.35) * 2)})`;
    for (let i = 0; i < 30; i++) ctx.fillRect(Math.floor(r() * W), Math.floor(r() * 44), 1, 1);
  }
  if (!overcast) {
    if (dark < 0.55) {
      for (const [r, col] of [
        [11, 'rgba(255,240,170,0.28)'],
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
          const inDisc = xx * xx + yy * yy <= 40;
          const bite = (xx - 3) * (xx - 3) + (yy + 2) * (yy + 2) <= 30;
          if (inDisc && !bite) {
            ctx.fillStyle = '#f4f1de';
            ctx.fillRect(258 + xx, 20 + yy, 1, 1);
          }
        }
      }
    }
  }
  return c;
}

function drawLand(dark: number): HTMLCanvasElement {
  const [c, ctx] = canvasOf(W, H);
  paintGrid(ctx, SCENE_BG);
  if (dark > 0.02) {
    ctx.fillStyle = `rgba(14,24,58,${(0.34 * dark).toFixed(3)})`;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  return c;
}

// ------------------------------------------------------------------ the dialog

export function openFishing(o: FishingOptions): void {
  if (o.root.querySelector('.ui-fish')) return;
  const art = artModule as ArtModule;
  const appearance = o.appearance ?? art.appearanceFromSeed(7);
  const storage = safeLocalStorage();
  const save = loadSave(storage);
  const calm = reducedMotion();
  // the weather and darkness follow the main screen: the scenery is redrawn when either changes (checked twice a second)
  let env = o.env();
  let sky = drawSky(env.dark, env.weather);
  let land = drawLand(env.dark);
  const night = () => env.dark > 0.5;
  const body = art.characterSprite({
    appearance,
    dir: 'right',
    pose: 'stand',
    frame: 0,
  });
  const alertIcon = art.iconSprite('alert');

  let last: { c: Catch; first: boolean } | null = null;
  let flash: { text: string; until: number } | null = null;
  let clock = 0;
  const splashes: { x: number; y: number; t: number }[] = [];

  const events: Record<FishingEvent, (() => void) | undefined> = {
    cast: undefined,
    bite: () => {
      const b = bobber();
      splashes.push({ x: b.x, y: b.y, t: clock });
    },
    early: () => say(tr('Too early! Wait for the bite')),
    missed: () => say(tr('It got away…')),
    slipped: () => say(tr('It slipped off the hook!')),
    caught: () => {
      const c = session.caught!;
      last = { c, first: record(save, c) };
      writeSave(storage, save);
      const b = bobber();
      splashes.push({ x: b.x, y: b.y, t: clock });
    },
  };
  const session = new Session(
    () => ({ night: night(), rain: env.weather === 'rain' }),
    (e) => events[e]?.(),
  );
  const say = (text: string) => {
    flash = { text, until: clock + 1.8 };
  };

  // ---- DOM
  const canvas = h('canvas', {
    class: 'ui-fish__canvas',
    attrs: { role: 'img', 'aria-label': tr('The pond, seen from the dock') },
  });
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const hint = h('p', {
    class: 'ui-fish__hint',
    attrs: { 'aria-live': 'polite' },
  });
  const result = h('div', {
    class: 'ui-fish__result',
    hidden: true,
    attrs: { role: 'status' },
  });
  const dex = h('div', { class: 'ui-fish__dex', hidden: true });
  const stage = h('div', { class: 'ui-fish__stage', tabIndex: -1 }, canvas, result, dex);
  const dexBtn = h('button', {
    class: 'ui-fish__btn',
    type: 'button',
    on: { click: () => toggleDex() },
  });
  const close = iconButton(ICONS.close, tr('Close'), () => dialog.close(), 'ui-icon-btn--sm');
  const moodEl = h('span', { class: 'ui-fish__mood' });
  const setMood = () => {
    const weather = { clear: null, wind: tr('Windy'), rain: tr('Rain'), snow: tr('Snow') }[env.weather];
    moodEl.textContent = [night() ? tr('Night') : tr('Day'), weather].filter(Boolean).join(' · ');
  };
  setMood();
  const dialog = h(
    'dialog',
    {
      class: 'ui-dialog ui-fish',
      attrs: { 'aria-labelledby': 'ui-fish-title' },
    },
    h(
      'div',
      { class: 'ui-dialog__head' },
      h('h2', {
        text: o.name ? tr('{0} is fishing', [o.name]) : tr('Fishing at the pond'),
        attrs: { id: 'ui-fish-title' },
      }),
      moodEl,
      dexBtn,
      close,
    ),
    stage,
    hint,
  ) as HTMLDialogElement;

  const dexCount = () => FISH.filter((f) => save.count[f.id]).length;
  const refreshDexBtn = () => {
    dexBtn.textContent = tr('Fishdex {0}/{1}', [dexCount(), FISH.length]);
  };
  refreshDexBtn();

  const fishIcon = (f: Fish, scale: number, dark = false): HTMLCanvasElement => {
    const [c, g] = canvasOf(FISH_BOX.w * scale, FISH_BOX.h * scale);
    c.className = 'ui-fish__icon';
    drawFish(g, f, c.width / 2, c.height / 2, scale, dark);
    return c;
  };

  const renderDex = () => {
    dex.replaceChildren(
      h('h3', { text: tr('Fishdex') }),
      h(
        'ul',
        { class: 'ui-fish__cells' },
        ...FISH.map((f) => {
          const got = !!save.count[f.id];
          const cond = f.rain ? tr('Rainy days') : f.time === 'night' ? tr('Night only') : f.time === 'day' ? tr('Day only') : '';
          return h(
            'li',
            { class: `ui-fish__cell${got ? '' : ' is-locked'}` },
            fishIcon(f, 2, !got),
            h('strong', {
              text: got ? f.name() : '???',
              attrs: {
                style: got ? `color:${RARITY[f.rarity].color}` : undefined,
              },
            }),
            h('span', {
              text: got ? tr('{0} cm · caught {1}×', [save.best[f.id], save.count[f.id]]) : cond,
            }),
          );
        }),
      ),
      h('button', {
        class: 'ui-fish__btn',
        type: 'button',
        text: tr('Back'),
        on: { click: () => toggleDex() },
      }),
    );
  };
  function toggleDex(): void {
    dex.hidden = !dex.hidden;
    if (!dex.hidden) renderDex();
    stage.focus();
  }

  const renderResult = () => {
    if (!last) return;
    const { c, first } = last;
    const f = c.fish;
    result.replaceChildren(
      ...[
        f.junk
          ? null
          : h('span', {
              class: 'ui-fish__rar',
              text: RARITY[f.rarity].name(),
              attrs: { style: `color:${RARITY[f.rarity].color}` },
            }),
        fishIcon(f, 3),
        h('strong', { text: f.name() }),
        f.junk ? h('span', { text: c.note }) : h('span', { text: tr('{0} cm', [c.size]) }),
        first
          ? h('span', {
              class: 'ui-fish__new',
              text: tr('New in the Fishdex!'),
            })
          : null,
      ].filter((n): n is HTMLElement => n !== null),
    );
    refreshDexBtn();
  };

  // ---- input
  const isButton = (t: EventTarget | null) => t instanceof HTMLButtonElement;
  const down = (e: KeyboardEvent) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat || isButton(e.target) || !dex.hidden) return;
    e.preventDefault();
    session.press();
  };
  const up = (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    session.release();
  };
  dialog.addEventListener('keydown', down);
  dialog.addEventListener('keyup', up);
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !dex.hidden) return;
    stage.focus();
    stage.setPointerCapture(e.pointerId);
    session.press();
  });
  const letGo = () => session.release();
  stage.addEventListener('pointerup', letGo);
  stage.addEventListener('pointercancel', letGo);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('cancel', (e) => {
    // Esc closes the Fishdex first
    if (!dex.hidden) {
      e.preventDefault();
      toggleDex();
    }
  });

  // ---- size: whole multiples of the 320 x 180 picture
  const fit = () => {
    const room = Math.min(window.innerWidth - 64, 1100) / W;
    const roomH = (window.innerHeight - 190) / H;
    const s = Math.max(1, Math.floor(Math.min(room, roomH)));
    canvas.style.width = `${W * s}px`;
    canvas.style.height = `${H * s}px`;
    stage.style.width = `${W * s}px`;
    stage.style.height = `${H * s}px`;
  };
  window.addEventListener('resize', fit);

  // ---- drawing
  const bobber = (): { x: number; y: number } => {
    const tg = target(session.power);
    const p = session.phase;
    if (p === 'wait' || p === 'bite' || p === 'reel') {
      const bob = calm ? 0 : Math.sin(clock * 3) * 0.6;
      let x = tg.x;
      let y = tg.y + bob;
      if (p === 'wait' && session.t < 0.55) {
        const u = session.t / 0.55;
        x = lerp(tip().x, tg.x, u);
        y = lerp(tip().y, tg.y, u) - Math.sin(u * Math.PI) * 34;
      }
      if (p === 'bite') y += Math.sin(session.t * 40) * 1.2 + 2;
      if (p === 'reel') x += Math.sin(clock * 22) * 1.4;
      return { x: Math.round(x), y: Math.round(y) };
    }
    return { x: tg.x, y: tg.y };
  };
  const tip = (): { x: number; y: number } => {
    switch (session.phase) {
      case 'charge':
        return {
          x: lerp(TIP_REST.x, 100, session.power),
          y: lerp(TIP_REST.y, 84, session.power),
        };
      case 'reel':
        return { x: 128 + (calm ? 0 : Math.sin(clock * 30) * 1), y: 92 };
      default:
        return TIP_REST;
    }
  };

  /** A steady pseudo-random number in 0..1 for (i, k): the same drop always lands in the same lane. */
  const noise = (i: number, k: number): number => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const drawRain = () => {
    // drops slant with the wind: a streak is a few pixels, one column to the left every second row
    for (const [count, len, speed, color] of [
      [110, 2, 130, 'rgba(190,210,240,0.38)'],
      [60, 4, 215, 'rgba(228,238,255,0.72)'],
    ] as const) {
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const t = calm ? 0 : clock;
        const y = (noise(i, speed) * (H + 12) + t * speed) % (H + 12);
        const x = (((noise(i, speed + 1) * (W + 60) - t * speed * 0.3 + y * 0.5) % (W + 60)) + W + 60) % (W + 60);
        for (let j = 0; j < len; j++) ctx.fillRect(Math.round(x) - (j >> 1), Math.round(y) + j - 6, 1, 1);
      }
    }
    // rings on the open water (clear of the bank and the dock): each lives about a second, then lands somewhere else
    if (calm) return;
    ctx.fillStyle = 'rgba(235,244,255,0.8)';
    for (let i = 0; i < 16; i++) {
      const period = 0.7 + noise(i, 3) * 0.6;
      const cycle = Math.floor(clock / period + noise(i, 4));
      const age = (clock / period + noise(i, 4)) % 1;
      const x = 172 + Math.floor(noise(i, cycle + 5) * 140);
      const y = 100 + Math.floor(noise(i, cycle + 9) * 74);
      const r = 1 + Math.round(age * 4);
      ctx.globalAlpha = 1 - age;
      ctx.fillRect(x - r, y, 1, 1);
      ctx.fillRect(x + r, y, 1, 1);
      if (r >= 3) ctx.fillRect(x - r + 2, y - 1, r * 2 - 3, 1);
    }
    ctx.globalAlpha = 1;
  };

  /** Snow: two layers of flakes drifting down and sideways (far ones single pixels, near ones 2 x 2), swaying a little. */
  const drawSnow = () => {
    for (const [count, size, speed, color] of [
      [70, 1, 20, 'rgba(235,242,255,0.6)'],
      [36, 2, 36, 'rgba(255,255,255,0.9)'],
    ] as const) {
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const t = calm ? 0 : clock;
        const y = (noise(i, speed) * (H + 8) + t * speed) % (H + 8);
        const sway = calm ? 0 : Math.sin(t * 0.9 + i) * 5;
        const x = (((noise(i, speed + 1) * W + sway + t * 7) % W) + W) % W;
        ctx.fillRect(Math.round(x), Math.round(y) - 4, size, size);
      }
    }
  };
  /** Wind: long thin gusts racing right to left and a few leaves tumbling along. */
  const drawWind = () => {
    if (calm) return;
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    for (let i = 0; i < 9; i++) {
      const len = 10 + Math.floor(noise(i, 2) * 16);
      const x = ((((noise(i, 3) * (W + 80) - clock * (150 + noise(i, 4) * 90)) % (W + 80)) + W + 80) % (W + 80)) - 40;
      ctx.fillRect(Math.round(x), 30 + Math.floor(noise(i, 5) * 130), len, 1);
    }
    for (let i = 0; i < 6; i++) {
      const x = ((((noise(i, 6) * (W + 40) - clock * (70 + noise(i, 7) * 40)) % (W + 40)) + W + 40) % (W + 40)) - 20;
      const y = 60 + noise(i, 8) * 90 + Math.sin(clock * 3 + i * 2) * 6;
      ctx.fillStyle = i % 2 ? '#7aa84a' : '#b88a3e';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
      ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, 1, 1);
    }
  };

  const draw = () => {
    ctx.drawImage(sky, 0, 0);
    // clouds drift across and wrap round; the grey rainy ones and the dark night ones swap their three tones
    const overcast = env.weather === 'rain' || env.weather === 'snow';
    const tone: Rgb = overcast ? [150, 160, 176] : [255, 255, 255];
    const cloudColors = {
      '#ffffff': css(mix(tone, [60, 72, 108], env.dark)),
      '#dbe8f5': css(mix(mix(tone, [190, 205, 225], 0.5), [52, 62, 98], env.dark)),
      '#b8cde3': css(mix(mix(tone, [160, 180, 210], 0.6), [44, 54, 88], env.dark)),
    };
    const windy = env.weather === 'wind' ? 3.5 : 1;
    for (let i = 0; i < (overcast ? 6 : env.weather === 'wind' ? 4 : 3); i++) {
      const span = W + 90;
      const x = Math.round(((i * 109 + (calm ? 0 : clock * (2.5 + i * 0.7) * windy)) % span) - 50);
      paintGrid(ctx, CLOUDS[i % CLOUDS.length], x, 8 + ((i * 17) % 36), { recolor: cloudColors });
    }
    ctx.drawImage(land, 0, 0);

    // sparkles on the water
    if (!calm) {
      ctx.fillStyle = `rgba(255,255,255,${night() ? 0.35 : 0.7})`;
      for (let i = 0; i < 18; i++) {
        if (Math.sin(clock * 1.7 + i * 2.3) > 0.82) ctx.fillRect(172 + ((i * 53) % 130), 98 + ((i * 29) % 78), 3, 1);
      }
    }

    // the agent, on the dock (jumps when it bites)
    const hop = session.phase === 'bite' ? -Math.abs(Math.sin(session.t * 14)) * 3 : 0;
    const fx = 112;
    const fy = 122 + Math.round(hop);
    ctx.drawImage(body.canvas, fx - body.ax, fy - body.ay);
    const t = tip();
    drawRod(ctx, fx + 6, fy - 14, t.x, t.y);
    // the line and the float
    const p: Phase = session.phase;
    if (p === 'wait' || p === 'bite' || p === 'reel') {
      const b = bobber();
      const slack = p === 'reel' ? 3 : 9;
      let px = t.x;
      let py = t.y;
      for (let i = 1; i <= 24; i++) {
        const u = i / 24;
        const nx = lerp(t.x, b.x, u);
        const ny = lerp(t.y, b.y, u) + Math.sin(u * Math.PI) * slack;
        plot(ctx, Math.round(px), Math.round(py), Math.round(nx), Math.round(ny), 'rgba(240,244,250,0.85)');
        px = nx;
        py = ny;
      }
      ctx.save();
      if (p === 'bite') {
        ctx.beginPath();
        ctx.rect(b.x - 6, b.y - 12, 12, 9);
        ctx.clip();
      }
      paintGrid(ctx, PROP_BOBBER, b.x - 3, b.y - 6);
      ctx.restore();
      if (p !== 'reel') {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        const r = 3 + ((clock * (calm ? 0 : 4)) % 4);
        ctx.strokeRect(b.x - r - 0.5, b.y + 1.5 - r / 3, r * 2 + 1, (r * 2) / 3);
      }
    }
    if (p === 'bite') {
      const a = alertIcon;
      ctx.drawImage(a.canvas, fx - a.ax + 2, fy - body.ay - a.canvas.height - 2 + Math.round(Math.sin(clock * 16) * 1.5));
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      const age = clock - s.t;
      if (age > 0.9) {
        splashes.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(255,255,255,${(0.8 * (1 - age / 0.9)).toFixed(2)})`;
      const r = 3 + age * 16;
      ctx.strokeRect(Math.round(s.x - r) + 0.5, Math.round(s.y - r / 3) + 0.5, Math.round(r * 2), Math.round((r * 2) / 3));
    }

    // night, then the lamp's glow, then the rain
    if (env.dark > 0.02) {
      ctx.fillStyle = `rgba(12,22,56,${(0.22 * env.dark).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (env.dark > 0.3) {
      const g = ctx.createRadialGradient(72, 84, 2, 72, 90, 56);
      g.addColorStop(0, `rgba(255,214,120,${(0.5 * env.dark).toFixed(2)})`);
      g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(10, 30, 130, 120);
    }
    if (env.weather === 'rain') drawRain();
    else if (env.weather === 'snow') drawSnow();
    else if (env.weather === 'wind') drawWind();

    // where the float will land, and the power gauge: a framed row of segments that turn from green to red
    if (p === 'charge') {
      const tg = target(session.power);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [dx, dy, w, h] of [
        [-8, -3, 4, 1],
        [4, -3, 4, 1],
        [-8, 3, 4, 1],
        [4, 3, 4, 1],
        [-9, -2, 1, 5],
        [8, -2, 1, 5],
      ] as const)
        ctx.fillRect(Math.round(tg.x) + dx, Math.round(tg.y) + dy, w, h);
      const gx = 92;
      const gy = 158;
      const n = 16;
      pixelFrame(ctx, gx, gy, n * 3 + 5, 9);
      const on = Math.round(session.power * n);
      for (let i = 0; i < n; i++) {
        const [main, light] = segColor(i, n);
        ctx.fillStyle = i < on ? main : '#242e44';
        ctx.fillRect(gx + 3 + i * 3, gy + 3, 2, 3);
        if (i < on) {
          ctx.fillStyle = light;
          ctx.fillRect(gx + 3 + i * 3, gy + 3, 2, 1);
        }
      }
    }
    if (p === 'reel') drawReel();
  };

  const drawReel = () => {
    const R = session.reel;
    const x = 280;
    const y0 = 20;
    // the track: a framed well with faint guide marks, the green zone as a glassy band, and the fish
    pixelFrame(ctx, x - 3, y0 - 3, 24, TRACK_H + 6);
    ctx.fillStyle = '#1d2840';
    for (let y = 10; y < TRACK_H; y += 10) ctx.fillRect(x + 1, y0 + y, 16, 1);
    const zy = y0 + Math.round(R.zy);
    ctx.fillStyle = R.inZone ? '#4fd070' : '#3c9a58';
    ctx.fillRect(x, zy, 18, ZONE_H);
    ctx.fillStyle = R.inZone ? '#5fe681' : '#46ad65';
    for (let y = 1; y < ZONE_H - 1; y += 2) ctx.fillRect(x + 1 + (y % 4), zy + y, 4, 1);
    ctx.fillStyle = R.inZone ? '#c8fad4' : '#8fd6a2';
    ctx.fillRect(x, zy, 18, 1);
    ctx.fillRect(x, zy, 1, ZONE_H);
    ctx.fillStyle = '#25744a';
    ctx.fillRect(x, zy + ZONE_H - 1, 18, 1);
    ctx.fillRect(x + 17, zy, 1, ZONE_H);
    drawMarker(ctx, session.caught!.fish, x + 9, y0 + R.fy + FISH_H / 2);
    // the catch meter: segments fill from the bottom, red to green
    const mx = x + 24;
    pixelFrame(ctx, mx - 2, y0 - 3, 10, TRACK_H + 6);
    const n = Math.floor(TRACK_H / 4);
    const lit = Math.round(R.prog * n);
    for (let i = 0; i < n; i++) {
      const [main, light] = segColor(n - 1 - i, n);
      const sy = y0 + TRACK_H - (i + 1) * 4 + 1;
      ctx.fillStyle = i < lit ? main : '#242e44';
      ctx.fillRect(mx, sy, 6, 3);
      if (i < lit) {
        ctx.fillStyle = light;
        ctx.fillRect(mx, sy, 6, 1);
      }
    }
  };

  // ---- loop
  const hints: Record<Phase, () => string> = {
    idle: () => tr('Hold Space (or press and hold) to cast'),
    charge: () => tr('Let go to cast: the farther, the rarer the fish'),
    wait: () => tr('Wait for a bite…'),
    bite: () => tr('Now! Press to hook it!'),
    reel: () => tr('Hold to raise the green zone and keep the fish inside it'),
    result: () => tr('Press to keep fishing'),
  };
  let shown: Phase | null = null;
  let shownFlash: string | null = null;
  let raf = 0;
  let prev = 0;
  let envCheck = 0;
  const frame = (ts: number) => {
    const dt = Math.min(0.1, prev ? (ts - prev) / 1000 : 0);
    prev = ts;
    clock += dt;
    if (clock - envCheck > 0.5) {
      envCheck = clock;
      const now = o.env();
      if (now.weather !== env.weather || Math.abs(now.dark - env.dark) > 0.03) {
        env = now;
        sky = drawSky(env.dark, env.weather);
        land = drawLand(env.dark);
        setMood();
      }
    }
    session.update(dt);
    if (flash && clock > flash.until) flash = null;
    const phase = session.phase;
    if (phase !== shown) {
      shown = phase;
      result.hidden = phase !== 'result';
      if (phase === 'result') renderResult();
    }
    const text = flash?.text ?? hints[phase]();
    if (text !== shownFlash) {
      shownFlash = text;
      hint.textContent = text;
      hint.classList.toggle('is-flash', !!flash);
    }
    draw();
    raf = requestAnimationFrame(frame);
  };

  dialog.addEventListener('close', () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', fit);
    dialog.remove();
  });
  o.root.append(dialog);
  fit();
  dialog.showModal();
  stage.focus();
  raf = requestAnimationFrame(frame);
}
