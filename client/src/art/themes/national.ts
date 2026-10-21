// National Day theme art (Quốc khánh 2/9, and the 30/4–1/5 holidays): the red flag with the yellow star on a pole,
// pink lotus (hoa sen) in glazed pots, strings of little street flags with red lanterns, and a nón lá or a red
// headband with a little flag. Registered under
// "national:". Colors are the flag's red (#da251d) and yellow (#ffcd00), softened to the office's pixel palette.
import { ramp } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { THEME_COSTUMES, THEME_PROPS } from './registry';

const RED = ramp('#cf3a2e', 0.09);
const YEL = ramp('#f4c63d', 0.08);
const POLE = ramp('#b9b2a6', 0.1);
const PINK = ramp('#e98aa8', 0.08);
const PAD = ramp('#4f9a58', 0.09);
const GLAZE = ramp('#3f78ad', 0.09);
const STRING = '#8a6a3a';

/** Five-pointed star, point up, filled by point-in-polygon (outer radius R, inner radius r). */
function star(b: PixelBuf, cx: number, cy: number, R: number, r: number, c: string): void {
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const ang = -Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 === 0 ? R : r;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  for (let y = Math.floor(cy - R - 1); y <= Math.ceil(cy + R + 1); y++) {
    for (let x = Math.floor(cx - R - 1); x <= Math.ceil(cx + R + 1); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) b.set(x, y, c);
    }
  }
}

/** A waving flag w×h with its hoist at (x, y): columns dip by a soft sine, with light/shade bands and the star. */
function flag(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  const wave = (i: number) => Math.round(Math.sin((i / w) * Math.PI * 1.6) * 1.2 + (i / w) * 1.2);
  for (let i = 0; i < w; i++) {
    const dy = wave(i);
    const phase = Math.sin((i / w) * Math.PI * 1.6);
    const c = phase > 0.55 ? RED.lt : phase < -0.3 ? RED.dk : RED.base;
    b.vline(x + i, y + dy, y + dy + h - 1, c);
    b.set(x + i, y + dy + h - 1, phase < -0.3 ? RED.dd : RED.dk); // lower hem
  }
  const sc = Math.floor(w / 2);
  const sy = y + wave(sc) + (h - 1) / 2;
  const R = Math.max(2.4, h * 0.36);
  star(b, x + sc, sy, R, R * 0.4, YEL.base);
  b.set(x + sc, Math.round(sy - R + 1), YEL.hi);
}

// Tall: flagpole on a little stand with the red flag and its yellow star.
THEME_PROPS.set('national:flagpole', (b) => {
  b.shadow(20, 59, 9, 2, '#252c39', 0.22);
  // stand: a two-step base
  b.rect(12, 55, 11, 4, '#7d5a3e');
  b.hline(12, 22, 55, '#9a7350');
  b.rect(14, 52, 7, 3, '#8f6847');
  b.hline(14, 20, 52, '#a98058');
  // pole with a golden finial
  b.vline(16, 12, 51, POLE.base);
  b.vline(17, 12, 51, POLE.dk);
  b.set(16, 14, POLE.hi);
  b.rect(15, 10, 3, 2, YEL.base);
  b.set(16, 9, YEL.hi);
  b.set(15, 10, YEL.hi);
  flag(b, 18, 13, 19, 13);
  // halyard ties
  b.set(18, 13, '#f3ead8');
  b.set(18, 25, '#f3ead8');
});

/** Pink lotus in bloom (hoa sen), base of the petals at (cx, by): a pointed center petal, two side petals. */
function lotus(b: PixelBuf, cx: number, by: number): void {
  // side petals, opening outward
  for (const s of [-1, 1]) {
    b.rect(cx + s * 3 - (s < 0 ? 1 : 0), by - 4, 2, 4, PINK.base);
    b.set(cx + s * 4, by - 5, PINK.hi);
    b.set(cx + s * 3, by - 1, PINK.dk);
  }
  // center petals
  b.rect(cx - 2, by - 5, 5, 5, PINK.lt);
  b.rect(cx - 1, by - 7, 3, 2, PINK.lt);
  b.set(cx, by - 8, PINK.hi);
  b.vline(cx, by - 6, by - 1, PINK.base);
  b.set(cx - 1, by - 6, PINK.hi);
  // base cup
  b.hline(cx - 3, cx + 3, by, PINK.dk);
  b.hline(cx - 2, cx + 2, by + 1, PINK.dd);
  b.set(cx, by - 3, '#f6d36a'); // a peek of the golden seed pod
}

/** Round lotus leaf seen a little from above, with a lighter top and a center vein dot. */
function pad(b: PixelBuf, cx: number, cy: number, rx: number, ry: number): void {
  b.ellipse(cx, cy, rx, ry, PAD.dk);
  b.ellipse(cx, cy - 1, rx - 1, ry - 1, PAD.base);
  b.hline(cx - rx + 2, cx - 1, cy - ry + 1, PAD.lt);
  b.set(cx, cy, PAD.dd);
}

/** Glazed ceramic pot (blue with a cream band and little wave marks). */
function glazedPot(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  b.rect(x + 1, y + 1, w - 2, h - 1, GLAZE.base);
  b.rect(x, y, w, 2, GLAZE.lt);
  b.hline(x, x + w - 1, y, GLAZE.hi);
  b.vline(x + 2, y + 2, y + h - 2, GLAZE.lt);
  b.vline(x + w - 3, y + 2, y + h - 1, GLAZE.dk);
  b.hline(x + 1, x + w - 2, y + h - 1, GLAZE.dd);
  const band = y + Math.floor(h / 2);
  b.hline(x + 1, x + w - 2, band, '#efe2b8');
  for (let i = x + 3; i < x + w - 3; i += 3) b.set(i, band + 1, '#efe2b8');
}

