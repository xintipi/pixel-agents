// Weather outside: one per day (drawn from the date, the same for everyone that day), only outside the building.
// Sun: a flock of birds crosses the sky now and then (by day). Rain: slanted drops falling, splashes on the
// ground, the outside a bit darker and drops running down the window glass. Wind: leaves flying. Snow (only
// in winter, December to February): flakes of different sizes drifting down slowly and swaying, the ground covered by
// a white veil and snow piled on the window sills.
import { hash32 } from '../../../../shared/hash';

export type Weather = 'clear' | 'rain' | 'wind' | 'snow';

/** The day's weather (local date): ~55% sun, ~25% rain, ~20% wind; in winter (Dec–Feb), it snows ~30% of days. */
export function weatherFor(date: Date): Weather {
  const h = hash32(`clima:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`) % 100;
  const month = date.getMonth();
  if ((month === 11 || month <= 1) && h % 10 < 3) return 'snow';
  return h < 55 ? 'clear' : h < 80 ? 'rain' : 'wind';
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clips everything except the building (weather is only outside). */
function clipOutside(ctx: CanvasRenderingContext2D, view: Rect, building: Rect): void {
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.rect(building.x + building.w, building.y, -building.w, building.h);
  ctx.clip('evenodd');
}

const rand = (i: number, k: number) => (hash32(`${i}:${k}`) % 10000) / 10000;

/**
 * Draws the weather outside (over the scenery and characters, under the night light).
 * `still`: reduced motion (drops and leaves stay still).
 */
export function drawWeather(ctx: CanvasRenderingContext2D, kind: Weather, view: Rect, building: Rect, now: number, hour: number, still: boolean): void {
  const t = still ? 0 : now / 1000;
  ctx.save();
  clipOutside(ctx, view, building);
  if (kind === 'rain') {
    // overcast sky
    ctx.fillStyle = 'rgba(40,52,74,0.22)';
    ctx.fillRect(view.x, view.y, view.w, view.h);
    // drops: a grid that falls slanted and repeats (stateless, no allocation per frame)
    const cell = 22;
    const x0 = Math.floor(view.x / cell) - 1;
    const y0 = Math.floor(view.y / cell) - 1;
    const x1 = Math.ceil((view.x + view.w) / cell) + 1;
    const y1 = Math.ceil((view.y + view.h) / cell) + 1;
    ctx.strokeStyle = 'rgba(190,210,235,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const r = rand(gx, gy);
        const fall = (t * 260 + r * cell * 9) % (cell * 3);
        const x = gx * cell + r * cell - fall * 0.25;
        const y = gy * cell + fall - cell;
        ctx.moveTo(Math.round(x), Math.round(y));
        ctx.lineTo(Math.round(x - 2), Math.round(y + 6));
      }
    }
    ctx.stroke();
    // splashes on the ground
    ctx.fillStyle = 'rgba(210,225,245,0.6)';
    for (let gy = y0; gy <= y1; gy += 2) {
      for (let gx = x0; gx <= x1; gx += 2) {
        const r = rand(gy, gx);
        const ph = (t * 1.7 + r * 5) % 1;
        if (ph > 0.25) continue;
        const x = Math.round(gx * cell + r * cell);
        const y = Math.round(gy * cell + rand(gx + 7, gy) * cell);
        const s = Math.round(1 + ph * 8);
        ctx.fillRect(x - s, y, 1, 1);
        ctx.fillRect(x + s, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1);
      }
    }
  } else if (kind === 'snow') {
    // covered ground and white sky
    ctx.fillStyle = 'rgba(236,242,250,0.28)';
    ctx.fillRect(view.x, view.y, view.w, view.h);
    // flakes in a grid drifting down slowly, each swaying at its own rhythm
    const cell = 18;
    const x0 = Math.floor(view.x / cell) - 1;
    const y0 = Math.floor(view.y / cell) - 1;
    const x1 = Math.ceil((view.x + view.w) / cell) + 1;
    const y1 = Math.ceil((view.y + view.h) / cell) + 1;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const r = rand(gx, gy + 31);
        const fall = (t * (14 + r * 14) + r * cell * 7) % (cell * 4);
        const x = Math.round(gx * cell + r * cell + Math.sin(t * (0.8 + r) + gx) * 3);
        const y = Math.round(gy * cell + fall - cell * 2);
        const big = r > 0.72;
        ctx.fillStyle = big ? '#ffffff' : 'rgba(255,255,255,0.85)';
        if (big) {
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
        } else ctx.fillRect(x, y, r > 0.4 ? 2 : 1, r > 0.4 ? 2 : 1);
      }
    }
  } else if (kind === 'wind') {
    // leaves flying from left to right, spinning
    const colors = ['#d98b3a', '#b9c24a', '#c9622f', '#8fb24a'];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const r = rand(i, 3);
      const span = view.w + 80;
      const x = view.x - 40 + ((r * span + t * (60 + r * 50)) % span);
      const y = view.y + rand(i, 9) * view.h + Math.sin(t * 2 + i) * 6;
      ctx.fillStyle = colors[i % colors.length];
      const flip = Math.sin(t * 6 + i) > 0;
      ctx.fillRect(Math.round(x), Math.round(y), flip ? 3 : 2, flip ? 2 : 3);
    }
  } else if (hour >= 6.5 && hour < 18.5 && !still) {
    // birds: a V-shaped flock crosses every ~40 s
    const period = 40;
    const k = Math.floor(t / period);
    const p = (t % period) / 14;
    if (p < 1) {
      const span = view.w + 160;
      const gx = view.x - 80 + p * span;
      const gy = view.y + view.h * (0.12 + rand(k, 1) * 0.3) - p * 30;
      ctx.fillStyle = '#2e3446';
      for (let b = 0; b < 5; b++) {
        const side = b === 0 ? 0 : b % 2 ? 1 : -1;
        const rank = Math.ceil(b / 2);
        const x = Math.round(gx - rank * 9);
        const y = Math.round(gy + side * rank * 6);
        const flap = Math.sin(t * 12 + b) > 0;
        ctx.fillRect(x - 2, y + (flap ? -1 : 0), 2, 1);
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(x + 1, y + (flap ? -1 : 0), 2, 1);
      }
    }
  }
  ctx.restore();
}

