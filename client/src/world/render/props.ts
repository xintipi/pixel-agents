// Procedural sprites for the outdoor area (trees, bushes, lamp posts, cars...) and visual
// utilities of the world (shadow, glows). Same art direction as the art module: dark
// bluish-gray outline, 3–4 tones per material, light coming from top/left.
import { mulberry32 } from '../../../../shared/hash';
import type { ExteriorProp } from '../layout/types';

export interface PropSprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const cache = new Map<string, PropSprite>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Per-pixel painter (ImageData) for organic shapes. */
class Painter {
  readonly data: ImageData;
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly w: number,
    readonly h: number,
  ) {
    // starts from the already drawn content (e.g. shadow) so putImageData doesn't erase it
    this.data = ctx.getImageData(0, 0, w, h);
  }
  set(x: number, y: number, color: string, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hex(color);
    const i = (y * this.w + x) * 4;
    this.data.data[i] = r;
    this.data.data[i + 1] = g;
    this.data.data[i + 2] = b;
    this.data.data[i + 3] = a;
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data.data[(y * this.w + x) * 4 + 3];
  }
  flush(): void {
    this.ctx.putImageData(this.data, 0, 0);
  }
}

function shadowEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a = 0.22): void {
  ctx.fillStyle = `rgba(28,36,52,${a})`;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    ctx.fillRect(cx - half, cy + y, half * 2, 1);
  }
}

/** Rounded canopy: union of circles with top-left light shading. */
function canopy(p: Painter, rng: () => number, cx: number, cy: number, r: number, tones: string[], outline: string): void {
  const blobs: [number, number, number][] = [[cx, cy, r]];
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (0.35 + rng() * 0.35);
    blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (0.55 + rng() * 0.25)]);
  }
  const inside = (x: number, y: number) => blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br);
  const x0 = Math.floor(cx - r * 1.8);
  const x1 = Math.ceil(cx + r * 1.8);
  const y0 = Math.floor(cy - r * 1.6);
  const y1 = Math.ceil(cy + r * 1.6);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
      if (edge) {
        p.set(x, y, outline);
        continue;
      }
      // light: top-left brighter; noise for "leaves"
      const nx = (x - cx) / r;
      const ny = (y - cy) / r;
      const light = -nx * 0.45 - ny * 0.75 + (rng() - 0.5) * 0.55;
      const k = light > 0.55 ? 3 : light > 0.05 ? 2 : light > -0.5 ? 1 : 0;
      p.set(x, y, tones[k]);
    }
  }
}

function treeSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(36, 48);
  shadowEllipse(ctx, 18, 45, 12, 3, 0.25);
  const p = new Painter(ctx, 36, 48);
  // trunk
  for (let y = 30; y < 46; y++) {
    for (let x = 16; x < 21; x++) {
      const col = x === 16 ? '#8a6243' : x === 20 ? '#4a3222' : '#6b4a32';
      p.set(x, y, col);
    }
  }
  p.set(15, 45, '#4a3222');
  p.set(21, 45, '#4a3222');
  const variants = [
    ['#2f6a43', '#3f8550', '#5aa45d', '#86c873'],
    ['#356b3c', '#4b8a45', '#6aa956', '#9fcf74'],
    ['#2c6250', '#3a7e5f', '#53a071', '#82c489'],
  ];
  canopy(p, rng, 18, 18, 11 + Math.floor(rng() * 3), variants[Math.floor(rng() * variants.length)], '#25463a');
  p.flush();
  return { canvas: c, ax: 18, ay: 45 };
}

function pineSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(28, 48);
  shadowEllipse(ctx, 14, 45, 9, 3, 0.25);
  const p = new Painter(ctx, 28, 48);
  for (let y = 38; y < 46; y++) for (let x = 12; x < 16; x++) p.set(x, y, x === 12 ? '#8a6243' : x === 15 ? '#4a3222' : '#6b4a32');
  const tones = ['#24533f', '#2f6b4f', '#3f8a5f', '#62ab79'];
  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const top = 4 + l * 8;
    const bottom = top + 14;
    for (let y = top; y < bottom; y++) {
      const half = Math.round(((y - top) / (bottom - top)) * (5 + l * 2.2));
      for (let x = 14 - half; x <= 14 + half; x++) {
        const edge = x === 14 - half || x === 14 + half || y === bottom - 1;
        const light = (14 - x) / (half + 1) - (y - top) / (bottom - top) + (rng() - 0.5) * 0.5;
        p.set(x, y, edge ? '#1d3f33' : tones[light > 0.5 ? 3 : light > -0.1 ? 2 : light > -0.6 ? 1 : 0]);
      }
    }
  }
  p.flush();
  return { canvas: c, ax: 14, ay: 45 };
}

function bushSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(22, 16);
  shadowEllipse(ctx, 11, 14, 9, 2, 0.22);
  const p = new Painter(ctx, 22, 16);
  canopy(p, rng, 11, 9, 6, ['#34663f', '#47864c', '#62a45a', '#8cc66f'], '#264a36');
  // little flowers
  if (rng() < 0.6) {
    const col = ['#f2d14b', '#f28aa5', '#ffffff'][Math.floor(rng() * 3)];
    for (let i = 0; i < 4; i++) p.set(6 + Math.floor(rng() * 10), 5 + Math.floor(rng() * 6), col);
  }
  p.flush();
  return { canvas: c, ax: 11, ay: 14 };
}

function flowersSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(30, 14);
  const p = new Painter(ctx, 30, 14);
  // flower bed: stone border + soil
  for (let y = 4; y < 13; y++) {
    for (let x = 1; x < 29; x++) {
      const border = y === 4 || y === 12 || x === 1 || x === 28;
      p.set(x, y, border ? (y === 12 ? '#8d8a82' : '#b9b5aa') : '#6a4b35');
    }
  }
  const cols = ['#e8574a', '#f2c94c', '#f08bb0', '#ffffff', '#9b7be0'];
  for (let i = 0; i < 26; i++) {
    const x = 3 + Math.floor(rng() * 24);
    const y = 2 + Math.floor(rng() * 9);
    p.set(x, y + 1, '#3f8550');
    p.set(x, y, rng() < 0.75 ? cols[Math.floor(rng() * cols.length)] : '#5aa45d');
  }
  p.flush();
  return { canvas: c, ax: 15, ay: 13 };
}

function hedgeSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(34, 16);
  shadowEllipse(ctx, 17, 14, 15, 2, 0.2);
  const p = new Painter(ctx, 34, 16);
  for (let y = 3; y < 14; y++) {
    for (let x = 1; x < 33; x++) {
      const r = y === 3 ? 2 : y === 4 ? 1 : 0;
      if (x < 1 + r || x > 32 - r) continue;
      const edge = y === 3 || y === 13 || x === 1 + r || x === 32 - r;
      const light = -(y - 3) / 10 + (rng() - 0.5) * 0.6;
      p.set(x, y, edge ? '#264a36' : light > 0 ? '#6aa956' : light > -0.4 ? '#4b8a45' : '#356b3c');
    }
  }
  p.flush();
  return { canvas: c, ax: 17, ay: 14 };
}

function lampSprite(): PropSprite {
  const [c, ctx] = makeCanvas(10, 36);
  shadowEllipse(ctx, 5, 34, 4, 1, 0.25);
  ctx.fillStyle = '#2e3648';
  ctx.fillRect(4, 6, 2, 28);
  ctx.fillStyle = '#4a5468';
  ctx.fillRect(4, 6, 1, 28);
  ctx.fillStyle = '#2e3648';
  ctx.fillRect(1, 2, 8, 5);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(2, 4, 6, 2);
  ctx.fillStyle = '#fff6d6';
  ctx.fillRect(3, 4, 2, 1);
  ctx.fillStyle = '#3a4152';
  ctx.fillRect(3, 32, 4, 2);
  return { canvas: c, ax: 5, ay: 34 };
}

function benchSprite(): PropSprite {
  const [c, ctx] = makeCanvas(26, 14);
  shadowEllipse(ctx, 13, 12, 11, 2, 0.22);
  ctx.fillStyle = '#2e3648';
  ctx.fillRect(3, 8, 2, 4);
  ctx.fillRect(21, 8, 2, 4);
  // slatted backrest and seat
  ctx.fillStyle = '#7a5232';
  ctx.fillRect(1, 1, 24, 3);
  ctx.fillRect(1, 6, 24, 3);
  ctx.fillStyle = '#a0703f';
  ctx.fillRect(1, 1, 24, 1);
  ctx.fillRect(1, 6, 24, 1);
  ctx.fillStyle = '#5b3c25';
  ctx.fillRect(1, 8, 24, 1);
  ctx.fillRect(1, 3, 24, 1);
  return { canvas: c, ax: 13, ay: 12 };
}

function rockSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(16, 12);
  const p = new Painter(ctx, 16, 12);
  canopy(p, rng, 8, 7, 4, ['#7d8590', '#959da8', '#b3bac4', '#d3d8de'], '#4d5562');
  p.flush();
  return { canvas: c, ax: 8, ay: 11 };
}

/** Garden table with a striped umbrella (top view, 3/4) and two little chairs. */
function parasolSprite(seed: number): PropSprite {
  const [c, ctx] = makeCanvas(32, 34);
  const palettes: [string, string, string][] = [
    ['#e8574a', '#f6efe2', '#a83a33'],
    ['#2fb3a3', '#f6efe2', '#1f8579'],
    ['#f2b33d', '#fbf4e4', '#c88a1f'],
  ];
  const [a, b, dk] = palettes[seed % palettes.length];
  // umbrella shadow on the ground
  shadowEllipse(ctx, 16, 29, 12, 3, 0.24);
  // little chairs (sides) and table
  ctx.fillStyle = '#5b3c25';
  ctx.fillRect(2, 24, 6, 5);
  ctx.fillRect(24, 24, 6, 5);
  ctx.fillStyle = '#a0703f';
  ctx.fillRect(2, 24, 6, 2);
  ctx.fillRect(24, 24, 6, 2);
  ctx.fillStyle = '#d8dde3';
  ctx.fillRect(10, 24, 12, 5);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(10, 24, 12, 2);
  ctx.fillStyle = '#8d96a3';
  ctx.fillRect(10, 28, 12, 1);
  // pole
  ctx.fillStyle = '#4a5468';
  ctx.fillRect(15, 11, 2, 14);
  // canopy: flattened octagon with alternating segments and dark edge
  const p = new Painter(ctx, 32, 34);
  const cx = 15.5;
  const cy = 8;
  for (let y = 0; y <= 15; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = (x - cx) / 14.5;
      const dy = (y - cy) / 7.5;
      const d = Math.abs(dx) + Math.abs(dy) * 0.55 + Math.hypot(dx, dy) * 0.45;
      if (d > 1) continue;
      const ang = Math.atan2(y - cy, x - cx);
      const gomo = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2;
      const edge = d > 0.86;
      const lit = y < cy - 1;
      p.set(x, y, edge ? dk : gomo ? (lit ? '#ffffff' : b) : lit ? a : dk);
    }
  }
  p.set(15, 8, '#2e3648');
  p.set(16, 8, '#2e3648');
  p.flush();
  return { canvas: c, ax: 16, ay: 29 };
}

/** Entrance totem with the brand (navy blue and orange, like the reception sign). */
function totemSprite(): PropSprite {
  const [c, ctx] = makeCanvas(14, 34);
  shadowEllipse(ctx, 7, 32, 6, 1.5, 0.25);
  ctx.fillStyle = '#141b30';
  ctx.fillRect(2, 2, 10, 30);
  ctx.fillStyle = '#1c2541';
  ctx.fillRect(3, 3, 8, 28);
  ctx.fillStyle = '#2a355a';
  ctx.fillRect(3, 3, 1, 28);
  // orange band at the top, light "H" and orange "b" (the colors of "Hab" and "blaud" on the sign)
  ctx.fillStyle = '#f2a33a';
  ctx.fillRect(3, 5, 8, 2);
  ctx.fillStyle = '#f5f1e6';
  ctx.fillRect(4, 11, 1, 6);
  ctx.fillRect(8, 11, 1, 6);
  ctx.fillRect(5, 13, 3, 1);
  ctx.fillStyle = '#f2a33a';
  ctx.fillRect(5, 19, 1, 6);
  ctx.fillRect(6, 21, 2, 1);
  ctx.fillRect(8, 22, 1, 2);
  ctx.fillRect(6, 24, 2, 1);
  // base
  ctx.fillStyle = '#8d96a3';
  ctx.fillRect(1, 31, 12, 2);
  return { canvas: c, ax: 7, ay: 32 };
}

