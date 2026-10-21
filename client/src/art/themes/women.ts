// Women's Day theme art (Vietnamese Women's Day, 8/3 and 20/10), with a Vietnamese feel: a flower seller's quang
// gánh (bamboo pole and two baskets of flowers), a blue-and-white Bát Tràng vase of lotus (sen), a pot of white cúc
// họa mi, a framed Đông Hồ folk painting of a hen, and two head pieces (a nón lá with a pink ribbon and a velvet khăn
// vấn with a small flower). Everything registered under "women:".
import { ramp } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { THEME_COSTUMES, THEME_PROPS } from './registry';

const PINK = ramp('#e47a9c', 0.1);
const LOTUS = ramp('#ec8fae', 0.1);
const LILAC = ramp('#ad8fd0', 0.1);
const CREAM = ramp('#f3e6cc', 0.06);
const GREEN = ramp('#5e9b56', 0.1);
const LEAF = ramp('#4f8a52', 0.1);
const BAMBOO = ramp('#c9a45c', 0.1);
const WEAVE = ramp('#a77945', 0.1);
const WOOD = ramp('#7a4a2e', 0.1);
const PORCELAIN = ramp('#eef0ec', 0.05);
const COBALT = ramp('#3a5f9e', 0.1);
const STRAW = ramp('#e3c98a', 0.08);
const VELVET = ramp('#7d2236', 0.1);
const GOLD = '#f2c96a';
const WHITE = '#fbf7ee';

type Ramp = ReturnType<typeof ramp>;

/** An open lotus seen from the side: 9×5, a pointed middle petal with two pairs opening outwards. */
function lotus(b: PixelBuf, x: number, y: number): void {
  b.stamp(['....h....', '..l.h.b..', '.llhhhbd.', 'lllhbbbdd', '.lbbbbbd.'], x - 4, y - 2, { h: LOTUS.hi, l: LOTUS.lt, b: LOTUS.base, d: LOTUS.dk });
  b.set(x, y + 1, GOLD);
}

/** A closed lotus bud: a 3×5 teardrop. */
function lotusBud(b: PixelBuf, x: number, y: number): void {
  b.stamp(['.h.', 'hbd', 'lbd', 'bdd', '.d.'], x - 1, y - 2, { h: LOTUS.hi, l: LOTUS.lt, b: LOTUS.base, d: LOTUS.dk });
}

/** A big round lotus leaf, tilted, with a lighter rim and a vein. */
function lotusLeaf(b: PixelBuf, x: number, y: number, rx: number): void {
  b.ellipse(x, y, rx, rx * 0.65, LEAF.dk);
  b.ellipse(x - 0.5, y - 0.5, rx - 1, rx * 0.65 - 1, LEAF.base);
  b.ellipse(x - 1.5, y - 1, rx - 2.5, rx * 0.65 - 2, LEAF.lt);
  for (const [dx, dy] of [[-2, -1], [2, -1], [-2, 1], [2, 1], [0, -2], [0, 2]] as const) b.line(x, y, x + dx, y + dy, LEAF.dd);
  b.set(x, y, LEAF.hi);
}

/** A small white daisy (cúc họa mi): a plus of petals around a yellow heart. */
function daisy(b: PixelBuf, x: number, y: number): void {
  b.stamp(['.w.', 'wyw', '.c.'], x - 1, y - 1, { w: WHITE, y: GOLD, c: CREAM.dk });
}

/** A woven basket heaped with flowers, centered at x with its base on y = 58. */
function flowerBasket(b: PixelBuf, x: number, flowers: readonly (readonly [number, number, Ramp])[]): void {
  b.ellipse(x, 47, 6.5, 4, GREEN.base);
  b.ellipse(x - 1, 46, 4.5, 2.5, GREEN.lt);
  for (const [dx, dy, r] of flowers) b.stamp(['.b.', 'bhb', '.d.'], x + dx - 1, 46 + dy - 1, { b: r.base, h: r.hi, d: r.dk });
  b.rect(x - 6, 50, 13, 8, WEAVE.base);
  b.rect(x - 5, 58, 11, 1, WEAVE.dd);
  b.hline(x - 6, x + 6, 50, WEAVE.lt);
  for (let yy = 52; yy < 58; yy += 2) {
    for (let xx = x - 6 + (yy % 4 === 0 ? 1 : 0); xx <= x + 6; xx += 2) b.set(xx, yy, WEAVE.dk);
  }
  b.rect(x + 4, 51, 2, 7, WEAVE.dk);
  b.vline(x - 5, 51, 57, WEAVE.lt);
  // round the belly of the basket
  for (const [dx, dy] of [[-6, 56], [-6, 57], [-5, 57], [6, 56], [6, 57], [5, 57], [-5, 58], [5, 58]] as const) b.clear(x + dx, dy);
  b.hline(x - 7, x + 7, 51, WEAVE.lt);
  b.hline(x - 7, x + 7, 52, WEAVE.dk);
}

