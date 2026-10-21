import type { CharacterFrameRequest, FurnitureKind, Sprite, WallStyle } from '../../art/api';
import { mix } from '../../art/core/color';
import { hash32 } from '../../../../shared/hash';
import { renderSeasonalProp, type SeasonalProp } from '../../art/seasonal';
import type { SeasonalTheme } from '../api';
import type { AreaLayout, WallSegment } from '../layout/types';

const sprites = new Map<SeasonalProp, Sprite>();
function prop(kind: SeasonalProp): Sprite {
  let sprite = sprites.get(kind);
  if (!sprite) {
    const { buf, ax, ay } = renderSeasonalProp(kind);
    const canvas = document.createElement('canvas');
    canvas.width = buf.w;
    canvas.height = buf.h;
    canvas.getContext('2d')!.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    sprites.set(kind, sprite = { canvas, ax, ay });
  }
  return sprite;
}

/** Colors of each decorated theme (garland, lights, rug, wall). */
interface ThemePalette {
  rug: string;
  rugMotif: string;
  wallTint: string;
  trim: string;
  garland: string;
  garlandThick: boolean;
  bulb: string;
  bulbShine: string;
  glow: string;
  light: string;
}

const PALETTES: Record<Exclude<SeasonalTheme, 'none'>, ThemePalette> = {
  christmas: { rug: '#a93649', rugMotif: '#ddb66e', wallTint: '#ffe3b4', trim: '#4e7756', garland: '#347653', garlandThick: true, bulb: '#f5d491', bulbShine: '#fff0be', glow: '#ffd58b', light: '#ffe4a9' },
  halloween: { rug: '#60416f', rugMotif: '#e5a457', wallTint: '#bc97d1', trim: '#725486', garland: '#584068', garlandThick: false, bulb: '#eea24d', bulbShine: '#ffd78a', glow: '#d8a5ed', light: '#ffd181' },
  tet: { rug: '#a8262f', rugMotif: '#e8bf55', wallTint: '#ffd6a0', trim: '#a8262f', garland: '#b8283a', garlandThick: false, bulb: '#e3b24c', bulbShine: '#fff0b0', glow: '#ffb070', light: '#ffd36b' },
};

export function seasonalCostume(theme: SeasonalTheme, seed: number): CharacterFrameRequest['costume'] {
  if (theme === 'christmas') return 'santa';
  if (theme === 'halloween') return (['witch', 'pumpkin', 'vampire'] as const)[(seed >>> 0) % 3];
  if (theme === 'tet') return (['khandong', 'nonla'] as const)[(seed >>> 0) % 2];
  return undefined;
}

/** Reuses plant footprints: no new collisions or path changes. */
export function seasonalFurniture(theme: SeasonalTheme, kind: FurnitureKind, area: AreaLayout, seed: number): Sprite | null {
  if (theme === 'none' || area.kind === 'restroom') return null;
  if (kind === 'plant_tall') {
    const first = area.furniture.find((f) => f.kind === 'plant_tall');
    if (!first || hash32(first.id) !== seed) return null;
    if (theme === 'tet') return prop(seed % 2 === 0 ? 'mai' : 'dao');
    return prop(theme === 'christmas' ? 'tree' : seed % 3 === 0 ? 'ghost' : 'pumpkin');
  }
  if (kind === 'plant_small') return prop(theme === 'christmas' ? 'gift' : theme === 'tet' ? 'kumquat' : 'pumpkin');
  return null;
}

export function seasonalRugColor(theme: SeasonalTheme, original: string): string {
  return theme === 'none' ? original : PALETTES[theme].rug;
}

export function seasonalWallStyle(theme: SeasonalTheme, original: WallStyle): WallStyle {
  if (theme === 'none' || original.pattern === 'glass') return original;
  const p = PALETTES[theme];
  return { ...original, base: mix(original.base, p.wallTint, 0.18), trim: p.trim };
}

