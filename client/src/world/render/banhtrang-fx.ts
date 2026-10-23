// Night bánh tráng nướng stand (sim/banhtrang.ts): the sprite (low metal stand, round clay brazier with glowing coals,
// the grill grate with a rice paper on it, the toppings), the charcoal smoke drifting off it and the coals' glow at
// night. Same art direction as render/props.ts.

/** Sprite with its anchor (bottom center), like props.ts's PropSprite. */
interface Sprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

let standCache: Sprite | null = null;

/**
 * The stand (anchor: bottom center): a low black metal stand with a tray; on its west half (by her stool) a round
 * terracotta brazier, red-hot charcoal under a wire grate and a round rice paper grilling on it, egg spread, scallions
 * and orange dried shrimp on top; on the east half the toppings (a stack of rice papers, a cup of beaten quail eggs, a
 * jar of scallion oil, squeeze bottles of chili sauce and mayo); a white styrofoam box underneath.
 */
export function banhtrangStandSprite(): Sprite {
  if (standCache) return standCache;
  const W = 32;
  const H = 26;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const o = '#1d2733';
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // contact shadow
  ctx.fillStyle = 'rgba(28,36,52,0.28)';
  for (let y = -2; y <= 2; y++) {
    const half = Math.round(15 * Math.sqrt(Math.max(0, 1 - (y * y) / 4)));
    ctx.fillRect(16 - half, 24 + y, half * 2, 1);
  }
  // styrofoam box under the tray, between the legs
  px(o, 13, 17, 14, 7);
  px('#f2f3f0', 14, 18, 12, 5);
  px('#ffffff', 14, 18, 12, 1);
  px('#cfd3d6', 14, 22, 12, 1);
  px('#3f8fd8', 18, 20, 4, 1);
  // four thin black legs (the front two a shade lighter) and the cross bar
  for (const [x, col] of [[2, '#3a3f4a'], [29, '#3a3f4a'], [4, '#2a2e36'], [27, '#2a2e36']] as const) px(col, x, 15, 1, 9);
  px('#2a2e36', 2, 21, 28, 1);
  // the tray: dark metal, a light rim
  px(o, 1, 13, 30, 3);
  px('#5a6272', 2, 13, 28, 1);
  px('#3a3f4a', 2, 14, 28, 1);
  // the brazier (west half): round terracotta pot, darker band, little side vent showing the embers
  px(o, 2, 6, 14, 8);
  px('#b5603a', 3, 7, 12, 6);
  px('#d07a4a', 3, 7, 3, 6);
  px('#8a4329', 12, 7, 3, 6);
  px('#7a3a24', 3, 10, 12, 1);
  px('#1d1410', 7, 11, 4, 2);
  px('#ff7a2a', 8, 11, 2, 1);
  px('#ffcf5c', 8, 12, 1, 1);
  // the coals in the mouth of the pot
  px('#2a1d18', 3, 5, 12, 2);
  for (const [x, col] of [[4, '#ff5a2a'], [6, '#ffcf5c'], [8, '#ff8a3c'], [10, '#ff5a2a'], [12, '#ffb347'], [14, '#c9361f']] as const) px(col, x, 6, 1, 1);
  // the wire grate over the coals
  px('#9aa3b5', 2, 4, 14, 1);
  for (const x of [3, 6, 9, 12, 15]) px('#6b7280', x, 4, 1, 1);
  // the round rice paper on the grate (seen a little from above): crisp edge, egg, scallions, dried shrimp, sausage
  px('#c98f45', 4, 1, 10, 1);
  px('#c98f45', 3, 2, 12, 2);
  px('#e9c27a', 5, 1, 8, 1);
  px('#f2c94c', 5, 2, 8, 2);
  px('#ffe08a', 6, 2, 3, 1);
  px('#4fae58', 6, 3, 1, 1);
  px('#4fae58', 9, 2, 1, 1);
  px('#4fae58', 11, 3, 1, 1);
  px('#f08a4a', 8, 3, 1, 1);
  px('#f08a4a', 12, 2, 1, 1);
  px('#c4402f', 10, 3, 1, 1);
  px('#fff2c4', 7, 2, 1, 1);
  // toppings on the east half of the tray
  // stack of round rice papers
  px(o, 17, 10, 6, 4);
  px('#efe6cf', 17, 10, 6, 3);
  px('#fbf6e8', 17, 10, 6, 1);
  px('#d9cdb0', 17, 12, 6, 1);
  // a cup of beaten quail eggs
  px(o, 23, 9, 4, 5);
  px('#e9edf1', 23, 10, 4, 3);
  px('#f2a73c', 23, 9, 4, 1);
  // a little jar of scallion oil
  px(o, 27, 10, 3, 4);
  px('#5fb35a', 27, 11, 3, 2);
  px('#9ad27a', 27, 10, 3, 1);
  // squeeze bottles: chili sauce (red) and mayo (yellow), standing at the back
  px(o, 20, 4, 3, 6);
  px('#d9342b', 20, 5, 3, 5);
  px('#f06a6a', 20, 5, 1, 4);
  px('#f4f6f8', 21, 3, 1, 1);
  px(o, 24, 5, 3, 4);
  px('#f2d25c', 24, 6, 3, 3);
  px('#fff1a0', 24, 6, 1, 2);
  px('#f4f6f8', 25, 4, 1, 1);
  // the little tongs resting on the tray's edge
  px('#c9d0db', 15, 12, 4, 1);
  standCache = { canvas: c, ax: 16, ay: 24 };
  return standCache;
}

