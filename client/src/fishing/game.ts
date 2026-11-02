// Fishing mini game: a modal <dialog> over the office, opened by clicking the pond across the street. The canvas draws a 320 x 180 picture
// at a whole number of device pixels per picture pixel (see scene.ts for the scenery, its layers and its motion); this file has the agent
// on the dock, the rod, the line and the float, the gauges, and the DOM: the texts, the result card and the Fishdex. Loaded on first use
// (dynamic import). Local only: the Fishdex lives in localStorage ('habblaud:fishing'), nothing goes to the server.
import { tr } from '../../../shared/i18n';
import * as artModule from '../art';
import type { Appearance, ArtModule } from '../art/api';
import { paintGrid } from '../art/handdrawn/grid';
import { h, iconButton } from '../ui/dom';
import { ICONS } from '../ui/icons';
import { safeLocalStorage } from '../ui/prefs';
import { reducedMotion } from '../world/render/github-fx';
import { drawFish, drawMarker, FISH_BOX } from './art';
import { FISH, loadSave, RARITY, record, writeSave, type Catch, type Fish } from './fish';
import { createScene, H, W, type Env } from './scene';
import { FISH_H, Session, TRACK_H, ZONE_H, type FishingEvent, type Phase } from './session';
import { lerp } from './sky';
import { PROP_BOBBER } from './sprites/prop-bobber';

/** Where the tip of the rod rests: a long, slender rod leaning out over the water. */
const TIP_REST = { x: 154, y: 74 };
/** How long the float flies after a cast (s). */
const FLIGHT = 0.55;

export interface FishingOptions {
  /** Where the dialog goes (the `.ui-root`, which carries the interface colours). */
  root: HTMLElement;
  /** The agent that fishes; without one, a default look. */
  appearance: Appearance | null;
  name: string | null;
  /** The office's darkness (0 day .. 1 night) and weather right now: read again as they change while the game is open. */
  env(): Env;
}