// Tall: a big glazed pot of pink lotus (hoa sen) with large round leaves.
THEME_PROPS.set('national:lotus', (b) => {
  b.shadow(20, 59, 10, 2, '#252c39', 0.22);
  // stems
  b.line(18, 48, 14, 28, PAD.dd);
  b.line(21, 48, 25, 33, PAD.dd);
  b.vline(20, 24, 48, PAD.dk);
  b.line(19, 48, 11, 38, PAD.dk);
  b.line(22, 48, 29, 42, PAD.dk);
  pad(b, 10, 37, 7, 4);
  pad(b, 29, 41, 7, 4);
  pad(b, 20, 45, 6, 3);
  lotus(b, 14, 28);
  lotus(b, 26, 33);
  // a closed bud on the tallest stem
  b.rect(19, 19, 3, 5, PINK.base);
  b.vline(19, 20, 22, PINK.lt);
  b.set(20, 18, PINK.hi);
  b.hline(19, 21, 23, PINK.dk);
  glazedPot(b, 12, 47, 17, 12);
});

// Small: a little glazed pot with one lotus and a leaf.
THEME_PROPS.set('national:small', (b) => {
  b.shadow(20, 59, 7, 2, '#252c39', 0.2);
  b.line(20, 52, 18, 44, PAD.dd);
  b.line(21, 52, 25, 48, PAD.dk);
  pad(b, 25, 48, 5, 2);
  lotus(b, 18, 44);
  glazedPot(b, 14, 51, 12, 8);
});

// Hanging: a string of little flags like those along the streets on holidays, with a red lantern at each end.
THEME_PROPS.set('national:flags', (b) => {
  const x0 = 4, x1 = 35, top = 46;
  const sagAt = (x: number) => top + Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 3);
  for (let x = x0; x <= x1; x++) b.set(x, sagAt(x), STRING);
  b.rect(x0 - 1, top - 1, 2, 2, '#c9a65a');
  b.rect(x1, top - 1, 2, 2, '#c9a65a');
  // flags: 7×5 red, a little yellow star in the middle
  for (const fx of [8, 16, 24]) {
    const y = sagAt(fx + 3) + 1;
    b.rect(fx, y, 7, 5, RED.base);
    b.hline(fx, fx + 6, y, RED.lt);
    b.vline(fx + 6, y, y + 4, RED.dk);
    b.hline(fx, fx + 6, y + 4, RED.dk);
    b.set(fx + 3, y + 1, YEL.hi);
    b.hline(fx + 1, fx + 5, y + 2, YEL.base);
    b.hline(fx + 2, fx + 4, y + 3, YEL.base);
    b.set(fx + 2, y + 4, YEL.base);
    b.set(fx + 4, y + 4, YEL.base);
  }
  // lanterns hanging from the hooks
  for (const lx of [x0, x1]) {
    const y = top + 1;
    b.vline(lx, y, y + 1, STRING);
    b.hline(lx - 1, lx + 1, y + 2, YEL.base);
    b.rect(lx - 2, y + 3, 5, 5, RED.base);
    b.vline(lx - 1, y + 4, y + 6, RED.lt);
    b.vline(lx + 2, y + 3, y + 7, RED.dk);
    b.hline(lx - 1, lx + 1, y + 8, YEL.base);
    b.vline(lx, y + 9, y + 10, YEL.lt);
  }
});

// Costume: red headband with a yellow star at the front and a little paper flag pinned on the side.
THEME_COSTUMES.set('national:headband', (b, x, y) => {
  b.rect(x + 1, y + 2, 12, 2, RED.base);
  b.hline(x + 1, x + 12, y + 2, RED.lt);
  b.hline(x + 1, x + 12, y + 3, RED.dk);
  // star
  b.set(x + 6, y + 1, YEL.hi);
  b.rect(x + 5, y + 2, 3, 2, YEL.base);
  b.set(x + 4, y + 2, YEL.base);
  b.set(x + 8, y + 2, YEL.base);
  // paper flag on a pin
  b.vline(x + 12, y - 3, y + 1, '#a98058');
  b.rect(x + 13, y - 3, 4, 3, RED.base);
  b.set(x + 14, y - 2, YEL.base);
});

// Costume: nón lá (conical straw hat) with a little red-and-yellow flag tucked in the brim.
THEME_COSTUMES.set('national:nonla', (b, x, y) => {
  b.rect(x + 6, y - 3, 2, 1, '#f0dca0');
  b.rect(x + 5, y - 2, 4, 1, '#e8cf8f');
  b.rect(x + 4, y - 1, 6, 1, '#e8cf8f');
  b.rect(x + 3, y, 8, 1, '#ddc17d');
  b.rect(x + 1, y + 1, 12, 1, '#e8cf8f');
  b.rect(x - 1, y + 2, 16, 2, '#ddc17d');
  b.hline(x - 1, x + 14, y + 3, '#b8955a');
  b.set(x + 5, y - 1, '#fff0c0');
  b.set(x + 4, y, '#fff0c0');
  b.hline(x + 2, x + 11, y + 1, RED.base); // red ribbon around the crown
  // the flag on its stick, leaning out of the ribbon
  b.vline(x + 12, y - 2, y + 1, '#8a6a3a');
  b.rect(x + 13, y - 3, 4, 3, RED.base);
  b.hline(x + 13, x + 16, y - 1, RED.dk);
  b.set(x + 14, y - 2, YEL.base);
});

