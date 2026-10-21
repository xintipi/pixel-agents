// Disco (easter egg: type "disco" in the office): the rooms darken, a mirror ball spins on each one's ceiling and colored
// beams sweep the floor. Drawn over the normal lighting and under the icons. `level` (0–1) does the fade.
import { TILE } from '../../art/api';

export interface DiscoArea {
  /** Area rectangle in world px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLORS = ['255,70,160', '70,200,255', '255,220,60', '140,255,120', '190,110,255'];

export function drawDisco(ctx: CanvasRenderingContext2D, areas: Iterable<DiscoArea>, now: number, level: number, reducedMotion: boolean): void {
  if (level <= 0.01) return;
  const t = reducedMotion ? 0 : now / 1000;
  ctx.save();
  for (const a of areas) {
    // nightclub darkness
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5 * level;
    ctx.fillStyle = '#0b0618';
    ctx.fillRect(a.x, a.y, a.w, a.h);
    // colored beams roaming the floor
    ctx.globalCompositeOperation = 'lighter';
    const seed = (a.x * 7 + a.y * 13) % 97;
    for (let i = 0; i < 4; i++) {
      const ph = t * (0.6 + i * 0.17) + seed + i * 1.7;
      const cx = a.x + a.w * (0.5 + 0.38 * Math.sin(ph));
      const cy = a.y + a.h * (0.55 + 0.3 * Math.cos(ph * 1.3));
      const r = TILE * (2.2 + 0.6 * Math.sin(ph * 2));
      const col = COLORS[(i + Math.floor(t * 2) + seed) % COLORS.length];
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${col},${0.55 * level})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    // mirror ball on the ceiling, in the middle of the room
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = level;
    const bx = Math.round(a.x + a.w / 2);
    const by = Math.round(a.y + TILE * 1.4);
    ctx.fillStyle = '#5a5f72';
    ctx.fillRect(bx, Math.round(a.y + 2), 1, by - Math.round(a.y + 2) - 4);
    ctx.fillStyle = '#c9d0e0';
    ctx.beginPath();
    ctx.arc(bx + 0.5, by, 5, 0, Math.PI * 2);
    ctx.fill();
    // facets glinting as it spins
    for (let k = 0; k < 6; k++) {
      const ang = t * 2 + (k * Math.PI) / 3;
      const fx = Math.round(bx + Math.cos(ang) * 3);
      const fy = Math.round(by + Math.sin(ang * 0.7) * 3);
      ctx.fillStyle = k % 2 ? '#ffffff' : `rgb(${COLORS[(k + Math.floor(t * 3)) % COLORS.length]})`;
      ctx.fillRect(fx, fy, 1, 1);
    }
  }
  ctx.restore();
}
