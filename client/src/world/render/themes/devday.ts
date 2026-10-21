// Programmer's Day theme decoration (the 256th day of the year): terminal green on dark slate with amber accents.
// Vietnamese dev style: server racks and stacks of red plastic stools with trà đá replace tall plants, cà phê phin
// the small ones, red shop-sign banners with "</>" hang on walls and elevators, rugs carry a "</>" glyph and green
// "matrix" code rains softly in the windows.
import { THEME_DECOR } from './registry';

THEME_DECOR.set('devday', {
  palette: {
    rug: '#34404c',
    rugMotif: '#6fc98d',
    wallTint: '#cfe8d6',
    trim: '#3b4654',
    garland: '#3b4654',
    garlandThick: false,
    bulb: '#7ad69a',
    bulbShine: '#e2ffe9',
    glow: '#9fe3b5',
    light: '#c9f2d4',
  },
  costumes: ['devday:helmet', 'devday:visor'],
  tall: ['devday:rack', 'devday:stools'],
  small: 'devday:phin',
  elevator: 'devday:sign',
  wall: { prop: 'devday:sign', at: [0.3, 0.7], dy: 24 },
  rugMotif(ctx, cx, cy, color) {
    ctx.fillStyle = color;
    // "<"
    ctx.fillRect(cx - 3, cy - 2, 1, 1);
    ctx.fillRect(cx - 4, cy - 1, 1, 1);
    ctx.fillRect(cx - 5, cy, 1, 1);
    ctx.fillRect(cx - 4, cy + 1, 1, 1);
    ctx.fillRect(cx - 3, cy + 2, 1, 1);
    // "/"
    for (let k = 0; k < 7; k++) ctx.fillRect(cx + 1 - Math.floor(k / 2.4), cy - 3 + k, 1, 1);
    // ">"
    ctx.fillRect(cx + 3, cy - 2, 1, 1);
    ctx.fillRect(cx + 4, cy - 1, 1, 1);
    ctx.fillRect(cx + 5, cy, 1, 1);
    ctx.fillRect(cx + 4, cy + 1, 1, 1);
    ctx.fillRect(cx + 3, cy + 2, 1, 1);
  },
  window(ctx, glass, now, seed) {
    // Soft green code columns falling, each with a bright head and a fading tail.
    const w = Math.max(1, Math.floor(glass.w));
    const h = Math.max(1, Math.floor(glass.h));
    const cols = Math.max(2, Math.floor(w / 4));
    const base = ctx.globalAlpha;
    for (let i = 0; i < cols; i++) {
      const k = ((seed >>> 0) * 31 + i * 97) >>> 0;
      const x = Math.floor(glass.x + ((i * 4 + (k % 3)) % w));
      const speed = 140 + (k % 5) * 40;
      const span = h + 8;
      const head = (Math.floor(now / speed) + (k % span)) % span;
      for (let t = 0; t < 5; t++) {
        const y = head - t * 2;
        if (y < 0 || y >= h) continue;
        ctx.globalAlpha = base * (t === 0 ? 0.85 : 0.65 - t * 0.1);
        ctx.fillStyle = t === 0 ? '#d6ffe0' : '#4fbf74';
        ctx.fillRect(x, Math.floor(glass.y + y), 1, 1);
      }
    }
    ctx.globalAlpha = base;
  },
});