/**
 * Charcoal smoke over the brazier (coals at x, y): small gray puffs rising, growing and drifting east, fading out.
 * `still` (reduced motion): a couple of steady faint puffs.
 */
export function drawCharcoalSmoke(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, still: boolean): void {
  const alpha = ctx.globalAlpha;
  ctx.fillStyle = '#c3c7cc';
  const n = 5;
  for (let i = 0; i < n; i++) {
    const p = still ? 0.2 + i * 0.25 : ((now / 2600 + i / n) % 1);
    const sway = still ? 0 : Math.sin((now / 700 + i * 1.7) * 1.3) * 1.5;
    const r = 2 + Math.round(p * 5);
    ctx.globalAlpha = alpha * (still ? 0.35 : 0.7 * (1 - p) * Math.min(1, p * 6));
    ctx.fillRect(Math.round(x + p * 10 + sway - r / 2), Math.round(y - 3 - p * 22 - r / 2), r, r);
  }
  ctx.globalAlpha = alpha;
}

let glowCache: HTMLCanvasElement | null = null;

/** Soft orange radial sprite (64 px), for the coals' glow. */
function coalGlow(): HTMLCanvasElement {
  if (glowCache) return glowCache;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,140,60,1)');
  grad.addColorStop(0.35, 'rgba(255,110,40,0.45)');
  grad.addColorStop(1, 'rgba(255,90,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache = c;
  return c;
}

/**
 * The coals' faint orange glow at night (additive; `night` 0–1), breathing a little as she fans them. `still` (reduced
 * motion): steady.
 */
export function drawCoalGlow(ctx: CanvasRenderingContext2D, x: number, y: number, night: number, now: number, still: boolean): void {
  if (night < 0.15) return;
  const flicker = still ? 1 : 0.85 + 0.15 * Math.sin(now / 230) * Math.sin(now / 610);
  const prev = ctx.globalCompositeOperation;
  const alpha = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const img = coalGlow();
  ctx.globalAlpha = 0.5 * night * flicker;
  ctx.drawImage(img, Math.round(x - 20), Math.round(y - 14), 40, 28);
  ctx.globalAlpha = 0.7 * night * flicker;
  ctx.drawImage(img, Math.round(x - 7), Math.round(y - 5), 14, 10);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = prev;
}