/** Rug motifs (cached together with the floor). */
export function decorateSeasonalRug(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, rug: { x: number; y: number; w: number; h: number }): void {
  if (theme === 'none') return;
  const x = Math.round(rug.x), y = Math.round(rug.y), w = Math.floor(rug.w), h = Math.floor(rug.h);
  if (w < 25 || h < 16) return;
  ctx.save();
  const motif = PALETTES[theme].rugMotif;
  ctx.fillStyle = motif;
  ctx.fillRect(x + 4, y + 4, w - 8, 1);
  ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
  for (let cx = x + 14; cx < x + w - 10; cx += 28) {
    const cy = Math.round(y + h / 2);
    if (theme === 'christmas') {
      ctx.fillRect(cx - 4, cy, 9, 1);
      ctx.fillRect(cx, cy - 4, 1, 9);
      for (const d of [-2, 2]) {
        ctx.fillRect(cx + d, cy + d, 1, 1);
        ctx.fillRect(cx + d, cy - d, 1, 1);
      }
    } else if (theme === 'tet') {
      // Five-petal mai blossom.
      for (const [dx, dy] of [[0, -3], [-3, -1], [3, -1], [-2, 2], [2, 2]]) ctx.fillRect(cx + dx - 1, cy + dy - 1, 2, 2);
      ctx.fillStyle = PALETTES.tet.rug;
      ctx.fillRect(cx, cy, 1, 1);
      ctx.fillStyle = motif;
    } else {
      ctx.fillRect(cx - 3, cy - 2, 7, 5);
      ctx.fillRect(cx, cy - 4, 1, 2);
      ctx.fillStyle = '#60416f';
      ctx.fillRect(cx - 2, cy - 1, 1, 1);
      ctx.fillRect(cx + 2, cy - 1, 1, 1);
      ctx.fillStyle = '#e5a457';
    }
  }
  ctx.restore();
}

/** Decorations high on the wall, away from screens and signs. Openings stay clear. */
export function decorateSeasonalWall(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, wall: WallSegment): void {
  if (theme === 'none' || wall.kind !== 'face') return;
  ctx.save();
  const x0 = Math.round(wall.x + 3), end = Math.floor(wall.x + wall.w - 3), y = Math.round(wall.y + 5);
  for (let x = x0; x < end; x++) {
    if (wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1)) continue;
    const sag = Math.round(Math.sin(((x - x0) % 48) / 48 * Math.PI) * 3);
    const p = PALETTES[theme];
    ctx.fillStyle = p.garland;
    ctx.fillRect(x, y + sag, 1, p.garlandThick ? 3 : 1);
    if ((x - x0) % 12 === 6) {
      ctx.fillStyle = p.bulb;
      ctx.fillRect(x, y + sag + 3, 2, 3);
      ctx.fillStyle = p.bulbShine;
      ctx.fillRect(x, y + sag + 3, 1, 1);
    }
  }
  if (theme === 'halloween') {
    // Small webs in the corners; they don't cover the equipment.
    ctx.strokeStyle = '#d6bfdd';
    ctx.lineWidth = 1;
    for (const side of [1, -1]) {
      const x = side === 1 ? x0 : end;
      ctx.beginPath();
      for (const [dx, dy] of [[15, 0], [13, 7], [7, 13], [0, 15]]) {
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x + side * dx, y + 2 + dy);
      }
      for (const r of [5, 10, 15]) {
        ctx.moveTo(x + side * r, y + 2);
        ctx.lineTo(x + side * Math.round(r * 0.7), y + 2 + Math.round(r * 0.7));
        ctx.lineTo(x, y + 2 + r);
      }
      ctx.stroke();
    }
    if (wall.w > 90) {
      const bat = prop('bat');
      ctx.drawImage(bat.canvas, Math.round(wall.x + wall.w / 2 - bat.ax), y + 18 - bat.ay);
    }
  }
  if (theme === 'tet' && wall.w > 90) {
    const lantern = prop('lantern');
    for (const fx of [0.3, 0.7]) ctx.drawImage(lantern.canvas, Math.round(wall.x + wall.w * fx - lantern.ax), y + 26 - lantern.ay);
  }
  ctx.restore();
}