/** Plastic stool colors (base, dark, light): the classic red and blue of the sidewalk. */
const STOOL_COLORS: [string, string, string][] = [
  ['#d8383e', '#9e2328', '#f06a6a'],
  ['#2f7fd8', '#1f5aa6', '#6aa8f0'],
];

/** Low plastic stool (3/4 view): round seat with the hole in the middle and four splayed legs. */
function drawStool(ctx: CanvasRenderingContext2D, x: number, y: number, color: number): void {
  const [base, dk, lt] = STOOL_COLORS[color % STOOL_COLORS.length];
  ctx.fillStyle = dk;
  ctx.fillRect(x + 1, y + 3, 1, 5);
  ctx.fillRect(x + 8, y + 3, 1, 5);
  ctx.fillRect(x + 3, y + 3, 1, 4);
  ctx.fillRect(x + 6, y + 3, 1, 4);
  ctx.fillStyle = base;
  ctx.fillRect(x, y + 1, 10, 2);
  ctx.fillRect(x + 1, y, 8, 1);
  ctx.fillRect(x + 1, y + 4, 8, 1);
  ctx.fillStyle = lt;
  ctx.fillRect(x + 2, y, 6, 1);
  ctx.fillStyle = dk;
  ctx.fillRect(x, y + 3, 10, 1);
  ctx.fillRect(x + 4, y + 1, 2, 1);
}

function teaStoolSprite(color: number): PropSprite {
  const [c, ctx] = makeCanvas(12, 10);
  shadowEllipse(ctx, 6, 8, 5, 1, 0.22);
  drawStool(ctx, 1, 1, color);
  return { canvas: c, ax: 6, ay: 9 };
}

/** Glass of iced tea: amber tea, ice on top, the glass catching the light. */
function drawTeaGlass(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#9fc4d6';
  ctx.fillRect(x, y, 3, 4);
  ctx.fillStyle = '#c98a3a';
  ctx.fillRect(x, y + 1, 3, 3);
  ctx.fillStyle = '#f4fbff';
  ctx.fillRect(x, y + 1, 1, 1);
  ctx.fillRect(x + 2, y, 1, 1);
}

/** Low wooden table with the big tea jug (yellow, red lid, little tap), glasses and a plate of peanut candy. */
function teaTableSprite(): PropSprite {
  const [c, ctx] = makeCanvas(34, 22);
  shadowEllipse(ctx, 17, 20, 15, 2, 0.24);
  // legs
  ctx.fillStyle = '#5b3c25';
  ctx.fillRect(3, 15, 2, 5);
  ctx.fillRect(29, 15, 2, 5);
  ctx.fillRect(10, 15, 1, 4);
  ctx.fillRect(23, 15, 1, 4);
  // top
  ctx.fillStyle = '#a0703f';
  ctx.fillRect(1, 11, 32, 4);
  ctx.fillStyle = '#c08a52';
  ctx.fillRect(2, 11, 30, 1);
  ctx.fillStyle = '#7a5232';
  ctx.fillRect(1, 14, 32, 1);
  // jug: yellow insulated body, red lid and handle, white tap
  ctx.fillStyle = '#2e3648';
  ctx.fillRect(2, 2, 10, 10);
  ctx.fillStyle = '#f2b33d';
  ctx.fillRect(3, 4, 8, 8);
  ctx.fillStyle = '#ffd36b';
  ctx.fillRect(4, 5, 2, 5);
  ctx.fillStyle = '#c88a1f';
  ctx.fillRect(9, 4, 2, 8);
  ctx.fillStyle = '#d8383e';
  ctx.fillRect(3, 2, 8, 2);
  ctx.fillRect(5, 1, 4, 1);
  ctx.fillStyle = '#f06a6a';
  ctx.fillRect(4, 2, 3, 1);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(11, 9, 2, 1);
  ctx.fillRect(12, 10, 1, 1);
  // glasses and the candy plate
  drawTeaGlass(ctx, 15, 8);
  drawTeaGlass(ctx, 19, 7);
  drawTeaGlass(ctx, 23, 8);
  ctx.fillStyle = '#e9edf1';
  ctx.fillRect(27, 10, 5, 1);
  ctx.fillStyle = '#b07a3e';
  ctx.fillRect(28, 9, 3, 1);
  ctx.fillStyle = '#e8c27a';
  ctx.fillRect(29, 9, 1, 1);
  return { canvas: c, ax: 17, ay: 20 };
}

/** Ice cooler (blue box, white lid) with a cardboard sign showing a glass of iced tea. */
function teaCoolerSprite(): PropSprite {
  const [c, ctx] = makeCanvas(18, 22);
  shadowEllipse(ctx, 9, 20, 8, 1.5, 0.24);
  ctx.fillStyle = '#2e3648';
  ctx.fillRect(1, 10, 16, 10);
  ctx.fillStyle = '#3f8fd8';
  ctx.fillRect(2, 12, 14, 7);
  ctx.fillStyle = '#2c6fb3';
  ctx.fillRect(2, 17, 14, 2);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(2, 11, 14, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 11, 6, 1);
  // cardboard sign standing on the lid
  ctx.fillStyle = '#7a5232';
  ctx.fillRect(4, 1, 10, 10);
  ctx.fillStyle = '#d9b07a';
  ctx.fillRect(5, 2, 8, 8);
  ctx.fillStyle = '#9fc4d6';
  ctx.fillRect(7, 3, 4, 6);
  ctx.fillStyle = '#c98a3a';
  ctx.fillRect(7, 5, 4, 4);
  ctx.fillStyle = '#f4fbff';
  ctx.fillRect(7, 4, 2, 1);
  ctx.fillRect(10, 5, 1, 1);
  return { canvas: c, ax: 9, ay: 20 };
}

