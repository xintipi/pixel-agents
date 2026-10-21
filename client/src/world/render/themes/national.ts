// National Day theme decoration (Quốc khánh 2/9, and 30/4–1/5): red rugs with little yellow stars, strings of street
// flags and lanterns on the walls and elevators, a flagpole and pink lotus by the plants, fireworks in the windows.
import { THEME_DECOR } from './registry';

THEME_DECOR.set('national', {
  palette: { rug: '#b8352c', rugMotif: '#f2c94c', wallTint: '#ffe2b8', trim: '#c0392b', garland: '#c63a30', garlandThick: false, bulb: '#f2c94c', bulbShine: '#fff0b0', glow: '#ffc06b', light: '#ffd86b' },
  costumes: ['national:nonla', 'national:headband'],
  tall: ['national:flagpole', 'national:lotus', 'national:lotus'],
  small: 'national:small',
  elevator: 'national:flags',
  wall: { prop: 'national:flags', at: [0.3, 0.7], dy: 12 },
  rugMotif(ctx, cx, cy) {
    // Five-pointed star, 9×9.
    ctx.fillRect(cx, cy - 4, 1, 2);
    ctx.fillRect(cx - 1, cy - 2, 3, 1);
    ctx.fillRect(cx - 4, cy - 1, 9, 1);
    ctx.fillRect(cx - 3, cy, 7, 1);
    ctx.fillRect(cx - 2, cy + 1, 5, 1);
    ctx.fillRect(cx - 2, cy + 2, 2, 1);
    ctx.fillRect(cx + 1, cy + 2, 2, 1);
    ctx.fillRect(cx - 3, cy + 3, 2, 1);
    ctx.fillRect(cx + 2, cy + 3, 2, 1);
    ctx.fillRect(cx - 3, cy + 4, 1, 1);
    ctx.fillRect(cx + 3, cy + 4, 1, 1);
  },
  window(ctx, glass, now, seed) {
    // Fireworks for 2/9: two small bursts at a time (red, yellow, white sparks), plus a few drifting confetti.
    const w = Math.max(1, Math.floor(glass.w)), h = Math.max(1, Math.floor(glass.h));
    const colors = ['#ff6b5b', '#ffd34d', '#fff4dc'];
    for (let slot = 0; slot < 2; slot++) {
      const period = 4200;
      const tt = now + slot * 2100 + ((seed >>> 0) % 997);
      const cycle = Math.floor(tt / period), t = (tt % period) / 1000;
      if (t > 1.4) continue;
      const k = (Math.imul((seed >>> 0) ^ (cycle * 2654435761), 2246822519) ^ (slot * 374761393)) >>> 0;
      const cx = glass.x + 3 + (k % Math.max(1, w - 6));
      const cy = glass.y + 3 + ((k >>> 8) % Math.max(1, Math.floor(h * 0.55)));
      const r = 1 + t * 3.5;
      ctx.save();
      ctx.globalAlpha *= Math.max(0, 1 - t / 1.4) * 0.9;
      ctx.fillStyle = colors[(k >>> 16) % 3];
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + (k % 7) * 0.1;
        ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r + t * t), 1, 1);
      }
      ctx.fillStyle = colors[((k >>> 16) + 1) % 3];
      ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
      ctx.restore();
    }
    for (let i = 0; i < 4; i++) {
      const x = ((seed >>> 0) + i * 23 + Math.round(Math.sin(now / 900 + i) * 2)) % w;
      const y = (Math.floor(now / 340) + i * 13) % h;
      ctx.fillStyle = i % 2 === 0 ? '#e0483c' : '#f6cf4a';
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 1);
    }
  },
});
