// Night bánh tráng nướng stand (sim/banhtrang.ts): the sprite (low metal stand, round clay brazier with glowing coals,
// the grill grate with a rice paper on it, the toppings), the charcoal smoke drifting off it and the coals' glow at
// night. Same art direction as render/props.ts.
import { BANHTRANG_STAND } from '../../art/handdrawn/banhtrang-stand';
import { paintGrid } from '../../art/handdrawn/grid';

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
  // contact shadow
  ctx.fillStyle = 'rgba(28,36,52,0.28)';
  for (let y = -2; y <= 2; y++) {
    const half = Math.round(15 * Math.sqrt(Math.max(0, 1 - (y * y) / 4)));
    ctx.fillRect(16 - half, 24 + y, half * 2, 1);
  }
  // the stand itself is hand-drawn (scripts/assets/handdrawn/banhtrang-stand.png)
  paintGrid(ctx, BANHTRANG_STAND);
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