/** Closed: the stools stacked (red and blue) with the folded table leaning beside them. */
function teaStackSprite(): PropSprite {
  const [c, ctx] = makeCanvas(26, 30);
  shadowEllipse(ctx, 12, 28, 11, 2, 0.24);
  // folded table, standing on its side
  ctx.fillStyle = '#5b3c25';
  ctx.fillRect(15, 8, 9, 20);
  ctx.fillStyle = '#a0703f';
  ctx.fillRect(16, 9, 7, 18);
  ctx.fillStyle = '#c08a52';
  ctx.fillRect(16, 9, 1, 18);
  for (let i = 0; i < 6; i++) drawStool(ctx, 2, 19 - i * 3, i % 2);
  return { canvas: c, ax: 12, ay: 28 };
}

/** 3×5 (N: 4×5, M: 5×5) letters for the cart's sign. */
const SIGN_FONT: Record<string, readonly string[]> = {
  B: ['11.', '1.1', '11.', '1.1', '11.'],
  A: ['.1.', '1.1', '111', '1.1', '1.1'],
  N: ['1..1', '11.1', '1.11', '1..1', '1..1'],
  H: ['1.1', '1.1', '111', '1.1', '1.1'],
  M: ['1...1', '11.11', '1.1.1', '1...1', '1...1'],
  I: ['111', '.1.', '.1.', '.1.', '111'],
  ' ': ['.', '.', '.', '.', '.'],
};

/** Pixel text (top-left x, y). */
function signText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  for (const chr of text) {
    const g = SIGN_FONT[chr] ?? SIGN_FONT[' '];
    for (let r = 0; r < g.length; r++) for (let i = 0; i < g[r].length; i++) if (g[r][i] === '1') ctx.fillRect(x + i, y + r, 1, 1);
    x += g[0].length + 1;
  }
}

/** Baguette in the glass case: golden loaf with diagonal cuts. */
function drawLoaf(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#c47f34';
  ctx.fillRect(x, y + 1, 7, 2);
  ctx.fillStyle = '#eab15a';
  ctx.fillRect(x + 1, y, 5, 1);
  ctx.fillRect(x, y + 1, 7, 1);
  ctx.fillStyle = '#9a5f24';
  ctx.fillRect(x + 2, y + 1, 1, 1);
  ctx.fillRect(x + 4, y + 1, 1, 1);
}

/**
 * Bánh mì cart: blue tin cabinet with the red "BÁNH MÌ" sign, glass case with the baguettes and a pot of xôi, striped
 * awning on two posts, two wheels and the push handle on the west end.
 */
/** A tire seen from the side: black rubber ring, a lighter tread line, hollow middle. */
function tire(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d > r + 0.3 || d < r - 2.6) continue;
      ctx.fillStyle = d > r - 0.7 ? '#14171e' : d > r - 1.7 ? '#2a2e38' : '#3d4350';
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
}

/** The repair stall's things: tire rack, the tire sign, the compressor, the stool, the water basin. */
function repairSprite(kind: 'repair_rack' | 'repair_sign' | 'repair_compressor' | 'repair_stool' | 'repair_basin'): PropSprite {
  const o = '#2e3648';
  const px = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  if (kind === 'repair_rack') {
    // a rough wooden frame with old tires hanging from the top bar and inner tubes draped over it
    const [c, ctx] = makeCanvas(30, 30);
    shadowEllipse(ctx, 15, 28, 13, 2, 0.22);
    px(ctx, '#6b4a32', 2, 3, 2, 26);
    px(ctx, '#6b4a32', 26, 3, 2, 26);
    px(ctx, '#8a6444', 1, 2, 28, 2);
    tire(ctx, 9, 12, 6);
    tire(ctx, 21, 13, 6);
    px(ctx, '#c4382f', 14, 4, 2, 14);
    px(ctx, '#9a2b24', 15, 6, 1, 12);
    return { canvas: c, ax: 15, ay: 28 };
  }
  if (kind === 'repair_sign') {
    // the universal sign: a tire propped up on a little stand, a red stripe painted on it
    const [c, ctx] = makeCanvas(18, 18);
    shadowEllipse(ctx, 9, 16, 7, 1, 0.22);
    px(ctx, '#5a3a2a', 4, 13, 10, 3);
    tire(ctx, 9, 8, 7);
    px(ctx, '#e04a3a', 3, 7, 2, 3);
    px(ctx, '#e04a3a', 13, 7, 2, 3);
    return { canvas: c, ax: 9, ay: 16 };
  }
  if (kind === 'repair_compressor') {
    // a red air tank on two wheels, the motor on top and the coiled yellow hose
    const [c, ctx] = makeCanvas(20, 16);
    shadowEllipse(ctx, 10, 14, 9, 2, 0.24);
    px(ctx, o, 2, 6, 16, 7);
    px(ctx, '#d0352c', 3, 7, 14, 5);
    px(ctx, '#f06a5f', 3, 7, 14, 1);
    px(ctx, '#8f201d', 3, 11, 14, 1);
    px(ctx, o, 5, 2, 8, 5);
    px(ctx, '#6b7385', 6, 3, 6, 3);
    px(ctx, '#b8bfcc', 6, 3, 2, 1);
    px(ctx, o, 3, 12, 3, 3);
    px(ctx, o, 14, 12, 3, 3);
    px(ctx, '#f2c94c', 16, 5, 3, 1);
    px(ctx, '#f2c94c', 18, 6, 1, 6);
    px(ctx, '#f2c94c', 16, 12, 3, 1);
    return { canvas: c, ax: 10, ay: 14 };
  }
  if (kind === 'repair_stool') {
    // the low blue plastic stool
    const [c, ctx] = makeCanvas(12, 8);
    shadowEllipse(ctx, 6, 7, 5, 1, 0.2);
    px(ctx, o, 1, 0, 10, 3);
    px(ctx, '#3d7ce0', 2, 1, 8, 1);
    px(ctx, '#2a589f', 2, 3, 1, 4);
    px(ctx, '#2a589f', 9, 3, 1, 4);
    return { canvas: c, ax: 6, ay: 7 };
  }
  // a big blue plastic basin of water (to find the hole by the bubbles), an inner tube soaking in it
  const [c, ctx] = makeCanvas(18, 9);
  shadowEllipse(ctx, 9, 7, 8, 1, 0.2);
  px(ctx, o, 1, 1, 16, 7);
  px(ctx, '#3d7ce0', 2, 2, 14, 5);
  px(ctx, '#7fb0f0', 3, 2, 12, 2);
  px(ctx, '#2a2e38', 5, 3, 8, 1);
  px(ctx, '#ffffff', 7, 2, 1, 1);
  px(ctx, '#ffffff', 11, 3, 1, 1);
  return { canvas: c, ax: 9, ay: 7 };
}

