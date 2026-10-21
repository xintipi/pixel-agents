// Valentine theme art, with a Vietnamese touch: the Hà Nội flower-seller bicycle full of roses, heart balloons, a
// kraft-paper bouquet in a tin bucket, a string of Hội An silk lanterns with little hearts, and two costumes (heart
// headband, nón lá with a pink ribbon). Keys "valentine:*".
import { ramp } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { THEME_COSTUMES, THEME_PROPS } from './registry';

const RED = ramp('#d8435f', 0.09);
const PINK = ramp('#f08aa6', 0.08);
const ROSE = ramp('#c23a5a', 0.09);
const STRING = '#efe2e8';
const GOLD = ramp('#f2c45a', 0.08);
const IRON = ramp('#4a4658', 0.1); // old black bicycle
const WICKER = ramp('#c49a5c', 0.09);
const KRAFT = ramp('#c8a173', 0.08);
const LEAF = ramp('#4c8a4a', 0.1);
const SILK = ramp('#d33a3f', 0.09);

/** Heart bitmaps by width (odd sizes; rows top to bottom). */
const HEARTS: Record<number, readonly string[]> = {
  3: ['#.#', '###', '.#.'],
  5: ['##.##', '#####', '.###.', '..#..'],
  7: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  9: ['.###.###.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
  11: ['.###...###.', '#####.#####', '###########', '###########', '###########', '.#########.', '..#######..', '...#####...', '....###....', '.....#.....'],
  13: ['.####...####.', '######.######', '#############', '#############', '#############', '.###########.', '..#########..', '...#######...', '....#####....', '.....###.....', '......#......'],
};

/** Shaded heart of width `w`, centered on `cx`, top row at `top`: light top-left lobe, darker right and bottom edges. */
function heart(b: PixelBuf, cx: number, top: number, w: number, r: { hi: string; lt: string; base: string; dk: string; dd: string }, shine = true): void {
  const rows = HEARTS[w];
  const x0 = cx - (w >> 1);
  const at = (c: number, row: number) => rows[row]?.[c] === '#';
  for (let row = 0; row < rows.length; row++) {
    for (let c = 0; c < w; c++) {
      if (!at(c, row)) continue;
      let col = r.base;
      if (!at(c + 1, row) || !at(c, row + 1)) col = r.dk;
      else if (c > w / 2 && row > rows.length / 2 - 1) col = r.dk;
      if (!at(c, row + 1) && row > 1) col = r.dd;
      if (row <= 1 && c < w / 2 && at(c - 1, row) && at(c, row - 1)) col = r.lt;
      b.set(x0 + c, top + row, col);
    }
  }
  if (shine && w >= 7) {
    b.set(x0 + 2, top + 1, r.hi);
    b.set(x0 + 1, top + 2, r.hi);
    if (w >= 9) b.set(x0 + 2, top + 2, '#fff1f4');
  }
}

/** Plain one-color heart (no shading). */
function flatHeart(b: PixelBuf, cx: number, top: number, w: number, c: string): void {
  const rows = HEARTS[w];
  const x0 = cx - (w >> 1);
  rows.forEach((line, row) => {
    for (let i = 0; i < w; i++) if (line[i] === '#') b.set(x0 + i, top + row, c);
  });
}

/** A rose seen from above: 3×3 with a dark heart and a light top-left petal. */
function rose(b: PixelBuf, x: number, y: number, r: { hi: string; lt: string; base: string; dk: string; dd: string }): void {
  b.rect(x - 1, y - 1, 3, 3, r.base);
  b.set(x + 1, y + 1, r.dk);
  b.set(x - 1, y - 1, r.hi);
  b.set(x, y, r.dd);
}

/** A ring of radius r (a bicycle wheel), with a few spokes and a hub. */
function wheel(b: PixelBuf, cx: number, cy: number, r: number): void {
  for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r]] as const) b.line(cx, cy, cx + Math.round(dx * 0.7), cy + Math.round(dy * 0.7), '#a7a3ae');
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.line(cx, cy, cx + Math.round(dx * r * 0.5), cy + Math.round(dy * r * 0.5), '#8e8a96');
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > r - 0.9 && d <= r + 0.5) b.set(cx + x, cy + y, y < -r / 2 ? '#4a4652' : '#25232b');
    }
  }
  b.rect(cx - 1, cy - 1, 2, 2, '#c9c5cf');
}

