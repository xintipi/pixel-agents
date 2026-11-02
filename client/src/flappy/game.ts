// Flappy mini game: a modal <dialog> over the office, opened by clicking the lounge TV. A 320 x 180 canvas scaled by whole numbers
// draws the scene (sprites hand-drawn in Pixelorama: bird, pipes, ground, skyline, hills); the title, scores and the game over card
// are DOM. Loaded on first use (dynamic import). Local only: the best score lives in localStorage ('habblaud:flappy').
import { tr } from '../../../shared/i18n';
import * as artModule from '../art';
import type { Appearance, ArtModule } from '../art/api';
import { paintGrid, type PixelGrid } from '../art/handdrawn/grid';
import { CLOUDS, css, mix, type Rgb } from '../fishing/sky';
import { h, iconButton } from '../ui/dom';
import { ICONS } from '../ui/icons';
import { safeLocalStorage } from '../ui/prefs';
import { reducedMotion } from '../world/render/github-fx';
import { BIRD_X, Flappy, GAP, GROUND_Y, H, loadBest, saveBest, W } from './flappy';
import { FLAPPY_BIRD_0 } from './sprites/flappy-bird-0';
import { FLAPPY_BIRD_1 } from './sprites/flappy-bird-1';
import { FLAPPY_BIRD_2 } from './sprites/flappy-bird-2';
import { FLAPPY_BIRD_3 } from './sprites/flappy-bird-3';
import { FLAPPY_DIGITS } from './sprites/flappy-digits';
import { FLAPPY_GROUND } from './sprites/flappy-ground';
import { FLAPPY_HILLS } from './sprites/flappy-hills';
import { FLAPPY_PIPE_BODY } from './sprites/flappy-pipe-body';
import { FLAPPY_PIPE_CAP } from './sprites/flappy-pipe-cap';
import { FLAPPY_SKYLINE } from './sprites/flappy-skyline';

export interface FlappyOptions {
  /** Where the dialog goes (the `.ui-root`, which carries the interface colours). */
  root: HTMLElement;
  /** The agent that plays; without one, a default look. */
  appearance: Appearance | null;
  name: string | null;
  /** 0 (day) to 1 (night), as the office draws it. */
  dark: number;
}