/** Rain on a window's glass: drops running down and a gray veil. */
export function drawWeatherWindow(ctx: CanvasRenderingContext2D, kind: Weather, glass: Rect, now: number, seed: number, still: boolean): void {
  const t = still ? 0 : now / 1000;
  if (kind === 'snow') {
    // flakes passing behind the glass and snow piled on the sill
    ctx.save();
    ctx.beginPath();
    ctx.rect(glass.x, glass.y, glass.w, glass.h);
    ctx.clip();
    ctx.fillStyle = 'rgba(240,246,252,0.22)';
    ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
    ctx.fillStyle = '#ffffff';
    const w = Math.max(1, Math.floor(glass.w));
    const h = Math.max(1, Math.floor(glass.h));
    for (let i = 0; i < 6; i++) {
      const x = ((seed >>> 0) + i * 11 + Math.round(Math.sin(t + i) * 2)) % w;
      const y = (t * (5 + (i % 3) * 3) + i * 7) % h;
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 1);
    }
    ctx.fillStyle = '#f4f8fc';
    ctx.fillRect(glass.x, glass.y + glass.h - 2, glass.w, 2);
    ctx.fillStyle = '#dfe7f1';
    ctx.fillRect(glass.x, glass.y + glass.h - 1, glass.w, 1);
    ctx.restore();
    return;
  }
  if (kind !== 'rain') return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(glass.x, glass.y, glass.w, glass.h);
  ctx.clip();
  ctx.fillStyle = 'rgba(70,86,110,0.28)';
  ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
  ctx.fillStyle = 'rgba(220,235,250,0.75)';
  const w = Math.max(1, Math.floor(glass.w));
  const h = Math.max(1, Math.floor(glass.h));
  for (let i = 0; i < 7; i++) {
    const x = ((seed >>> 0) + i * 13) % w;
    const y = (t * (14 + (i % 3) * 6) + i * 9) % (h + 4);
    ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 2);
  }
  ctx.restore();
}