// The Hà Nội flower-seller bicycle: an old black bike, side view, with a wicker basket of roses on the back rack.
THEME_PROPS.set('valentine:flowerbike', (b) => {
  b.shadow(20, 59, 17, 2, '#252c39', 0.22);
  wheel(b, 11, 52, 6);
  wheel(b, 30, 52, 6);
  // frame
  b.line(11, 52, 19, 52, IRON.base); // chain stay
  b.line(11, 52, 16, 43, IRON.base); // seat stay
  b.line(16, 42, 19, 52, IRON.dk); // seat tube
  b.line(16, 43, 27, 43, IRON.lt); // top tube
  b.line(27, 44, 19, 52, IRON.base); // down tube
  b.line(27, 41, 30, 52, IRON.dk); // fork
  b.line(27, 41, 26, 38, IRON.base); // stem
  b.hline(24, 29, 38, IRON.lt); // handlebar
  b.set(29, 39, '#6b4a33');
  b.rect(17, 51, 3, 3, IRON.dd); // chainring
  b.set(18, 52, '#a7a3ae');
  b.rect(19, 55, 3, 1, '#25232b'); // pedal
  b.rect(14, 41, 5, 2, '#6b4a33'); // saddle
  b.set(14, 41, '#8a6446');
  // rack over the rear wheel, with the basket on it
  b.hline(4, 16, 43, IRON.dk);
  b.vline(5, 43, 47, IRON.dk);
  b.rect(3, 34, 14, 9, WICKER.base);
  b.hline(3, 16, 34, WICKER.lt);
  b.hline(3, 16, 42, WICKER.dk);
  for (let y = 36; y < 42; y += 2) for (let x = 4 + (y % 4 === 0 ? 1 : 0); x < 16; x += 2) b.set(x, y, WICKER.dk);
  b.vline(16, 35, 42, WICKER.dk);
  // leaves and roses piled high above the basket, some spilling over the sides
  for (const [x, y] of [[3, 33], [6, 30], [10, 28], [15, 30], [17, 33], [8, 25], [13, 25], [3, 31]] as const) {
    b.rect(x - 1, y, 3, 2, LEAF.base);
    b.set(x - 1, y, LEAF.lt);
    b.set(x + 1, y + 1, LEAF.dk);
  }
  const roses: [number, number, typeof RED][] = [
    [4, 32, RED], [8, 32, PINK], [12, 32, RED], [16, 32, PINK], [6, 29, ROSE], [10, 29, PINK], [14, 29, RED],
    [8, 26, RED], [12, 26, PINK], [10, 23, ROSE], [3, 29, PINK], [17, 29, ROSE],
  ];
  for (const [x, y, r] of roses) rose(b, x, y, r);
  // a small bunch in front of the handlebar
  b.rect(30, 37, 3, 2, LEAF.base);
  rose(b, 31, 35, PINK);
  rose(b, 34, 37, RED);
});

// Three heart balloons on ribbons, tied to a little gift box on the floor.
THEME_PROPS.set('valentine:balloons', (b) => {
  b.shadow(20, 59, 8, 2, '#252c39', 0.2);
  // ribbons (behind the box and the balloons)
  b.line(20, 30, 20, 53, STRING);
  b.line(12, 31, 19, 53, STRING);
  b.line(28, 29, 21, 53, STRING);
  for (const [x, y] of [[19, 36], [21, 42], [19, 48]] as const) b.set(x, y, STRING);
  heart(b, 12, 22, 9, PINK);
  heart(b, 28, 21, 9, ROSE);
  heart(b, 20, 15, 11, RED);
  // knots under each balloon
  b.set(12, 30, PINK.dd);
  b.set(28, 29, ROSE.dd);
  b.set(20, 25, RED.dd);
  // gift box weight, with a ribbon
  b.rect(16, 53, 9, 6, PINK.base);
  b.rect(16, 53, 9, 1, PINK.lt);
  b.rect(16, 58, 9, 1, PINK.dk);
  b.vline(20, 53, 58, '#fff1f4');
  b.set(19, 52, '#fff1f4');
  b.set(21, 52, '#fff1f4');
});

