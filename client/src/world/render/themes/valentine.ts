// Valentine theme decoration, with a Vietnamese touch: rose rugs with little hearts, pink garlands and strings of
// Hội An silk lanterns on the walls and elevators, the Hà Nội flower-seller bicycle and heart balloons in place of
// the big plants, kraft-paper rose bouquets in place of the small ones, and hoa giấy (bougainvillea) petals drifting
// past the windows with a few pink hearts floating up.
import { THEME_DECOR } from './registry';

const RUG_HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const WINDOW_HEART = ['#.#', '###', '.#.'];
const PETALS = ['#e0559a', '#f27ab5', '#c93f86', '#f59ac6'];

THEME_DECOR.set('valentine', {
  palette: {
    rug: '#b84a63',
    rugMotif: '#f5c4d0',
    wallTint: '#ffd3dd',
    trim: '#c24a66',
    garland: '#d9637f',
    garlandThick: false,
    bulb: '#ff9fb8',
    bulbShine: '#ffe6ec',
    glow: '#ffb0c3',
    light: '#ffd4de',
  },
  costumes: ['valentine:headband', 'valentine:nonla'],
  tall: ['valentine:flowerbike', 'valentine:balloons'],
  small: 'valentine:bouquet',
  elevator: 'valentine:lanterns',
  wall: { prop: 'valentine:lanterns', at: [0.3, 0.7], dy: 25 },
  rugMotif(ctx, cx, cy, color) {
    ctx.fillStyle = color;
    RUG_HEART.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') ctx.fillRect(cx - 3 + dx, cy - 3 + dy, 1, 1);
    });
  },
  window(ctx, glass, now, seed) {
    const w = Math.max(1, Math.floor(glass.w));
    const h = Math.max(1, Math.floor(glass.h));
    const base = ctx.globalAlpha;
    // hoa giấy petals drifting down and sideways, fluttering between a flat and a tall shape
    for (let i = 0; i < 9; i++) {
      const y = (Math.floor(now / (240 + (i % 3) * 70)) + i * 13 + (seed >>> 2)) % (h + 4) - 2;
      const x = (((seed >>> 0) + i * 17 + Math.floor(now / 700)) % (w + 4)) - 2 + Math.round(Math.sin(now / 600 + i) * 1.5);
      const flat = Math.floor(now / 300 + i) % 2 === 0;
      ctx.globalAlpha = base * 0.85;
      ctx.fillStyle = PETALS[i % PETALS.length];
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), flat ? 2 : 1, flat ? 1 : 2);
    }
    // a couple of small hearts floating up
    for (let i = 0; i < 2; i++) {
      const y = h + 2 - ((Math.floor(now / 280) + i * 23 + (seed >>> 3)) % (h + 6));
      const x = (((seed >>> 0) + i * 29 + 5) % Math.max(1, w - 3)) + Math.round(Math.sin(now / 900 + i * 1.7) * 1.5);
      ctx.globalAlpha = base * (0.4 + 0.4 * Math.min(1, y / h));
      ctx.fillStyle = i === 0 ? '#ff9fbd' : '#f26d8f';
      WINDOW_HEART.forEach((row, dy) => {
        for (let dx = 0; dx < 3; dx++) if (row[dx] === '#') ctx.fillRect(Math.floor(glass.x + x + dx), Math.floor(glass.y + y + dy), 1, 1);
      });
    }
    ctx.globalAlpha = base;
  },
});
