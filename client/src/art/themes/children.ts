// Children's Day (Tết Thiếu nhi, June 1) theme art, after Vietnamese folk toys (đồ chơi dân gian): a tò he stand with
// dough figurines on sticks, a cánh diều (kite) with a long bow tail on a pole, a trống bỏi (rattle drum), a hanging
// chong chóng giấy (paper pinwheel), and on the head a mặt nạ giấy (paper mask) pushed up on the forehead or a party
// cone hat. Bright but soft: sky blue, sunny yellow, coral, mint, with the folk-toy red.
import { ramp } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { THEME_COSTUMES, THEME_PROPS } from './registry';

const SKY = '#6cb4e4';
const SUN = '#f5cf5a';
const CORAL = '#ef8a7a';
const MINT = '#79d1b0';
const LILAC = '#b49ae0';
const RED = '#d9483f';
const CREAM = '#fff6e2';
const BAMBOO = '#d8bd7f';
const WOOD = '#8a5f3c';
const INK = '#2a1f26';
const THREAD = '#cfc6b4';

/** Tò he: a little dough bird (red body, yellow beak, mint tail), facing left; (x, y) is its top-left. */
function doughBird(b: PixelBuf, x: number, y: number): void {
  const r = ramp(RED, 0.08);
  b.rect(x + 1, y + 1, 4, 3, r.base);
  b.rect(x + 1, y, 2, 2, r.lt);
  b.set(x, y + 1, SUN); // beak
  b.set(x + 1, y + 1, INK); // eye
  b.rect(x + 5, y, 2, 2, MINT); // tail
  b.set(x + 6, y - 1, ramp(MINT, 0.08).lt);
  b.hline(x + 2, x + 4, y + 3, r.dk);
  b.set(x + 3, y + 2, SUN); // wing
}

/** Tò he: a dough carp (orange with a yellow fan tail), facing right. */
function doughFish(b: PixelBuf, x: number, y: number): void {
  const r = ramp('#f0954a', 0.08);
  b.rect(x + 2, y, 4, 3, r.base);
  b.hline(x + 2, x + 5, y, r.lt);
  b.set(x + 6, y + 1, r.base);
  b.set(x + 5, y + 1, INK);
  b.rect(x, y - 1, 2, 2, SUN); // tail
  b.rect(x, y + 2, 2, 2, SUN);
  b.set(x + 1, y + 1, r.dk);
  b.set(x + 3, y + 2, r.dk);
}

/** Tò he: a dough flower (pink petals around a yellow heart). */
function doughFlower(b: PixelBuf, cx: number, cy: number): void {
  const p = ramp('#ee8fb0', 0.08);
  b.rect(cx - 1, cy - 2, 3, 5, p.base);
  b.rect(cx - 2, cy - 1, 5, 3, p.base);
  b.set(cx - 1, cy - 1, p.hi);
  b.set(cx + 1, cy + 1, p.dk);
  b.set(cx, cy, SUN);
}

/** Tò he stand: a straw bundle (bó rơm) on a little wooden stool, bristling with dough figurines on bamboo sticks. */
THEME_PROPS.set('children:tohe', (b) => {
  b.shadow(20, 59, 9, 2, '#252c39', 0.22);
  const w = ramp(WOOD, 0.08);
  b.rect(13, 52, 15, 3, w.base);
  b.hline(13, 27, 52, w.lt);
  b.rect(14, 55, 2, 4, w.dk);
  b.rect(25, 55, 2, 4, w.dk);
  // sticks first (behind the figurines and the bundle)
  for (const [x0, y0, x1, y1] of [[19, 34, 11, 24], [20, 34, 20, 20], [21, 34, 28, 26], [18, 40, 9, 36], [22, 41, 31, 37]]) b.line(x0, y0, x1, y1, BAMBOO);
  // straw bundle with two red ties
  const straw = ramp('#e6c463', 0.08);
  b.rect(16, 33, 9, 19, straw.base);
  b.hline(17, 23, 32, straw.lt);
  for (const x of [18, 21]) b.vline(x, 33, 51, straw.dk);
  b.vline(16, 33, 51, straw.lt);
  b.vline(24, 33, 51, straw.dd);
  for (const y of [37, 47]) b.hline(16, 24, y, RED);
  // figurines
  doughBird(b, 7, 21);
  doughFlower(b, 20, 17);
  doughFish(b, 26, 24);
  // a little mint parrot and a lilac chick lower down
  b.rect(7, 33, 3, 3, MINT);
  b.set(6, 34, SUN);
  b.set(7, 34, INK);
  b.set(9, 35, ramp(MINT, 0.08).dk);
  b.rect(30, 34, 3, 3, LILAC);
  b.set(33, 35, SUN);
  b.set(32, 34, INK);
  b.set(30, 36, ramp(LILAC, 0.08).dk);
});