function canvasOf(w: number, d: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = d;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const hexRgb = (c: string): Rgb => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as unknown as Rgb;

const imageOf = (g: PixelGrid, w: number, d: number): HTMLCanvasElement => {
  const [c, ctx] = canvasOf(w, d);
  paintGrid(ctx, g);
  return c;
};

export function openFlappy(o: FlappyOptions): void {
  if (o.root.querySelector('.ui-flap')) return;
  const art = artModule as ArtModule;
  const appearance = o.appearance ?? art.appearanceFromSeed(7);
  const storage = safeLocalStorage();
  const calm = reducedMotion();
  const game = new Flappy(loadBest(storage), Math.random, !calm);

  // ---- art, prepared once
  const sky = (() => {
    const [c, ctx] = canvasOf(W, GROUND_Y);
    const top = mix([104, 180, 248], [8, 14, 38], o.dark);
    const low = mix([196, 232, 255], [44, 60, 104], o.dark);
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = css(mix(top, low, i / (bands - 1)));
      ctx.fillRect(0, Math.floor((i * GROUND_Y) / bands), W, Math.ceil(GROUND_Y / bands) + 1);
    }
    if (o.dark > 0.35) {
      ctx.fillStyle = `rgba(255,255,240,${Math.min(1, (o.dark - 0.35) * 2)})`;
      let s = 7;
      for (let i = 0; i < 34; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const x = s % W;
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        ctx.fillRect(x, s % 80, 1, 1);
      }
    }
    return c;
  })();
  const skyline = imageOf(FLAPPY_SKYLINE, 320, 64);
  const hills = imageOf(FLAPPY_HILLS, 320, 30);
  const ground = imageOf(FLAPPY_GROUND, 48, 24);
  const digits = imageOf(FLAPPY_DIGITS, 70, 9);
  // lit windows for the night: only the window pixels of the skyline, in a warm colour
  const windows = imageOf(
    {
      palette: Object.fromEntries(Object.entries(FLAPPY_SKYLINE.palette).map(([k, c]) => [k, c === '#e9f1fa' ? '#ffd98a' : ''])),
      rows: FLAPPY_SKYLINE.rows,
    },
    320,
    64,
  );
  const pipeTop = (() => {
    // a pipe hanging from the top edge: body tiles, the cap at its lower end; the pipe below the gap is this one flipped
    const [c, ctx] = canvasOf(34, GROUND_Y);
    const capH = FLAPPY_PIPE_CAP.rows.length;
    for (let y = 0; y < GROUND_Y - capH; y += 8) paintGrid(ctx, FLAPPY_PIPE_BODY, 3, y);
    paintGrid(ctx, FLAPPY_PIPE_CAP, 0, GROUND_Y - capH);
    return c;
  })();
  const pipeBottom = (() => {
    const [c, ctx] = canvasOf(34, GROUND_Y);
    ctx.scale(1, -1);
    ctx.drawImage(pipeTop, 0, -GROUND_Y);
    return c;
  })();
  // the bird takes the agent's colours: its wing is the shirt colour (when that stands out from the yellow body and the dark outline,
  // else the accent, else the original orange) and the little crest on its head is the hair
  const luma = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const BODY: Rgb = [246, 201, 69];
  const stands = (c: string) => {
    const r = hexRgb(c);
    return Math.hypot(r[0] - BODY[0], r[1] - BODY[1], r[2] - BODY[2]) > 90 && luma(r) > 60;
  };
  const wingColor = [appearance.top, appearance.topAccent].find(stands) ?? '#f0a22e';
  const hair = luma(hexRgb(appearance.hair)) < 80 ? css(mix(hexRgb(appearance.hair), [255, 255, 255], 0.45)) : appearance.hair;
  // (the wing is cream with its own dark outline; it takes a pale tint of the shirt colour, the white highlight stays)
  const wing = { '#fff0b0': css(mix(hexRgb(wingColor), [255, 255, 255], 0.68)) };
  const frames = [FLAPPY_BIRD_0, FLAPPY_BIRD_1, FLAPPY_BIRD_2, FLAPPY_BIRD_3].map((g) => {
    const [c, bctx] = canvasOf(g.rows[0].length, g.rows.length);
    paintGrid(bctx, g, 0, 0, { recolor: wing });
    for (const [x, y, k] of [
      [12, 3, 'o'],
      [13, 3, 'o'],
      [12, 2, 'h'],
      [13, 2, 'h'],
      [11, 2, 'o'],
      [14, 2, 'o'],
      [12, 1, 'o'],
      [13, 1, 'o'],
    ] as const) {
      bctx.fillStyle = k === 'o' ? '#3d2b35' : hair;
      bctx.fillRect(x, y, 1, 1);
    }
    return c;
  });

  let clock = 0;
  let flapAt = -1;
  let shakeUntil = 0;
  let shown: string | null = null;

  // ---- DOM
  const canvas = h('canvas', { class: 'ui-flap__canvas', attrs: { role: 'img', 'aria-label': tr('A bird flapping between pipes') } });
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const over = h('div', { class: 'ui-flap__over', hidden: true, attrs: { role: 'status' } });
  const hint = h('p', { class: 'ui-flap__hint', attrs: { 'aria-live': 'polite' } });
  const stage = h('div', { class: 'ui-flap__stage', tabIndex: -1 }, canvas, over);
  const scoreEl = h('span', { class: 'ui-flap__score' });
  const bestEl = h('span', { class: 'ui-flap__score' });
  const close = iconButton(ICONS.close, tr('Close'), () => dialog.close(), 'ui-icon-btn--sm');
  const dialog = h(
    'dialog',
    { class: 'ui-dialog ui-flap', attrs: { 'aria-labelledby': 'ui-flap-title' } },
    h(
      'div',
      { class: 'ui-dialog__head' },
      h('h2', { text: o.name ? tr('{0} flaps away', [o.name]) : tr('Flappy at the office'), attrs: { id: 'ui-flap-title' } }),
      scoreEl,
      bestEl,
      close,
    ),
    stage,
    hint,
  ) as HTMLDialogElement;

  const flap = () => {
    const before = game.phase;
    game.press();
    if (game.phase === 'playing') flapAt = clock;
    if (before === 'dead' && game.phase === 'ready') over.hidden = true;
  };

  // ---- input
  const isButton = (t: EventTarget | null) => t instanceof HTMLButtonElement;
  dialog.addEventListener('keydown', (e) => {
    if (![' ', 'Enter', 'ArrowUp'].includes(e.key) || e.repeat || isButton(e.target)) return;
    e.preventDefault();
    flap();
  });
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stage.focus();
    flap();
  });
  dialog.addEventListener('click', (e) => {
    // a click on the backdrop (outside the box) closes; a tap on the dialog's own padding is just a missed flap
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });

  // ---- size: whole multiples of the 320 x 180 picture
  const fit = () => {
    const s = Math.max(1, Math.floor(Math.min((window.innerWidth - 64) / W, (window.innerHeight - 190) / H, 1100 / W)));
    for (const el of [canvas, stage]) {
      el.style.width = `${W * s}px`;
      el.style.height = `${H * s}px`;
    }
  };
  window.addEventListener('resize', fit);

  // ---- drawing
  const frameOf = (): number => {
    if (game.phase === 'dead') return 3;
    if (game.phase === 'ready') return calm ? 1 : [0, 1, 2, 1][Math.floor(clock * 8) % 4];
    const since = clock - flapAt;
    return since < 0.1 ? 0 : since < 0.22 ? 1 : 2;
  };

  const draw = () => {
    const shake = !calm && clock < shakeUntil ? Math.round(Math.sin(clock * 90) * 2) : 0;
    ctx.setTransform(1, 0, 0, 1, shake, 0);
    ctx.drawImage(sky, 0, 0);
    // clouds, then the city and the hills, each scrolling slower than the ground
    const drift = calm ? 0 : clock;
    const tone: Rgb = mix([255, 255, 255], [60, 72, 108], o.dark);
    const cloudColors = {
      '#ffffff': css(tone),
      '#dbe8f5': css(mix(tone, [190, 205, 225], 0.4)),
      '#b8cde3': css(mix(tone, [160, 180, 210], 0.5)),
    };
    for (let i = 0; i < 3; i++) {
      const span = W + 80;
      const x = ((((i * 130 + 40 - drift * (3 + i * 1.5)) % span) + span) % span) - 40;
      paintGrid(ctx, CLOUDS[i], Math.round(x), 14 + i * 22, { recolor: cloudColors });
    }
    const sx = (k: number, w: number) => -Math.floor((game.scroll * k) % w);
    ctx.drawImage(skyline, sx(0.15, 320), GROUND_Y - 62);
    ctx.drawImage(skyline, sx(0.15, 320) + 320, GROUND_Y - 62);
    ctx.drawImage(hills, sx(0.4, 320), GROUND_Y - 28);
    ctx.drawImage(hills, sx(0.4, 320) + 320, GROUND_Y - 28);
    if (o.dark > 0.02) {
      ctx.fillStyle = `rgba(12,22,56,${(0.26 * o.dark).toFixed(3)})`;
      ctx.fillRect(0, 0, W, GROUND_Y);
    }
    if (o.dark > 0.3) {
      ctx.globalAlpha = Math.min(1, (o.dark - 0.3) * 1.6);
      ctx.drawImage(windows, sx(0.15, 320), GROUND_Y - 62);
      ctx.drawImage(windows, sx(0.15, 320) + 320, GROUND_Y - 62);
      ctx.globalAlpha = 1;
    }
    // pipes
    for (const p of game.pipes) {
      const x = Math.round(p.x) - 3;
      const gapTop = Math.round(p.gapY - GAP / 2);
      const gapBot = Math.round(p.gapY + GAP / 2);
      if (gapTop > 0) ctx.drawImage(pipeTop, 0, GROUND_Y - gapTop, 34, gapTop, x, 0, 34, gapTop);
      if (gapBot < GROUND_Y) ctx.drawImage(pipeBottom, 0, 0, 34, GROUND_Y - gapBot, x, gapBot, 34, GROUND_Y - gapBot);
    }
    // ground, scrolling a tile at a time
    const gx = -Math.floor(game.scroll % 48);
    for (let x = gx; x < W; x += 48) ctx.drawImage(ground, x, GROUND_Y);
    if (o.dark > 0.02) {
      ctx.fillStyle = `rgba(12,22,56,${(0.18 * o.dark).toFixed(3)})`;
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    }
    // the bird (dead: upside down, with an X for an eye)
    const f = frames[frameOf()];
    const bx = Math.round(BIRD_X - f.width / 2);
    const by = Math.round(game.y - f.height / 2);
    if (game.phase === 'dead') {
      ctx.save();
      ctx.translate(0, by * 2 + f.height);
      ctx.scale(1, -1);
      ctx.drawImage(f, bx, by);
      ctx.restore();
    } else ctx.drawImage(f, bx, by);
    // night
    if (o.dark > 0.02) {
      ctx.fillStyle = `rgba(12,22,56,${(0.1 * o.dark).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (game.phase !== 'ready') {
      const text = String(game.score);
      const x0 = Math.round(W / 2 - (text.length * 6 + 1) / 2);
      [...text].forEach((ch, i) => ctx.drawImage(digits, Number(ch) * 7, 0, 7, 9, x0 + i * 6, 12, 7, 9));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // ---- loop
  const renderOver = () => {
    over.replaceChildren(
      h('strong', { text: tr('Game over') }),
      h('span', { text: tr('Score {0}', [game.score]) }),
      h('span', { text: tr('Best {0}', [game.best]) }),
      ...(game.newBest ? [h('span', { class: 'ui-flap__new', text: tr('New best!') })] : []),
      h('span', { class: 'ui-flap__again', text: tr('Press to try again') }),
    );
  };
  const hints = {
    ready: () => tr('Press Space, click or tap to flap'),
    playing: () => tr('Fly through the gaps between the pipes'),
    dead: () => tr('Press to try again'),
  };
  let raf = 0;
  let prev = 0;
  const frame = (ts: number) => {
    const dt = prev ? (ts - prev) / 1000 : 0;
    prev = ts;
    clock += Math.min(dt, 0.1);
    const phaseBefore = game.phase;
    game.update(dt);
    if (phaseBefore !== 'dead' && game.phase === 'dead') {
      saveBest(storage, game.best);
      shakeUntil = clock + 0.25;
      renderOver();
      over.hidden = false;
    }
    const key = `${game.phase}:${game.score}:${game.best}`;
    if (key !== shown) {
      shown = key;
      scoreEl.textContent = tr('Score {0}', [game.score]);
      bestEl.textContent = tr('Best {0}', [game.best]);
      hint.textContent = hints[game.phase]();
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