// Tall: a flower seller's quang gánh — a bamboo pole on ropes over two round woven baskets full of flowers.
THEME_PROPS.set('women:ganh', (b) => {
  b.shadow(10, 59, 7, 1.5, '#252c39', 0.22);
  b.shadow(30, 59, 7, 1.5, '#252c39', 0.22);
  // the bamboo pole (đòn gánh), bowing a little, with nodes
  for (let x = 2; x <= 37; x++) {
    const y = 35 + Math.round(Math.sin(((x - 2) / 35) * Math.PI) * 1);
    b.set(x, y, BAMBOO.lt);
    b.set(x, y + 1, BAMBOO.dk);
  }
  for (const x of [8, 16, 24, 32]) b.vline(x, 35, 37, BAMBOO.dd);
  flowerBasket(b, 10, [[-3, -1, LOTUS], [1, -2, PINK], [3, 0, LILAC], [-1, 1, LOTUS]]);
  for (const [dx, dy] of [[-4, 1], [0, -3], [4, -1]] as const) daisy(b, 10 + dx, 46 + dy);
  flowerBasket(b, 30, [[-2, -2, PINK], [2, -1, LOTUS], [-4, 1, LILAC], [3, 1, PINK]]);
  for (const [dx, dy] of [[0, 0], [-3, -3], [5, -2]] as const) daisy(b, 30 + dx, 46 + dy);
  // ropes (quang) from the basket rims up to the pole, in front of the flowers
  for (const cx of [10, 30]) {
    b.line(cx - 5, 49, cx, 37, '#5a4630');
    b.line(cx + 5, 49, cx, 37, '#4a3a28');
  }
});

// Tall: a blue-and-white Bát Tràng ceramic vase with pink lotus flowers and big lotus leaves.
THEME_PROPS.set('women:battrang', (b) => {
  b.shadow(20, 59, 9, 2, '#252c39', 0.22);
  // stems
  for (const [x, y] of [[13, 31], [20, 27], [27, 30], [10, 36], [30, 35], [25, 36]] as const) b.line(20, 41, x, y, GREEN.dk);
  lotusLeaf(b, 10, 36, 6);
  lotusLeaf(b, 30, 35, 6);
  lotusBud(b, 13, 30);
  lotusBud(b, 27, 29);
  lotus(b, 20, 27);
  lotus(b, 24, 35);
  // vase: flared lip, slim neck, round belly, foot
  b.rect(16, 39, 9, 2, PORCELAIN.base);
  b.hline(16, 24, 39, COBALT.base);
  b.rect(18, 41, 5, 3, PORCELAIN.base);
  b.ellipse(20.5, 50, 7, 7, PORCELAIN.base);
  b.rect(16, 56, 9, 3, PORCELAIN.dk);
  b.hline(16, 24, 57, COBALT.dk);
  // shading
  b.vline(15, 46, 53, PORCELAIN.hi);
  b.vline(16, 45, 54, PORCELAIN.lt);
  b.vline(25, 46, 54, PORCELAIN.dd);
  b.vline(26, 47, 53, PORCELAIN.dd);
  // cobalt painting: bands and a lotus scroll on the belly
  b.hline(18, 22, 43, COBALT.base);
  b.hline(15, 26, 45, COBALT.dk);
  b.hline(15, 26, 54, COBALT.dk);
  b.stamp(['..c..', '.ccc.', 'cc.cc', '..c..'], 18, 48, { c: COBALT.base });
  for (const [x, y] of [[16, 49], [24, 49], [17, 52], [23, 52], [20, 52]] as const) b.set(x, y, COBALT.lt);
  b.line(15, 51, 17, 50, COBALT.lt);
  b.line(25, 51, 23, 50, COBALT.lt);
});