/** Cánh diều: a diamond paper kite on bamboo spars, tied to a pole, with a long tail of little bows. */
THEME_PROPS.set('children:kite', (b) => {
  b.shadow(20, 59, 6, 2, '#252c39', 0.22);
  const w = ramp(WOOD, 0.08);
  b.rect(20, 30, 2, 26, ramp(BAMBOO, 0.08).dk);
  b.vline(20, 30, 55, BAMBOO);
  b.rect(16, 55, 10, 4, w.base);
  b.hline(16, 25, 55, w.lt);
  // the kite: rhombus centered (21, 20), half sizes 9 × 11, four paper panels
  const cx = 21;
  const cy = 20;
  const hw = 9;
  const hh = 11;
  const red = ramp(RED, 0.08);
  const sun = ramp(SUN, 0.08);
  for (let y = -hh; y <= hh; y++) {
    const half = Math.round(hw * (1 - Math.abs(y) / (hh + 0.5)));
    for (let x = -half; x <= half; x++) {
      const p = (y < 0) === (x < 0) ? red : sun;
      b.set(cx + x, cy + y, x === -half || y === -hh ? p.lt : x === half ? p.dk : p.base);
    }
  }
  const spar = ramp(BAMBOO, 0.08).dk;
  b.vline(cx, cy - hh, cy + hh, spar);
  b.hline(cx - hw + 1, cx + hw - 1, cy - 2, spar);
  // tail: a wavy string with bows, trailing down to the right
  let prev: [number, number] = [cx, cy + hh];
  const bows = [SKY, CORAL, MINT, SUN, LILAC];
  for (let i = 1; i <= 12; i++) {
    const ty = cy + hh + i * 2;
    const tx = cx + 2 + Math.round(i * 0.9 + Math.sin(i * 0.9) * 1.5);
    b.line(prev[0], prev[1], tx, ty, THREAD);
    prev = [tx, ty];
    if (i % 3 === 0) {
      const c = bows[(i / 3) % bows.length];
      b.set(tx - 1, ty - 1, c);
      b.set(tx - 1, ty, c);
      b.set(tx + 1, ty, c);
      b.set(tx + 1, ty + 1, c);
    }
  }
});

/** Trống bỏi: a little red rattle drum on its stick, two beads on strings, standing in a wooden foot. */
THEME_PROPS.set('children:trongboi', (b) => {
  b.shadow(20, 59, 6, 2, '#252c39', 0.22);
  const w = ramp(WOOD, 0.08);
  b.rect(17, 56, 7, 3, w.base);
  b.hline(17, 23, 56, w.lt);
  b.vline(20, 50, 55, BAMBOO);
  // drum face (seen from the front): red rim, cream skin with a red-and-yellow swirl
  const r = ramp(RED, 0.08);
  b.ellipse(20.5, 46, 5, 4.5, r.dk);
  b.ellipse(20.5, 45.5, 4.5, 4, r.base);
  b.ellipse(20.5, 45.5, 3, 2.6, CREAM);
  b.set(19, 45, r.lt);
  b.set(20, 44, r.lt);
  b.set(21, 46, SUN);
  b.set(22, 45, SUN);
  b.hline(18, 23, 42, r.lt);
  // beads swinging on strings
  b.line(15, 46, 13, 50, THREAD);
  b.line(26, 46, 28, 50, THREAD);
  b.rect(12, 50, 2, 2, ramp(SUN, 0.08).dk);
  b.rect(28, 50, 2, 2, ramp(SUN, 0.08).dk);
  b.set(12, 50, SUN);
  b.set(28, 50, SUN);
});