/**
 * The evening garbage cart (xe đẩy rác): a flared sheet-metal bin painted green, riveted bands and a rolled rim, heaped
 * with trash bags; a bamboo broom strapped to its side, the long push handle at its west end with the brass bell, two
 * big spoked wheels.
 */
function trashCartSprite(): PropSprite {
  const o = '#22303a';
  const [c, ctx] = makeCanvas(44, 36);
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  shadowEllipse(ctx, 24, 33, 18, 2, 0.28);
  // push handle: a long bar from the bin's west side, the rubber grip, and the brass bell hanging under it
  px(o, 1, 11, 11, 3);
  px('#8a95a3', 2, 12, 10, 1);
  px('#2a2e38', 1, 11, 3, 3);
  px(o, 4, 14, 1, 2);
  px(o, 2, 16, 5, 4);
  px('#d9a43a', 3, 16, 3, 3);
  px('#f6d27a', 3, 16, 1, 1);
  px('#a77b26', 3, 19, 3, 1);
  // the trash heaped over the rim: black, white and blue bags, a cardboard flap
  const bag = (x: number, y: number, w: number, h: number, body: string, light: string) => {
    px(o, x, y + 1, w, h - 1);
    px(o, x + 1, y, w - 2, 1);
    px(body, x + 1, y + 1, w - 2, h - 2);
    px(light, x + 1, y + 1, Math.max(1, Math.floor(w / 3)), 1);
  };
  bag(12, 3, 9, 7, '#2a2e38', '#4a5060');
  bag(19, 1, 9, 8, '#e8e4da', '#ffffff');
  bag(27, 4, 8, 6, '#3d7ce0', '#7fb0f0');
  px(o, 33, 2, 6, 6);
  px('#c8955a', 34, 3, 4, 4);
  px('#a4733c', 34, 6, 4, 1);
  bag(15, 6, 7, 5, '#4c9a5a', '#7cc47a');
  // the bin: wider at the top (flared), lit from the left; rolled rim on top
  for (let y = 9; y <= 27; y++) {
    const inset = Math.round((y - 9) * 0.28);
    const x0 = 10 + inset;
    const x1 = 39 - inset;
    px(o, x0 - 1, y, x1 - x0 + 3);
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      px(t < 0.2 ? '#4c9a5a' : t > 0.82 ? '#245232' : '#357a45', x, y);
    }
  }
  px(o, 8, 8, 34, 3);
  px('#7cc47a', 9, 8, 32, 1);
  px('#2a5c34', 9, 10, 32, 1);
  // riveted bands and a painted sign panel
  for (const y of [14, 23]) {
    const inset = Math.round((y - 9) * 0.28);
    px('#245232', 10 + inset, y, 30 - inset * 2, 1);
    for (let x = 12 + inset; x < 39 - inset; x += 5) px('#9fd0a8', x, y - 1, 1, 1);
  }
  px('#f2c94c', 18, 16, 14, 5);
  px('#c8a030', 18, 20, 14, 1);
  px('#2e3648', 20, 18, 10, 1);
  // bamboo broom strapped along the side, its bristles fanned at the back end
  px('#c8a46a', 12, 25, 26, 1);
  px('#9a7a44', 12, 26, 26, 1);
  px('#d9342b', 20, 24, 1, 3);
  px('#d9342b', 31, 24, 1, 3);
  for (let i = 0; i < 6; i++) px(i % 2 ? '#b08a50' : '#d6b878', 37 + Math.floor(i / 2), 23 + i, 4, 1);
  // axle and the two big wheels: rubber tire, spokes, hub
  px(o, 13, 28, 24, 2);
  for (const wx of [15, 33]) {
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y);
        if (d > 4.4) continue;
        px(d > 3.2 ? '#14171e' : (x === 0 || y === 0 || x === y || x === -y) ? '#9aa3b5' : '#4a5060', wx + x, 30 + y);
      }
    px('#d6dbe4', wx, 30, 1, 1);
  }
  return { canvas: c, ax: 24, ay: 34 };
}

function banhmiCartSprite(): PropSprite {
  const [c, ctx] = makeCanvas(42, 36);
  shadowEllipse(ctx, 21, 33, 18, 2, 0.24);
  // push handle (west end)
  ctx.fillStyle = '#4a5468';
  ctx.fillRect(0, 16, 6, 1);
  ctx.fillRect(4, 16, 1, 6);
  // awning posts
  ctx.fillStyle = '#8d96a3';
  ctx.fillRect(7, 4, 1, 5);
  ctx.fillRect(35, 4, 1, 5);
  // glass case: aluminum frame, bluish glass, the loaves and the xôi pot inside
  ctx.fillStyle = '#9aa6b4';
  ctx.fillRect(7, 8, 29, 11);
  ctx.fillStyle = '#d6eef7';
  ctx.fillRect(8, 9, 27, 9);
  drawLoaf(ctx, 9, 11);
  drawLoaf(ctx, 17, 11);
  drawLoaf(ctx, 12, 14);
  drawLoaf(ctx, 20, 14);
  ctx.fillStyle = '#3a7a35';
  ctx.fillRect(28, 15, 6, 2);
  ctx.fillStyle = '#4f9a45';
  ctx.fillRect(28, 14, 6, 1);
  ctx.fillStyle = '#f7f1dc';
  ctx.fillRect(29, 12, 4, 2);
  ctx.fillRect(30, 11, 2, 1);
  ctx.fillStyle = '#c9893a';
  ctx.fillRect(30, 12, 1, 1);
  // reflection on the glass
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(9, 9, 3, 1);
  ctx.fillRect(9, 10, 1, 1);
  ctx.fillRect(26, 9, 1, 1);
  // cabinet (blue tin) with the red sign
  ctx.fillStyle = '#2e3648';
  ctx.fillRect(5, 18, 33, 12);
  ctx.fillStyle = '#2f7fd8';
  ctx.fillRect(6, 19, 31, 10);
  ctx.fillStyle = '#6aa8f0';
  ctx.fillRect(6, 19, 31, 1);
  ctx.fillStyle = '#1f5aa6';
  ctx.fillRect(6, 28, 31, 1);
  ctx.fillStyle = '#d8383e';
  ctx.fillRect(7, 20, 29, 8);
  ctx.fillStyle = '#9e2328';
  ctx.fillRect(7, 27, 29, 1);
  const yellow = '#ffd36b';
  signText(ctx, 'BANH MI', 8, 22, yellow);
  // the accents: Á and Ì
  ctx.fillStyle = yellow;
  ctx.fillRect(14, 21, 1, 1);
  ctx.fillRect(31, 21, 1, 1);
  // wheels
  for (const wx of [11, 31]) {
    ctx.fillStyle = '#2e3648';
    ctx.fillRect(wx - 3, 29, 6, 5);
    ctx.fillRect(wx - 2, 28, 4, 7);
    ctx.fillStyle = '#a8b0bc';
    ctx.fillRect(wx - 1, 30, 2, 2);
  }
  // striped awning (red and white) with a scalloped edge
  ctx.fillStyle = '#9e2328';
  ctx.fillRect(5, 0, 33, 1);
  for (let x = 4; x < 39; x++) {
    const red = Math.floor((x - 4) / 3) % 2 === 0;
    ctx.fillStyle = red ? '#d8383e' : '#f4f6f8';
    ctx.fillRect(x, 1, 1, 4);
    if (red) ctx.fillRect(x, 5, 1, 1);
  }
  ctx.fillStyle = 'rgba(28,36,52,0.18)';
  ctx.fillRect(4, 4, 35, 1);
  return { canvas: c, ax: 21, ay: 34 };
}