// Small: a glazed pot of white cúc họa mi daisies.
THEME_PROPS.set('women:hoami', (b) => {
  b.shadow(20, 59, 7, 2, '#252c39', 0.2);
  b.ellipse(20, 48, 7, 4.5, GREEN.dk);
  b.ellipse(19, 47, 5, 3, GREEN.base);
  for (const [x, y] of [[14, 49], [26, 48], [20, 44], [16, 45], [24, 45]] as const) b.set(x, y, GREEN.lt);
  for (const [x, y] of [[15, 47], [19, 45], [23, 44], [26, 47], [17, 50], [22, 49], [20, 48], [13, 50], [27, 50]] as const) daisy(b, x, y);
  // pot
  b.rect(14, 52, 13, 2, COBALT.lt);
  b.rect(15, 54, 11, 5, COBALT.base);
  b.rect(15, 54, 2, 5, COBALT.lt);
  b.rect(23, 54, 3, 5, COBALT.dk);
  b.hline(16, 24, 58, COBALT.dd);
  b.hline(15, 25, 56, PORCELAIN.dk);
  for (const x of [16, 19, 22, 25]) b.set(x, 55, PORCELAIN.dk);
});

// Hanging: a framed Đông Hồ folk painting of a hen on speckled điệp paper.
THEME_PROPS.set('women:dongho', (b) => {
  b.line(20, 31, 14, 35, '#8a6a3a');
  b.line(20, 31, 26, 35, '#8a6a3a');
  b.set(20, 30, GOLD);
  // frame and paper
  b.rect(12, 35, 17, 17, WOOD.base);
  b.hline(12, 28, 35, WOOD.lt);
  b.vline(28, 36, 51, WOOD.dk);
  b.hline(12, 28, 51, WOOD.dd);
  b.rect(14, 37, 13, 13, '#f1e2c2');
  for (const [x, y] of [[15, 38], [19, 37], [25, 39], [15, 46], [24, 48], [18, 48]] as const) b.set(x, y, '#fbf2dc');
  // the hen: ochre body, green and red tail, red comb, black ink lines
  b.ellipse(20, 44, 4, 2.6, '#e0a33a');
  b.rect(16, 41, 3, 3, '#e0a33a');
  b.set(16, 40, '#c8362f');
  b.set(17, 40, '#c8362f');
  b.set(15, 42, '#f2c94c');
  b.set(17, 41, '#2a1f26');
  b.line(23, 43, 25, 39, '#4f8a52');
  b.line(24, 44, 26, 41, '#c8362f');
  b.line(17, 46, 22, 46, '#3a2a22');
  b.line(19, 43, 22, 43, '#b8722a');
  b.vline(19, 47, 48, '#c8362f');
  b.vline(21, 47, 48, '#c8362f');
  // a red seal and a line of calligraphy
  b.rect(25, 46, 1, 2, '#c8362f');
  b.vline(15, 44, 47, '#3a2a22');
});

// Costume: a nón lá with a pink ribbon (quai) tied in a bow at the side.
THEME_COSTUMES.set('women:nonla', (b, x, y) => {
  b.rect(x + 6, y - 3, 2, 1, STRAW.hi);
  b.rect(x + 5, y - 2, 4, 1, STRAW.lt);
  b.rect(x + 4, y - 1, 6, 1, STRAW.lt);
  b.rect(x + 3, y, 8, 1, STRAW.base);
  b.rect(x + 1, y + 1, 12, 1, STRAW.lt);
  b.rect(x - 1, y + 2, 16, 2, STRAW.base);
  b.hline(x - 1, x + 14, y + 3, STRAW.dk);
  b.set(x + 5, y - 1, '#fff0c0');
  b.set(x + 4, y, '#fff0c0');
  b.hline(x + 1, x + 12, y + 1, PINK.base);
  b.rect(x + 12, y + 1, 2, 2, PINK.lt);
  b.set(x + 14, y + 1, PINK.dk);
  b.vline(x + 13, y + 3, y + 5, PINK.base);
});

// Costume: a velvet khăn vấn wrapped around the head like a halo, with a small white flower.
THEME_COSTUMES.set('women:khanvan', (b, x, y) => {
  b.rect(x + 1, y - 1, 12, 1, VELVET.lt);
  b.rect(x, y, 14, 3, VELVET.base);
  b.hline(x, x + 13, y + 2, VELVET.dk);
  for (let i = 1; i < 14; i += 3) {
    b.set(x + i, y, VELVET.hi);
    b.set(x + i + 1, y + 1, VELVET.dd);
  }
  b.stamp(['.w.', 'wyw', '.w.'], x + 9, y - 2, { w: WHITE, y: GOLD });
  b.set(x + 8, y, LEAF.base);
});