/** Chong chóng giấy (paper pinwheel) hanging from a string: four two-tone blades around a yellow pin. */
THEME_PROPS.set('children:pinwheel', (b) => {
  b.vline(20, 35, 41, '#8a6a3a');
  const cx = 20;
  const cy = 48;
  const R = 7;
  const blades = [CORAL, SKY, SUN, MINT];
  // blade k: triangle (center, corner k, midpoint of the edge after it) — the classic pinwheel fold
  const corners: [number, number][] = [
    [-R, -R],
    [R, -R],
    [R, R],
    [-R, R],
  ];
  const mids: [number, number][] = [
    [0, -R],
    [R, 0],
    [0, R],
    [-R, 0],
  ];
  const inTri = (px: number, py: number, c: [number, number], d: [number, number]) => {
    const s = (p: [number, number], q: [number, number]) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
    const o: [number, number] = [0, 0];
    const d1 = s(o, c), d2 = s(c, d), d3 = s(d, o);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      for (let k = 0; k < 4; k++) {
        const c = corners[k];
        if (inTri(x, y, c, mids[k])) {
          const r = ramp(blades[k], 0.09);
          // the half near the corner is lighter (paper catching the light)
          const nearCorner = Math.abs(x - c[0]) + Math.abs(y - c[1]) < R;
          b.set(cx + x, cy + y, nearCorner ? r.lt : r.base);
          break;
        }
      }
    }
  }
  b.rect(cx - 1, cy - 1, 3, 3, ramp(SUN, 0.1).dk);
  b.set(cx, cy, CREAM);
  // ribbon tail below
  b.vline(cx, cy + 2, cy + 8, '#8a6a3a');
  b.set(cx - 1, cy + 9, CORAL);
  b.set(cx + 1, cy + 9, SKY);
  b.set(cx, cy + 10, SUN);
});

// The character sheet only has ~3 px above the head rig (y - 3), so the head pieces stay compact.

/** Striped party cone hat, a bit to one side, with a pompom and the elastic. */
THEME_COSTUMES.set('children:conehat', (b, x, y) => {
  const rows: [number, number, string][] = [
    [7, 3, CORAL],
    [6, 5, CREAM],
    [5, 6, SKY],
    [4, 8, SUN],
  ];
  rows.forEach(([dx, w, c], i) => {
    const r = ramp(c, 0.1);
    b.hline(x + dx, x + dx + w - 1, y - 2 + i, r.base);
    b.set(x + dx + w - 1, y - 2 + i, r.dk);
    b.set(x + dx, y - 2 + i, r.lt);
  });
  b.hline(x + 3, x + 11, y + 2, ramp(CORAL, 0.1).dk);
  // pompom
  b.rect(x + 8, y - 3, 2, 1, MINT);
  b.set(x + 8, y - 3, ramp(MINT, 0.1).hi);
});

/**
 * Mặt nạ giấy pushed up on the forehead: a small painted paper mask on top of the head (y - 3 to y + 2, well above
 * the eyes), with its elastic around the head.
 */
function paperMask(b: PixelBuf, x: number, y: number, face: string, accent: string, ears: boolean): void {
  const f = ramp(face, 0.08);
  b.hline(x + 1, x + 12, y + 3, '#e6e1d6'); // elastic
  b.rect(x + 3, y - 2, 8, 4, f.base);
  b.hline(x + 4, x + 9, y + 2, f.dk);
  b.hline(x + 3, x + 10, y - 2, f.lt);
  if (ears) {
    b.rect(x + 3, y - 3, 2, 1, f.lt);
    b.rect(x + 9, y - 3, 2, 1, f.lt);
  } else {
    b.hline(x + 5, x + 8, y - 3, accent); // painted crown band
  }
  // painted brows, eyes, nose and cheeks
  b.set(x + 4, y - 1, accent);
  b.set(x + 9, y - 1, accent);
  b.set(x + 5, y, CREAM);
  b.set(x + 8, y, CREAM);
  b.set(x + 5, y - 1, INK);
  b.set(x + 8, y - 1, INK);
  b.rect(x + 6, y + 1, 2, 1, accent);
  b.set(x + 4, y + 1, CORAL);
  b.set(x + 9, y + 1, CORAL);
}

/** Red-faced Tề Thiên (monkey king) mask with a gold band. */
THEME_COSTUMES.set('children:mask', (b, x, y) => paperMask(b, x, y, RED, SUN, false));

/** Orange tiger mask with ears and dark stripes. */
THEME_COSTUMES.set('children:tigermask', (b, x, y) => {
  paperMask(b, x, y, '#f0a04a', INK, true);
  b.rect(x + 6, y - 2, 2, 1, INK);
  b.set(x + 3, y, INK);
  b.set(x + 10, y, INK);
});
