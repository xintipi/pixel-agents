// Women's Day theme decoration (Vietnamese Women's Day, 8/3 and 20/10): rose-pink rugs with lotus motifs, a green
// vine garland with pink blossoms, a flower seller's quang gánh and Bát Tràng lotus vases instead of the plants,
// Đông Hồ paintings on the walls, and pink lotus petals and white hoa sữa drifting past the windows.
import { THEME_DECOR } from './registry';

const PETALS = ['#f19bb8', '#fbf7ee', '#f7c4d4', '#fbf7ee'];

THEME_DECOR.set('women', {
  palette: {
    rug: '#c8708e',
    rugMotif: '#f8e2ea',
    wallTint: '#ffe1ea',
    trim: '#c46b8c',
    garland: '#6fa266',
    garlandThick: false,
    bulb: '#f19bb8',
    bulbShine: '#ffe6ef',
    glow: '#ffb9d2',
    light: '#ffdbe7',
  },
  costumes: ['women:nonla', 'women:khanvan'],
  tall: ['women:ganh', 'women:battrang'],
  small: 'women:hoami',
  elevator: 'women:dongho',
  wall: { prop: 'women:dongho', at: [0.3, 0.7], dy: 26 },
  rugMotif(ctx, cx, cy, color) {
    // A lotus (sen): a pointed middle petal, two pairs opening outwards and a little water line.
    ctx.fillStyle = color;
    ctx.fillRect(cx, cy - 4, 1, 1);
    ctx.fillRect(cx - 1, cy - 3, 3, 4);
    ctx.fillRect(cx - 4, cy - 2, 1, 2);
    ctx.fillRect(cx + 4, cy - 2, 1, 2);
    ctx.fillRect(cx - 3, cy - 1, 1, 2);
    ctx.fillRect(cx + 3, cy - 1, 1, 2);
    ctx.fillRect(cx - 3, cy + 1, 7, 1);
    ctx.fillRect(cx - 2, cy + 2, 5, 1);
    ctx.fillRect(cx - 5, cy + 4, 4, 1);
    ctx.fillRect(cx + 2, cy + 4, 4, 1);
  },
  window(ctx, glass, now, seed) {
    // Pink lotus petals and white hoa sữa specks drifting down and sideways, swaying a little.
    const w = Math.max(1, Math.floor(glass.w)), h = Math.max(1, Math.floor(glass.h));
    ctx.globalAlpha *= 0.85;
    for (let i = 0; i < 7; i++) {
      const t = now / (320 + i * 23);
      const y = (Math.floor(t) + i * 13 + (seed >>> 3)) % (h + 4) - 2;
      const sway = Math.round(Math.sin(now / 700 + i * 1.7) * 2);
      const x = ((seed >>> 0) + i * 19 + Math.floor(now / 1100)) % w + sway;
      ctx.fillStyle = PETALS[i % PETALS.length];
      const px = Math.floor(glass.x + x), py = Math.floor(glass.y + y);
      if (i % 2 === 1) {
        ctx.fillRect(px, py, 1, 1); // hoa sữa speck
      } else {
        ctx.fillRect(px, py, 2, 1); // lotus petal
        ctx.fillRect(px + 1, py + 1, 1, 1);
      }
    }
  },
});
