// Children's Day (Tết Thiếu nhi, June 1) decoration, after Vietnamese folk toys: sky-blue rugs with little kites,
// coral garland with sunny bulbs, a tò he stand or a kite on a pole by the walls, trống bỏi rattle drums for the small
// plants, paper pinwheels hanging on the walls and elevators, paper masks and party hats, and kites (diều) flying in
// the windows.
import { THEME_DECOR } from './registry';

const KITE_COLORS = ['#d9483f', '#f5cf5a', '#6cb4e4', '#79d1b0', '#ef8a7a'];

/** Pixel line (1 px steps), for kite strings. */
function pixLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
}

THEME_DECOR.set('children', {
  palette: {
    rug: '#5fa8d3',
    rugMotif: '#ffe08a',
    wallTint: '#d8eeff',
    trim: '#e8806e',
    garland: '#ef8a7a',
    garlandThick: false,
    bulb: '#f5cf5a',
    bulbShine: '#fff4c4',
    glow: '#ffd9a0',
    light: '#fff0b8',
  },
  costumes: ['children:mask', 'children:tigermask', 'children:conehat'],
  tall: ['children:tohe', 'children:kite'],
  small: 'children:trongboi',
  elevator: 'children:pinwheel',
  wall: { prop: 'children:pinwheel', at: [0.3, 0.7], dy: 22 },
  rugMotif(ctx, cx, cy) {
    // A little diamond kite with its spar gap and a wavy tail.
    ctx.fillRect(cx - 1, cy - 4, 1, 1);
    ctx.fillRect(cx - 2, cy - 3, 3, 1);
    ctx.fillRect(cx - 3, cy - 2, 5, 1);
    ctx.fillRect(cx - 2, cy - 1, 3, 1);
    ctx.fillRect(cx - 1, cy, 1, 1);
    for (const [dx, dy] of [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]]) ctx.fillRect(cx + dx, cy + dy, 1, 1);
  },
  window(ctx, glass, now, seed) {
    // Diều flying outside: small diamond kites bobbing and swaying on long strings that run down out of the glass,
    // their tails fluttering.
    const w = Math.max(1, Math.floor(glass.w));
    const h = Math.max(1, Math.floor(glass.h));
    const a0 = ctx.globalAlpha;
    const n = w >= 18 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const k = ((seed >>> 0) + i * 2654435761) >>> 0;
      const t = now / 1000 + (k % 100);
      const bx = glass.x + Math.round(w * (n === 1 ? 0.5 : i === 0 ? 0.3 : 0.72)) + Math.round(Math.sin(t * 0.7) * 1.5);
      const by = glass.y + 3 + ((k >>> 8) % Math.max(1, Math.floor(h / 3))) + Math.round(Math.sin(t * 1.3 + i) * 1);
      // string to the ground below the window
      ctx.globalAlpha = a0 * 0.55;
      ctx.fillStyle = '#ffffff';
      pixLine(ctx, bx, by + 2, bx - 6 - i * 3, glass.y + h + 2);
      // tail
      ctx.globalAlpha = a0 * 0.9;
      const c = KITE_COLORS[(k >>> 4) % KITE_COLORS.length];
      const c2 = KITE_COLORS[((k >>> 4) + 1) % KITE_COLORS.length];
      ctx.fillStyle = c2;
      for (let j = 1; j <= 4; j++) ctx.fillRect(bx + Math.round(Math.sin(t * 4 + j) * 0.8) + (j >> 1), by + 1 + j, 1, 1);
      // diamond
      ctx.fillStyle = c;
      ctx.fillRect(bx, by - 2, 1, 1);
      ctx.fillRect(bx - 1, by - 1, 3, 1);
      ctx.fillRect(bx - 2, by, 5, 1);
      ctx.fillRect(bx - 1, by + 1, 3, 1);
      ctx.fillStyle = c2;
      ctx.fillRect(bx, by, 1, 1);
    }
    ctx.globalAlpha = a0;
  },
});