export function propSprite(prop: ExteriorProp): PropSprite {
  const key = prop.kind === 'lamp' || prop.kind === 'bench' || prop.kind === 'totem' ? prop.kind : `${prop.kind}:${prop.seed % 7}`;
  let s = cache.get(key);
  if (s) return s;
  switch (prop.kind) {
    case 'tree':
      s = treeSprite(prop.seed % 7);
      break;
    case 'pine':
      s = pineSprite(prop.seed % 7);
      break;
    case 'bush':
      s = bushSprite(prop.seed % 7);
      break;
    case 'flowers':
      s = flowersSprite(prop.seed % 7);
      break;
    case 'hedge':
      s = hedgeSprite(prop.seed % 7);
      break;
    case 'lamp':
      s = lampSprite();
      break;
    case 'bench':
      s = benchSprite();
      break;
    case 'rock':
      s = rockSprite(prop.seed % 7);
      break;
    case 'parasol':
      s = parasolSprite(prop.seed % 7);
      break;
    case 'totem':
      s = totemSprite();
      break;
    case 'tea_stool':
      s = teaStoolSprite(prop.seed);
      break;
    case 'tea_table':
      s = teaTableSprite();
      break;
    case 'tea_cooler':
      s = teaCoolerSprite();
      break;
    case 'tea_stack':
      s = teaStackSprite();
      break;
    case 'banhmi_cart':
      s = banhmiCartSprite();
      break;
    case 'repair_rack':
    case 'repair_sign':
    case 'repair_compressor':
    case 'repair_stool':
    case 'repair_basin':
      s = repairSprite(prop.kind);
      break;
    case 'trash_cart':
      s = trashCartSprite();
      break;
    default:
      // 'paving' and other kinds drawn by the renderer itself
      s = { canvas: makeCanvas(1, 1)[0], ax: 0, ay: 0 };
  }
  cache.set(key, s);
  return s;
}

const CAR_COLORS: [string, string, string][] = [
  ['#d9534a', '#a83a33', '#f08a80'],
  ['#3f7fd8', '#2c5ea6', '#7fb0f0'],
  ['#f2f2ee', '#c4c6c8', '#ffffff'],
  ['#f2b33d', '#c88a1f', '#ffd889'],
  ['#2fb3a3', '#1f8579', '#79dccf'],
  ['#4a5468', '#323a4a', '#76819a'],
];