/** Garlands on the elevator frames (without covering the animated door). */
export function decorateElevator(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, x: number, y: number): void {
  if (theme === 'none') return;
  const sprite = prop(theme === 'christmas' ? 'wreath' : theme === 'tet' ? 'lantern' : 'bat');
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.ax), Math.round(y - 19 - sprite.ay));
}

const glows = new Map<SeasonalTheme, HTMLCanvasElement>();
function glowSprite(theme: SeasonalTheme): HTMLCanvasElement {
  let canvas = glows.get(theme);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 34;
    const ctx = canvas.getContext('2d')!;
    const glow = ctx.createRadialGradient(17, 17, 1, 17, 17, 17);
    glow.addColorStop(0, theme === 'none' ? '#ffd58b' : PALETTES[theme].glow);
    glow.addColorStop(1, 'rgba(255,220,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 34, 34);
    glows.set(theme, canvas);
  }
  return canvas;
}

/** Soft decorative light, limited to the wall face. Doesn't interfere with dark rooms. */
export function drawSeasonalLights(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, layout: AreaLayout, light: number): void {
  if (theme === 'none' || light <= 0.01) return;
  ctx.save();
  for (const wall of layout.walls) {
    if (wall.kind !== 'face') continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wall.x, wall.y + 4, wall.w, 27);
    ctx.clip();
    for (let x = wall.x + 14; x < wall.x + wall.w - 6; x += 24) {
      if (wall.doorways?.some((d) => x >= d.x - 10 && x <= d.x + d.w + 10)) continue;
      ctx.globalAlpha = light * 0.3;
      ctx.drawImage(glowSprite(theme), Math.round(x - 17), wall.y - 8);
      ctx.globalAlpha = light * 0.85;
      ctx.fillStyle = PALETTES[theme as Exclude<SeasonalTheme, 'none'>].light;
      ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawSeasonalWindow(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, glass: { x: number; y: number; w: number; h: number }, now: number, seed: number): void {
  if (theme === 'tet') return drawTetWindow(ctx, glass, now, seed);
  if (theme !== 'christmas') return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(glass.x, glass.y, glass.w, glass.h);
  ctx.clip();
  ctx.fillStyle = '#edf3f3';
  ctx.globalAlpha *= 0.7;
  ctx.fillRect(glass.x, glass.y + glass.h - 2, glass.w, 2);
  for (let i = 0; i < 12; i++) {
    const x = ((seed >>> 0) + i * 17) % Math.max(1, Math.floor(glass.w));
    const y = (Math.floor(now / 180) + i * 11) % Math.max(1, Math.floor(glass.h));
    ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 1);
  }
  ctx.restore();
}

/** Tết: mai and đào petals falling slowly, and now and then a firework in the window's sky. */
function drawTetWindow(ctx: CanvasRenderingContext2D, glass: { x: number; y: number; w: number; h: number }, now: number, seed: number): void {
  const w = Math.max(1, Math.floor(glass.w)), hgt = Math.max(1, Math.floor(glass.h));
  ctx.save();
  ctx.beginPath();
  ctx.rect(glass.x, glass.y, glass.w, glass.h);
  ctx.clip();
  for (let i = 0; i < 8; i++) {
    const x = ((seed >>> 0) + i * 23 + Math.floor(now / 900)) % w;
    const y = (Math.floor(now / 260) + i * 13) % hgt;
    ctx.fillStyle = i % 2 === 0 ? '#ffd65a' : '#ff9fbd';
    ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 1);
  }
  // One burst every ~6 s, at a spot drawn from the window and the cycle.
  const cycle = Math.floor(now / 6000), t = (now % 6000) / 1000;
  if (t < 1.2) {
    const k = hash32(`${seed}:${cycle}`);
    const cx = glass.x + 4 + (k % Math.max(1, w - 8)), cy = glass.y + 3 + ((k >>> 8) % Math.max(1, Math.floor(hgt / 2)));
    const r = 1 + t * 4;
    ctx.globalAlpha *= 1 - t / 1.2;
    ctx.fillStyle = (k >>> 16) % 2 === 0 ? '#ffd36b' : '#ff6b6b';
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 1, 1);
    }
  }
  ctx.restore();
}