/** Where the float lands for a cast of strength p (0..1): farther is higher up the picture and farther right. */
const target = (p: number): { x: number; y: number } => ({
  x: 156 + p * 124,
  y: 146 - p * 36,
});

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
  const scene = createScene(env, calm);
  const night = () => env.dark > 0.5;
  const body = art.characterSprite({
    appearance,
    dir: 'right',
    pose: 'stand',
    frame: 0,
  });
  const alertIcon = art.iconSprite('alert');
  /** The agent's sprite with the same night and overcast tints as the scenery (lighting, not a redraw). */
  const lit = (e: Env): HTMLCanvasElement => {
    const [c, bctx] = canvasOf(body.canvas.width, body.canvas.height);
    bctx.drawImage(body.canvas, 0, 0);
    bctx.globalCompositeOperation = 'source-atop';
    if (e.weather === 'rain' || e.weather === 'snow') {
      bctx.fillStyle = 'rgba(110,122,146,0.14)';
      bctx.fillRect(0, 0, c.width, c.height);
    }
    if (e.dark > 0.02) {
      bctx.fillStyle = `rgba(14,24,58,${(0.28 * e.dark).toFixed(3)})`;
      bctx.fillRect(0, 0, c.width, c.height);
    }
    return c;
  };
  let bodyImg = lit(env);

  let last: { c: Catch; first: boolean } | null = null;
  let flash: { text: string; until: number } | null = null;
  let clock = 0;
  /** Device pixels per picture pixel (whole CSS multiple x the screen's own pixel ratio): moving things are placed to the nearest 1 / S. */
  let S = 3;
  const snap = (v: number): number => Math.round(v * S) / S;
  const splashes: { x: number; y: number; t: number }[] = [];

  // the float rides a spring (it plunks when it lands, dips on a bite, is pulled in as the catch meter fills); the line eases between slack and taut
  const fl = { x: TIP_REST.x, y: TIP_REST.y, vx: 0, vy: 0, active: false, flying: false };
  let sag = 9;
  let tipX = TIP_REST.x;
  let tipY = TIP_REST.y;
  let shownProg = 0.35;

  const events: Record<FishingEvent, (() => void) | undefined> = {
    cast: undefined,
    bite: () => splashes.push({ x: fl.x, y: fl.y, t: clock }),
    early: () => say(tr('Too early! Wait for the bite')),
    missed: () => say(tr('It got away…')),
    slipped: () => say(tr('It slipped off the hook!')),
    caught: () => {
      const c = session.caught!;
      last = { c, first: record(save, c) };
      writeSave(storage, save);
      splashes.push({ x: fl.x, y: fl.y, t: clock });
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
  const ctx = canvas.getContext('2d')!;

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

  // ---- size: whole multiples of the 320 x 180 picture, with the canvas bitmap at the screen's real resolution (a CSS stretch would make
  // every motion jump a whole CSS pixel, 2 device pixels on a Retina screen)
  const fit = () => {
    const room = Math.min(window.innerWidth - 64, 1100) / W;
    const roomH = (window.innerHeight - 190) / H;
    const cssScale = Math.max(1, Math.floor(Math.min(room, roomH)));
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    S = cssScale * dpr;
    canvas.width = W * S;
    canvas.height = H * S;
    canvas.style.width = `${W * cssScale}px`;
    canvas.style.height = `${H * cssScale}px`;
    stage.style.width = `${W * cssScale}px`;
    stage.style.height = `${H * cssScale}px`;
    ctx.imageSmoothingEnabled = false; // resizing the bitmap resets it
    scene.setScale(S);
  };
  window.addEventListener('resize', fit);

  // ---- the rod, the line and the float (motion)
  /** Where the rod's tip wants to be. */
  const tipTarget = (): { x: number; y: number } => {
    switch (session.phase) {
      case 'charge':
        return { x: lerp(TIP_REST.x, 100, session.power), y: lerp(TIP_REST.y, 66, session.power) };
      case 'reel':
        return { x: 142 + (calm ? 0 : Math.sin(clock * 30) * 0.7), y: 84 };
      default:
        return TIP_REST;
    }
  };
  /** Where the float wants to be, apart from its flight. */
  const floatTarget = (): { x: number; y: number } => {
    const tg = target(session.power);
    const p = session.phase;
    let x = tg.x;
    let y = tg.y + (calm ? 0 : Math.sin(clock * 3) * 0.6);
    if (p === 'bite') y += 2.2 + (calm ? 0 : Math.sin(session.t * 38) * 0.9);
    if (p === 'reel') {
      // reeled in as the catch meter fills, and thrashing a little
      const pull = Math.min(1, shownProg) ** 1.3 * 0.7;
      x = lerp(tg.x, 150, pull) + (calm ? 0 : Math.sin(clock * 20) * 1.1);
      y = lerp(tg.y, 132, pull);
    }
    return { x, y };
  };
  const updateMotion = (dt: number) => {
    const k = 1 - Math.exp(-dt * 14);
    const tt = tipTarget();
    tipX += (tt.x - tipX) * k;
    tipY += (tt.y - tipY) * k;
    shownProg += (session.reel.prog - shownProg) * (1 - Math.exp(-dt * 10));
    const p = session.phase;
    if (p !== 'wait' && p !== 'bite' && p !== 'reel') {
      fl.active = false;
      fl.flying = false;
      return;
    }
    const tg = floatTarget();
    if (!fl.active) {
      fl.active = true;
      fl.flying = true;
      fl.vx = fl.vy = 0;
    }
    if (p === 'wait' && session.t < FLIGHT) {
      // the cast: along an arc from the tip to where it lands
      const u = session.t / FLIGHT;
      const e = 1 - (1 - u) ** 2;
      fl.x = lerp(tipX, tg.x, e);
      fl.y = lerp(tipY, tg.y, e) - Math.sin(u * Math.PI) * 34;
      fl.flying = true;
      return;
    }
    if (fl.flying) {
      fl.flying = false;
      fl.vy = 70;
      splashes.push({ x: fl.x, y: tg.y, t: clock });
    }
    // a damped spring toward the target, in small steps so it stays stable
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      fl.vx += ((tg.x - fl.x) * 120 - fl.vx * 11) * sdt;
      fl.vy += ((tg.y - fl.y) * 120 - fl.vy * 11) * sdt;
      fl.x += fl.vx * sdt;
      fl.y += fl.vy * sdt;
    }
    const sagTarget = p === 'reel' ? 1.5 : p === 'bite' ? 5 : 10;
    sag += (sagTarget - sag) * (1 - Math.exp(-dt * 5));
  };

  /**
   * The rod: a slim cork-and-tape grip held in the hand (part of it behind the hand), a little reel under it, then one long shaft that thins
   * to a hairline tip (one pixel wide), with four line guides along it. It follows a curve (a quadratic bezier from the butt to the tip) that bows more the
   * harder the fish pulls, `bend` px out to the side (down for a load, back for the wind-up).
   */
  const drawRod = (hx: number, hy: number, x1: number, y1: number, bend: number) => {
    const dx = x1 - hx;
    const dy = y1 - hy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    // from 6 px behind the hand to the tip
    const x0 = hx - ux * 6;
    const y0 = hy - uy * 6;
    const total = len + 6;
    const cx = (x0 + x1) / 2 + nx * bend;
    const cy = (y0 + y1) / 2 + ny * bend;
    const at = (t: number): [number, number] => [
      (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1,
      (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1,
    ];
    const n = Math.ceil(total * S);
    const gripEnd = 0.17;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const [x, y] = at(t);
      if (t < gripEnd) {
        // the grip: dark with a pale tape wrap every few pixels, and a cork butt
        const k = Math.floor(t * total);
        ctx.fillStyle = t < 0.03 ? '#b98c58' : k % 4 === 2 ? '#d9c9a0' : '#3a2a24';
        ctx.fillRect(snap(x), snap(y), 2, 2);
      } else {
        // the shaft: a single pixel wide, slightly lighter toward the tip, with a pale tip
        ctx.fillStyle = t > 0.9 ? '#d9b27a' : t > 0.5 ? '#8a6038' : '#6b4a2b';
        ctx.fillRect(snap(x), snap(y), 1, 1);
      }
    }
    // the reel, a little under the grip
    const [rx, ry] = at(0.17);
    const px = snap(rx + nx * 3);
    const py = snap(ry + ny * 3);
    ctx.fillStyle = '#2e3648';
    ctx.fillRect(px - 1, py - 1, 4, 4);
    ctx.fillStyle = '#aab3c2';
    ctx.fillRect(px, py, 2, 2);
    ctx.fillStyle = '#e8454a';
    ctx.fillRect(px + 2, py + 3, 1, 1);
    // the line guides
    ctx.fillStyle = '#e8ecf5';
    for (const t of [0.4, 0.6, 0.78, 0.92]) {
      const [gx, gy] = at(t);
      ctx.fillRect(snap(gx + nx * 1.5), snap(gy + ny * 1.5) + 1, 1, 1);
    }
  };

  /** A ring on the water: a flat ellipse of single pixels (rx wide, a third as tall). */
  const ring = (x: number, y: number, rx: number, alpha: number) => {
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    const steps = Math.max(10, Math.round(rx * 5));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.fillRect(snap(x + Math.cos(a) * rx), snap(y + Math.sin(a) * rx * 0.33), 1, 1);
    }
  };

  // ---- drawing
  const draw = () => {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    scene.drawBack(ctx, clock);

    // the agent, on the dock (jumps when it bites)
    const hop = session.phase === 'bite' ? -Math.abs(Math.sin(session.t * 14)) * 3 : 0;
    const fx = 112;
    const fy = 122 + Math.round(hop);
    ctx.drawImage(bodyImg, fx - body.ax, fy - body.ay);
    const p: Phase = session.phase;
    const bend = p === 'reel' ? 2.6 + (calm ? 0 : Math.sin(clock * 9) * 0.6) : p === 'charge' ? -1.2 * session.power : 0.8;
    drawRod(fx + 6, fy - 14, tipX, tipY, bend);

    // the line and the float
    if (fl.active) {
      const x = fl.x;
      const y = fl.y;
      ctx.fillStyle = 'rgba(240,244,250,0.85)';
      const len = Math.hypot(x - tipX, y - tipY);
      const n = Math.max(2, Math.ceil(len * S));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        ctx.fillRect(snap(lerp(tipX, x, u)), snap(lerp(tipY, y, u) + Math.sin(u * Math.PI) * sag), 1, 1);
      }
      ctx.save();
      if (p === 'bite') {
        ctx.beginPath();
        ctx.rect(snap(x) - 6, snap(y) - 12, 12, 9);
        ctx.clip();
      }
      paintGrid(ctx, PROP_BOBBER, Math.round(x) - 3, Math.round(y) - 6);
      ctx.restore();
      if (p !== 'reel') ring(x, y + 1.5, 3 + ((clock * (calm ? 0 : 3)) % 5), 0.4);
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
      ring(s.x, s.y + 1.5, 3 + age * 16, 0.8 * (1 - age / 0.9));
    }

    scene.drawFront(ctx, clock);

    // where the float will land, and the power gauge: a framed row of segments that turn from green to red
    if (p === 'charge') {
      const tg = target(session.power);
      const pulse = calm ? 1 : 0.7 + 0.3 * Math.sin(clock * 9);
      ctx.fillStyle = `rgba(255,255,255,${(0.85 * pulse).toFixed(2)})`;
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
    const zy = y0 + snap(R.zy);
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
    drawMarker(ctx, session.caught!.fish, x + 9, y0 + snap(R.fy) + FISH_H / 2);
    // the catch meter: segments fill from the bottom, red to green (its value eases toward the real one)
    const mx = x + 24;
    pixelFrame(ctx, mx - 2, y0 - 3, 10, TRACK_H + 6);
    const n = Math.floor(TRACK_H / 4);
    const lit = Math.round(shownProg * n);
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
        scene.setEnv(env);
        bodyImg = lit(env);
        setMood();
      }
    }
    session.update(dt);
    updateMotion(dt);
    if (flash && clock > flash.until) flash = null;
    const phase = session.phase;
    if (phase !== shown) {
      shown = phase;
      if (phase === 'reel') shownProg = session.reel.prog;
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