/** Car seen from the side, facing right; `flip` draws it facing left. About twice a motorbike's length. */
export function carSprite(variant: number, flip: boolean): PropSprite {
  const key = `car:${variant % CAR_COLORS.length}:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [body, dark, light] = CAR_COLORS[variant % CAR_COLORS.length];
  const W = 60;
  const H = 32;
  const [c, ctx] = makeCanvas(W, H);
  if (flip) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  const o = '#2e3648';
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  shadowEllipse(ctx, 30, 29, 28, 2, 0.3);
  // cabin: a trapezoid, the windshield raked more than the rear window
  const cabin = (y: number): [number, number] => [17 - Math.round((y - 5) * 0.7), 39 + Math.round((y - 5) * 1.1)];
  for (let y = 5; y <= 14; y++) {
    const [x0, x1] = cabin(y);
    px(o, x0 - 1, y, x1 - x0 + 3);
  }
  px(o, 17, 4, 23);
  for (let y = 5; y <= 14; y++) {
    const [x0, x1] = cabin(y);
    px(y === 5 ? light : body, x0, y, x1 - x0 + 1);
  }
  // windows: rear and front, split by the B pillar, a reflection streak across each
  for (let y = 7; y <= 13; y++) {
    const [x0, x1] = cabin(y);
    px('#3a5f86', x0 + 2, y, 28 - x0 - 2);
    px('#3a5f86', 31, y, x1 - 2 - 31);
  }
  for (let i = 0; i < 5; i++) {
    px('#9cc7ec', 18 + i, 12 - i);
    px('#9cc7ec', 35 + i, 12 - i);
  }
  // lower body: long, rounded at the ends, lit along the shoulder line
  px(o, 3, 14, 54, 11);
  px(o, 2, 16, 56, 7);
  px(body, 4, 15, 52, 9);
  px(body, 3, 16, 54, 6);
  px(light, 4, 15, 52, 1);
  px(dark, 3, 21, 54, 3);
  // doors, handles, side mirror
  px(dark, 29, 15, 1, 7);
  px(dark, 44, 15, 1, 6);
  px(light, 24, 17, 3, 1);
  px(light, 39, 17, 3, 1);
  px(o, 44, 12, 3, 3);
  px(body, 45, 13, 1, 1);
  // bumpers, headlight and tail light
  px('#9aa3b5', 54, 21, 4, 2);
  px('#9aa3b5', 2, 21, 4, 2);
  px('#fff3c4', 55, 16, 2, 2);
  px('#e04a3a', 2, 16, 2, 3);
  // wheels in their arches
  for (const wx of [13, 46]) {
    px(o, wx - 6, 19, 13, 2);
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        const d = Math.hypot(x, y);
        if (d > 5.3) continue;
        px(d > 3.4 ? '#1f2430' : d > 1.4 ? '#6b7385' : '#b8bfcc', wx + x, 24 + y);
      }
    px('#9aa3b5', wx - 2, 21, 2, 1);
  }
  const s = { canvas: c, ax: 30, ay: 29 };
  cache.set(key, s);
  return s;
}

const BIKE_COLORS: [string, string, string][] = [
  ['#c9302c', '#8f201d', '#e8665f'],
  ['#2b2f3a', '#1b1e26', '#4a5060'],
  ['#e8e4da', '#b9b4a8', '#ffffff'],
  ['#3d7ce0', '#2a589f', '#7fb0f0'],
  ['#8c3fd1', '#632b96', '#b57ce8'],
  ['#d9a43a', '#a77b26', '#f2c870'],
  ['#4c9a6a', '#356e4b', '#7cc496'],
];

/** Motorbike sprites: `back` goes under the riders, `front` on top of them (leg shield, floorboard, handlebar). */
export interface BikeSprites {
  back: PropSprite;
  front: PropSprite;
}

/** Riders sit this far ahead of the bike's center (px, facing right): the rider and the passenger behind. */
export const BIKE_SEATS = { rider: -1, passenger: -8 } as const;

/** Scooter (facing right; 30 px long, the anchor where the wheels touch the ground), in one of the body colors. */
export function motorbikeSprites(variant: number, flip: boolean): BikeSprites {
  const key = `bike:${variant % BIKE_COLORS.length}:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return { back: hit, front: cache.get(key + ':front')! };
  const [body, dark, light] = BIKE_COLORS[variant % BIKE_COLORS.length];
  const o = '#2e3648';
  const W = 30;
  const H = 24;
  const layer = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const [c, ctx] = makeCanvas(W, H);
    if (flip) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    return [c, ctx];
  };
  const px = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const wheel = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y);
        if (d > 4.3) continue;
        px(ctx, d > 2.6 ? '#1f2430' : d > 0.8 ? '#5d6476' : '#b8bfcc', cx + x, cy + y);
      }
    px(ctx, '#3a4050', cx - 3, cy - 3);
  };

  // ---- back: wheels, rear body, seat, exhaust
  const [bc, b] = layer();
  shadowEllipse(b, 15, 21, 13, 2, 0.3);
  // rear body: a tall rounded cowl under the seat, sloping down to the tail, outlined and lit from the top
  const rows: [number, number, number][] = [
    [7, 5, 16],
    [8, 3, 17],
    [9, 2, 17],
    [10, 2, 17],
    [11, 2, 17],
    [12, 3, 17],
    [13, 4, 17],
    [14, 5, 16],
  ];
  for (const [y, x0, x1] of rows) px(b, o, x0 - 1, y, x1 - x0 + 3);
  px(b, o, 4, 15, 13);
  for (const [y, x0, x1] of rows) px(b, y === 8 ? light : y >= 13 ? dark : body, x0, y, x1 - x0 + 1);
  px(b, light, 5, 7, 4);
  // side panel line and a stripe decal
  px(b, dark, 6, 10, 10);
  px(b, light, 7, 11, 6);
  // tail light and rear rack
  px(b, '#e04a3a', 1, 9, 2, 2);
  px(b, o, 2, 6, 4, 1);
  // seat: long, padded, dark, a highlight along the top
  px(b, o, 4, 4, 14, 4);
  px(b, '#2a2e38', 5, 5, 12, 2);
  px(b, '#4a5060', 6, 5, 9, 1);
  // exhaust peeking out behind the rear wheel, then the wheels
  px(b, o, 1, 15, 7, 3);
  px(b, '#9aa3b5', 2, 16, 5, 1);
  wheel(b, 7, 18);
  wheel(b, 23, 18);

  // ---- front: floorboard, leg shield up to the handlebar, front fender, lights, mirror
  const [fc, f] = layer();
  px(f, o, 12, 15, 9, 3);
  px(f, '#4a5060', 13, 16, 7, 1);
  // leg shield: a column leaning back from the front wheel up to the handlebar
  for (let y = 4; y <= 16; y++) {
    const x = 18 + Math.round((y - 4) / 4);
    px(f, o, x - 1, y, 5);
    px(f, y < 7 ? light : y > 13 ? dark : body, x, y, 3);
  }
  // front fender hugging the wheel
  px(f, o, 20, 12, 8, 3);
  px(f, body, 21, 13, 6, 1);
  px(f, light, 21, 12, 5, 1);
  // headlight and turn signal on the shield
  px(f, o, 20, 5, 4, 3);
  px(f, '#fff3c4', 21, 6, 2, 1);
  px(f, '#f2a33a', 22, 9, 1, 1);
  // handlebar with its grip, and the mirror on its stalk
  px(f, o, 14, 2, 8, 2);
  px(f, '#1b1e26', 14, 2, 2, 2);
  px(f, o, 19, 0, 1, 2);
  px(f, '#9aa3b5', 18, 0, 3, 1);

  const back = { canvas: bc, ax: 15, ay: 21 };
  const front = { canvas: fc, ax: 15, ay: 21 };
  cache.set(key, back);
  cache.set(key + ':front', front);
  return { back, front };
}

/** Where the rear rack is, from the bike's anchor (px, facing right): cargo sits on it, behind the rider. */
export const BIKE_RACK = { dx: -11, dy: -15 } as const;