// A bouquet of roses wrapped in kraft paper and tied with twine, standing in a little tin bucket.
THEME_PROPS.set('valentine:bouquet', (b) => {
  b.shadow(20, 59, 7, 2, '#252c39', 0.2);
  // roses and leaves on top
  for (const [x, y] of [[14, 45], [26, 45], [17, 41], [23, 41]] as const) {
    b.rect(x - 1, y, 3, 2, LEAF.base);
    b.set(x - 1, y, LEAF.lt);
  }
  rose(b, 17, 44, RED);
  rose(b, 23, 44, PINK);
  rose(b, 20, 42, ROSE);
  rose(b, 20, 45, PINK);
  rose(b, 15, 42, PINK);
  rose(b, 25, 42, RED);
  // kraft paper cone, folded
  for (let y = 46; y <= 54; y++) {
    const half = Math.round(7 - (y - 46) * 0.55);
    b.hline(20 - half, 20 + half, y, KRAFT.base);
    b.set(20 - half, y, KRAFT.lt);
    b.set(20 + half, y, KRAFT.dk);
  }
  b.line(16, 46, 20, 54, KRAFT.dk);
  b.hline(13, 27, 46, KRAFT.hi);
  // twine with a little bow
  b.hline(17, 23, 51, '#7a5a3a');
  b.set(19, 50, '#7a5a3a');
  b.set(21, 50, '#7a5a3a');
  b.set(20, 52, '#7a5a3a');
  // tin bucket
  b.rect(16, 54, 9, 5, '#9aa3ad');
  b.hline(15, 25, 54, '#c4ccd4');
  b.vline(16, 55, 58, '#b2bac3');
  b.vline(24, 55, 58, '#7d8691');
  b.hline(16, 24, 56, '#86909a');
});

/** Round Hội An silk lantern: gold caps, red body with ribs, a short tassel; `top` is the top cap. */
function lantern(b: PixelBuf, cx: number, top: number): void {
  b.rect(cx - 1, top, 3, 1, GOLD.base);
  const widths = [5, 7, 7, 7, 5];
  widths.forEach((w, i) => b.hline(cx - (w >> 1), cx + (w >> 1), top + 1 + i, SILK.base));
  b.vline(cx - 2, top + 2, top + 4, SILK.lt);
  b.set(cx - 1, top + 2, SILK.hi);
  b.vline(cx + 1, top + 2, top + 4, SILK.dk);
  b.vline(cx + 3, top + 2, top + 4, SILK.dd);
  b.hline(cx - 1, cx + 2, top + 5, SILK.dk);
  b.rect(cx - 1, top + 6, 3, 1, GOLD.dk);
  b.vline(cx, top + 7, top + 8, GOLD.base);
}

// A string of little Hội An silk lanterns with paper hearts between them, for walls and elevators.
THEME_PROPS.set('valentine:lanterns', (b) => {
  const sag = (x: number) => 41 + Math.round(Math.sin(((x - 4) / 32) * Math.PI) * 3);
  for (let x = 4; x <= 36; x++) b.set(x, sag(x), STRING);
  b.rect(3, 40, 2, 2, GOLD.dk);
  b.rect(36, 40, 2, 2, GOLD.dk);
  for (const cx of [8, 20, 32]) {
    b.set(cx, sag(cx) + 1, STRING);
    lantern(b, cx, sag(cx) + 2);
  }
  for (const cx of [14, 26]) {
    b.set(cx, sag(cx) + 1, STRING);
    flatHeart(b, cx, sag(cx) + 2, 5, PINK.base);
    b.set(cx - 2, sag(cx) + 2, PINK.hi);
    b.set(cx + 1, sag(cx) + 3, PINK.dk);
  }
});

// Costume: headband with two red hearts bobbing on little springs, tilted outwards.
THEME_COSTUMES.set('valentine:headband', (b, x, y) => {
  b.hline(x + 1, x + 12, y + 1, RED.dk);
  b.hline(x + 3, x + 10, y + 1, RED.base);
  for (const [cx, sx] of [[x + 1, x + 3], [x + 12, x + 10]] as const) {
    b.set(sx, y, '#c9c0cd');
    flatHeart(b, cx, y - 3, 5, RED.base);
    b.set(cx - 1, y - 3, RED.hi);
    b.set(cx + 1, y - 1, RED.dk);
    b.set(cx, y, RED.dk);
  }
});

// Costume: nón lá (conical leaf hat) with a pink ribbon band, a small heart on the cone and the ribbon's tails.
THEME_COSTUMES.set('valentine:nonla', (b, x, y) => {
  b.rect(x + 6, y - 3, 2, 1, '#f0dca0');
  b.rect(x + 5, y - 2, 4, 1, '#e8cf8f');
  b.rect(x + 4, y - 1, 6, 1, '#e8cf8f');
  b.rect(x + 3, y, 8, 1, '#ddc17d');
  b.hline(x + 1, x + 12, y + 1, PINK.base);
  b.set(x + 1, y + 1, PINK.dk);
  b.rect(x - 1, y + 2, 16, 2, '#ddc17d');
  b.hline(x - 1, x + 14, y + 3, '#b8955a');
  b.set(x + 5, y - 1, '#fff0c0');
  b.set(x + 4, y, '#fff0c0');
  flatHeart(b, x + 7, y - 2, 3, RED.base);
  // ribbon tails trailing from the brim on one side
  b.set(x + 13, y + 4, PINK.base);
  b.set(x + 14, y + 5, PINK.dk);
  b.set(x + 13, y + 6, PINK.base);
});