/** Something tied to a bike's rear rack (facing right); the anchor is the bottom center, on the rack. */
export function cargoSprite(kind: 'water' | 'foam' | 'plant' | 'flowers' | 'peach', flip: boolean, seed = 0): PropSprite {
  const key = `cargo:${kind}:${flip ? 1 : 0}:${seed % 4}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 24;
  const H = 30;
  const [c, ctx] = makeCanvas(W, H);
  if (flip) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  const o = '#2e3648';
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const cx = 12;
  const by = H - 1;
  if (kind === 'water') {
    // a 20 L water jug standing on the rack: translucent blue, white cap
    px(o, cx - 4, by - 10, 9, 10);
    px('#5aa9e6', cx - 3, by - 9, 7, 8);
    px('#9fd0f5', cx - 2, by - 8, 1, 6);
    px('#3f86c4', cx + 2, by - 8, 1, 7);
    px(o, cx - 2, by - 13, 5, 3);
    px('#f4f4f0', cx - 1, by - 12, 3, 2);
  } else if (kind === 'foam') {
    // two foam boxes stacked and tied with red string
    for (const [y, w] of [
      [by - 6, 12],
      [by - 12, 11],
    ] as const) {
      px(o, cx - Math.ceil(w / 2), y, w + 1, 7);
      px('#f4f4f0', cx - Math.ceil(w / 2) + 1, y + 1, w - 1, 5);
      px('#d4d4cc', cx - Math.ceil(w / 2) + 1, y + 4, w - 1, 2);
    }
    px('#d9342b', cx - 1, by - 12, 1, 12);
    px('#d9342b', cx - 6, by - 9, 12, 1);
  } else if (kind === 'plant') {
    // a potted plant: terracotta pot and a big round leafy top, lit from the top left
    const leaf = mulberry32(0x9e1 + seed);
    for (let y = -8; y <= 7; y++)
      for (let x = -8; x <= 8; x++) {
        const d = Math.hypot(x, y * 1.15);
        if (d > 8.4 - leaf() * 1.2) continue;
        const lit = x + y < -5 ? '#8fd08a' : x + y > 5 ? '#357a45' : '#4fa25c';
        px(d > 7.4 ? '#2a5c34' : leaf() < 0.18 ? '#2f6b3c' : lit, cx + x, by - 13 + y);
      }
    px(o, cx - 4, by - 6, 9, 6);
    px('#c8693a', cx - 3, by - 5, 7, 4);
    px('#e08a5a', cx - 3, by - 5, 7, 1);
  } else if (kind === 'flowers') {
    // a big bouquet in a kraft paper cone, leaning back: red roses, pink and white blooms, leaves
    for (let y = 0; y < 10; y++) {
      const w = 2 + Math.floor(y / 2);
      px(o, cx - w - 1, by - y, w * 2 + 3, 1);
      px(y % 3 ? '#e9cfa6' : '#d6b88a', cx - w, by - y, w * 2 + 1, 1);
    }
    px('#d9342b', cx - 4, by - 4, 9, 1);
    const blooms = ['#e8454a', '#f08ab8', '#ffffff', '#c92d3a', '#f2c94c', '#f08ab8'];
    const spots: [number, number][] = [
      [-6, -13], [-3, -16], [1, -18], [4, -15], [6, -12], [-4, -11], [0, -13], [3, -11], [-1, -20], [5, -18], [-6, -17],
    ];
    for (const [x, y] of [[-7, -11], [7, -10], [-2, -21], [6, -19]] as const) px('#4c9a5a', cx + x, by + y, 2, 2);
    spots.forEach(([x, y], i) => {
      px(o, cx + x - 1, by + y - 1, 4, 4);
      px(blooms[(i + seed) % blooms.length], cx + x, by + y, 2, 2);
      px('#ffffff', cx + x, by + y, 1, 1);
    });
  } else {
    // a peach branch for Tết: dark twigs fanning up and back, covered in pink blossoms
    const rng = mulberry32(0xda0 + seed);
    const twig = '#5a3a2a';
    const wood: [number, number][] = [];
    const branch = (x: number, y: number, dx: number, n: number) => {
      for (let i = 0; i < n && y > 1; i++) {
        const rx = Math.round(x);
        if (rx >= 0 && rx < W) {
          px(i < 4 ? '#4a2e22' : twig, rx, y, i < 3 ? 2 : 1, 1);
          if (i > 3) wood.push([rx, y]);
        }
        x += dx + (rng() - 0.5) * 0.7;
        y -= 1;
        if (rng() < 0.2 && n - i > 5) branch(x, y, dx + (rng() < 0.5 ? -0.7 : 0.7), Math.floor((n - i) * 0.65));
      }
    };
    // tied to the rack: a thick stump, branches fanning up and back
    px('#d9342b', cx - 2, by - 2, 5, 1);
    branch(cx, by - 1, -0.3, 27);
    branch(cx, by - 1, 0.25, 22);
    branch(cx - 1, by - 1, -0.75, 18);
    // blossoms hugging the twigs: pink five-petal dots, some still buds
    for (let i = 0; i < 90 && wood.length; i++) {
      const [wx, wy] = wood[Math.floor(rng() * wood.length)];
      const x = wx + Math.round((rng() - 0.5) * 4);
      const y = wy + Math.round((rng() - 0.5) * 3);
      if (y > by - 5 || y < 0 || x < 0 || x >= W - 1) continue;
      const r = rng();
      px(r < 0.15 ? '#c2185b' : r < 0.5 ? '#f08ab8' : '#f9b9d2', x, y, 2, 2);
      if (r > 0.4) px('#fff0f5', x, y, 1, 1);
    }
  }
  const s = { canvas: c, ax: cx, ay: by };
  cache.set(key, s);
  return s;
}

/** Contact shadow under the characters. */
export function shadowSprite(): PropSprite {
  const hit = cache.get('shadow');
  if (hit) return hit;
  const [c, ctx] = makeCanvas(14, 6);
  shadowEllipse(ctx, 7, 3, 6, 2, 0.28);
  const s = { canvas: c, ax: 7, ay: 3 };
  cache.set('shadow', s);
  return s;
}

/** Radial glow (drawn with additive compositing). */
export function glowSprite(color: string, size = 64): HTMLCanvasElement {
  const key = `glow:${color}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit.canvas;
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = hex(color);
  g.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
  g.addColorStop(0.4, `rgba(${r},${gg},${b},0.35)`);
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, { canvas: c, ax: size / 2, ay: size / 2 });
  return c;
}
