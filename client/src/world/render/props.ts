// Procedural sprites for the outdoor area (trees, bushes, lamp posts, cars...) and visual
// utilities of the world (shadow, glows). Same art direction as the art module: dark
// bluish-gray outline, 3–4 tones per material, light coming from top/left.
import { mulberry32 } from '../../../../shared/hash';
import type { ExteriorProp } from '../layout/types';
import { treeLook, type TreeLook } from '../seasons';
import { BANHTRANG_STAND } from '../../art/handdrawn/banhtrang-stand';
import { BUSH } from '../../art/handdrawn/bush';
import { PINE } from '../../art/handdrawn/pine';
import { REPAIR_BASIN } from '../../art/handdrawn/repair-basin';
import { REPAIR_COMPRESSOR } from '../../art/handdrawn/repair-compressor';
import { REPAIR_RACK } from '../../art/handdrawn/repair-rack';
import { REPAIR_SIGN } from '../../art/handdrawn/repair-sign';
import { REPAIR_STOOL } from '../../art/handdrawn/repair-stool';
import { TRASH_CART } from '../../art/handdrawn/trash-cart';
import { TREE } from '../../art/handdrawn/tree';
import { CARGO_FLOWERS } from '../../art/handdrawn/cargo-flowers';
import { CARGO_FOAM } from '../../art/handdrawn/cargo-foam';
import { CARGO_PEACH } from '../../art/handdrawn/cargo-peach';
import { CARGO_PLANT } from '../../art/handdrawn/cargo-plant';
import { CARGO_WATER } from '../../art/handdrawn/cargo-water';
import { CROSSING_SIGN } from '../../art/handdrawn/crossing-sign';
import { DANCE_SPEAKER } from '../../art/handdrawn/dance-speaker';
import { TEA_STACK } from '../../art/handdrawn/tea-stack';
import { TEA_STOOL } from '../../art/handdrawn/tea-stool';
import { BENCH } from '../../art/handdrawn/bench';
import { HEDGE } from '../../art/handdrawn/hedge';
import { PARASOL } from '../../art/handdrawn/parasol';
import { ROCK } from '../../art/handdrawn/rock';
import { TOTEM } from '../../art/handdrawn/totem';
import { LAMP } from '../../art/handdrawn/lamp';
import { FLOWERBED } from '../../art/handdrawn/flowerbed';
import { TEA_COOLER } from '../../art/handdrawn/tea-cooler';
import { BIKE } from '../../art/handdrawn/bike';
import { BANHMI_CART } from '../../art/handdrawn/banhmi-cart';
import { CAR } from '../../art/handdrawn/car';
import { HUTIEU_CART } from '../../art/handdrawn/hutieu-cart';
import { TEA_TABLE } from '../../art/handdrawn/tea-table';
import { SCOOTER_BACK } from '../../art/handdrawn/scooter-back';
import { SCOOTER_FRONT } from '../../art/handdrawn/scooter-front';
import { BIKE_LOAD_BUN } from '../../art/handdrawn/bike-load-bun';
import { BIKE_LOAD_SCRAP } from '../../art/handdrawn/bike-load-scrap';
import { gridSize, paintGrid, rotatePairs } from '../../art/handdrawn/grid';
import { FLOWER_KINDS, flowerInfo, type FlowerInfo } from '../sim/flowers';
import { banhtrangStandSprite } from './banhtrang-fx';
import { busShelterSprite, busSignSprite } from './bus';

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

/** Canopy tones (dark to light) and outline by the season's look; blossoms are sprinkled on top of a green canopy. */
const SEASON_TONES: Readonly<Record<'spring' | 'autumn', { tones: string[]; outline: string }>> = {
  spring: { tones: ['#4f8a45', '#6aab52', '#8fcc6a', '#c2e88f'], outline: '#2f5a32' },
  autumn: { tones: ['#9a5a1e', '#c47f28', '#e2a83a', '#f5d264'], outline: '#5a3a1a' },
};
const BLOSSOM: Readonly<Record<'phuong' | 'banglang', [string, string]>> = {
  phuong: ['#c7301f', '#ff5a3a'],
  banglang: ['#8a5cc4', '#c49af0'],
};

/** Tones (dark to light) and outline of the hand-drawn oak as it is drawn in tree.png; the looks swap them. */
const TREE_DRAWN = { tones: ['#2f6a43', '#3f8550', '#5aa45d', '#86c873'], outline: '#25463a' };
const TREE_GREENS = [
  ['#2f6a43', '#3f8550', '#5aa45d', '#86c873'],
  ['#356b3c', '#4b8a45', '#6aa956', '#9fcf74'],
  ['#2c6250', '#3a7e5f', '#53a071', '#82c489'],
];

/** Oak: hand-drawn (scripts/assets/handdrawn/tree.png); the seed picks the green and the mirroring, the look the season. */
function treeSprite(seed: number, look: TreeLook = 'green'): PropSprite {
  const { w, h } = gridSize(TREE);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 18, 45, 12, 3, 0.25);
  const season = look === 'spring' || look === 'autumn' ? SEASON_TONES[look] : null;
  const tones = season ? season.tones : TREE_GREENS[seed % TREE_GREENS.length];
  const recolor: Record<string, string> = { [TREE_DRAWN.outline]: season ? season.outline : '#25463a' };
  TREE_DRAWN.tones.forEach((t, i) => {
    recolor[t] = tones[i];
  });
  paintGrid(ctx, TREE, 0, 0, { flip: seed % 2 === 1, recolor });
  if (look === 'phuong' || look === 'banglang') {
    // blossom clusters over the leaves (their own draws: the canopy's shape doesn't change), lighter on top
    const p = new Painter(ctx, w, h);
    const [dk, lt] = BLOSSOM[look];
    const br = mulberry32(seed ^ 0xb105);
    for (let y = 3; y < 32; y++) {
      for (let x = 2; x < 34; x++) {
        if (p.alpha(x, y) === 0 || br() > 0.16) continue;
        if (p.alpha(x - 1, y) === 0 || p.alpha(x + 1, y) === 0) continue;
        p.set(x, y, y < 16 ? lt : dk);
        if (br() < 0.5 && p.alpha(x + 1, y) > 0) p.set(x + 1, y, dk);
      }
    }
    p.flush();
  }
  return { canvas: c, ax: 18, ay: 45 };
}

/** Pine: hand-drawn (scripts/assets/handdrawn/pine.png); the seed only decides the mirroring. */
function pineSprite(seed: number): PropSprite {
  const { w, h } = gridSize(PINE);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 14, 45, 9, 3, 0.25);
  paintGrid(ctx, PINE, 0, 0, { flip: seed % 2 === 1 });
  return { canvas: c, ax: 14, ay: 45 };
}

/** Bush: hand-drawn (scripts/assets/handdrawn/bush.png), mirrored by the seed, with a few little flowers sprinkled on top. */
function bushSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const { w, h } = gridSize(BUSH);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 11, 14, 9, 2, 0.22);
  paintGrid(ctx, BUSH, 0, 0, { flip: seed % 2 === 1 });
  if (rng() < 0.6) {
    const p = new Painter(ctx, w, h);
    const col = ['#f2d14b', '#f28aa5', '#ffffff'][Math.floor(rng() * 3)];
    for (let i = 0; i < 4; i++) p.set(6 + Math.floor(rng() * 10), 5 + Math.floor(rng() * 6), col);
    p.flush();
  }
  return { canvas: c, ax: 11, ay: 14 };
}

/** Petal / shade pairs of the flower bed drawing, in the order the PNG uses them (red, yellow, pink, white, purple). */
const BED_PETALS: readonly (readonly [string, string])[] = [
  ['#e8574a', '#b83c33'], ['#f2c94c', '#c9a02e'], ['#f08bb0', '#c46a8d'], ['#ffffff', '#d9dde4'], ['#9b7be0', '#7a5bc0'],
];

/** Flower bed: hand-drawn (scripts/assets/handdrawn/flowerbed.png); the seed turns the colours around and mirrors it. */
function flowersSprite(seed: number): PropSprite {
  const { w, h } = gridSize(FLOWERBED);
  const [c, ctx] = makeCanvas(w, h);
  paintGrid(ctx, FLOWERBED, 0, 0, { flip: seed % 2 === 1, recolor: rotatePairs(BED_PETALS, seed % BED_PETALS.length) });
  return { canvas: c, ax: 15, ay: 13 };
}

/** Hedge: hand-drawn (scripts/assets/handdrawn/hedge.png), mirrored by the seed. */
function hedgeSprite(seed: number): PropSprite {
  const { w, h } = gridSize(HEDGE);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 17, 14, 15, 2, 0.2);
  paintGrid(ctx, HEDGE, 0, 0, { flip: seed % 2 === 1 });
  return { canvas: c, ax: 17, ay: 14 };
}

/** Street lamp: hand-drawn (scripts/assets/handdrawn/lamp.png), lit lantern, two collars, flared base. */
function lampSprite(): PropSprite {
  const { w, h } = gridSize(LAMP);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 5, 34, 4, 1, 0.25);
  paintGrid(ctx, LAMP);
  return { canvas: c, ax: 5, ay: 34 };
}

/** Park bench: the first hand-drawn sprite (scripts/assets/handdrawn/bench.png, drawn in Pixelorama). */
function benchSprite(): PropSprite {
  const { w, h } = gridSize(BENCH);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 13, 12, 11, 2, 0.22);
  paintGrid(ctx, BENCH);
  return { canvas: c, ax: 13, ay: 12 };
}

/** Rock: hand-drawn (scripts/assets/handdrawn/rock.png), mirrored by the seed. */
function rockSprite(seed: number): PropSprite {
  const { w, h } = gridSize(ROCK);
  const [c, ctx] = makeCanvas(w, h);
  paintGrid(ctx, ROCK, 0, 0, { flip: seed % 2 === 1 });
  return { canvas: c, ax: 8, ay: 11 };
}

/** Garden table with a striped umbrella (top view, 3/4) and two little chairs. */
/** Canopy tones of the garden umbrella as drawn in parasol.png (red); the seed swaps them for teal or amber. */
const PARASOL_DRAWN: readonly [string, string, string] = ['#e8574a', '#f6efe2', '#a83a33'];
const PARASOL_COLORS: readonly (readonly [string, string, string])[] = [
  PARASOL_DRAWN,
  ['#2fb3a3', '#f6efe2', '#1f8579'],
  ['#f2b33d', '#fbf4e4', '#c88a1f'],
];

function parasolSprite(seed: number): PropSprite {
  const { w, h } = gridSize(PARASOL);
  const [c, ctx] = makeCanvas(w, h);
  const [a, b, dk] = PARASOL_COLORS[seed % PARASOL_COLORS.length];
  // umbrella shadow on the ground
  shadowEllipse(ctx, 16, 29, 12, 3, 0.24);
  paintGrid(ctx, PARASOL, 0, 0, { recolor: { [PARASOL_DRAWN[0]]: a, [PARASOL_DRAWN[1]]: b, [PARASOL_DRAWN[2]]: dk } });
  return { canvas: c, ax: 16, ay: 29 };
}

/** Entrance totem with the brand (navy blue and orange, like the reception sign). */
function totemSprite(): PropSprite {
  const { w, h } = gridSize(TOTEM);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 7, 32, 6, 1.5, 0.25);
  paintGrid(ctx, TOTEM);
  return { canvas: c, ax: 7, ay: 32 };
}

/** Plastic stool colors (base, dark, light): the classic red and blue of the sidewalk. */
const STOOL_COLORS: [string, string, string][] = [
  ['#d8383e', '#9e2328', '#f06a6a'],
  ['#2f7fd8', '#1f5aa6', '#6aa8f0'],
];

/** Low plastic stool (3/4 view): hand-drawn red (scripts/assets/handdrawn/tea-stool.png); the other colour swaps the tones. */
function teaStoolSprite(color: number): PropSprite {
  const { w, h } = gridSize(TEA_STOOL);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 6, 8, 5, 1, 0.22);
  const tones = STOOL_COLORS[color % STOOL_COLORS.length];
  paintGrid(ctx, TEA_STOOL, 0, 0, { recolor: { [STOOL_COLORS[0][0]]: tones[0], [STOOL_COLORS[0][1]]: tones[1], [STOOL_COLORS[0][2]]: tones[2] } });
  return { canvas: c, ax: 6, ay: 9 };
}

/** Low wooden table with the big tea jug (yellow, red lid, little tap), glasses and a plate of peanut candy. */
function teaTableSprite(): PropSprite {
  const { w, h } = gridSize(TEA_TABLE);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 17, 20, 15, 2, 0.24);
  paintGrid(ctx, TEA_TABLE);
  return { canvas: c, ax: 17, ay: 20 };
}

/** Ice cooler (blue box, white lid) with a cardboard sign showing a glass of iced tea. */
/** Iced-tea cooler with the cardboard sign on its lid: hand-drawn (scripts/assets/handdrawn/tea-cooler.png). */
function teaCoolerSprite(): PropSprite {
  const { w, h } = gridSize(TEA_COOLER);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 9, 20, 8, 1.5, 0.24);
  paintGrid(ctx, TEA_COOLER);
  return { canvas: c, ax: 9, ay: 20 };
}

/** Closed: the stools stacked (red and blue) with the folded table leaning beside them. */
function teaStackSprite(): PropSprite {
  const { w, h } = gridSize(TEA_STACK);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 12, 28, 11, 2, 0.24);
  paintGrid(ctx, TEA_STACK);
  return { canvas: c, ax: 12, ay: 28 };
}

/** The repair stall's things (tire rack, the tire sign, the compressor, the stool, the water basin): hand-drawn (repair-*.png). */
function repairSprite(kind: 'repair_rack' | 'repair_sign' | 'repair_compressor' | 'repair_stool' | 'repair_basin'): PropSprite {
  const spec = {
    repair_rack: { grid: REPAIR_RACK, shadow: [15, 28, 13, 2, 0.22], ax: 15, ay: 28 },
    repair_sign: { grid: REPAIR_SIGN, shadow: [9, 16, 7, 1, 0.22], ax: 9, ay: 16 },
    repair_compressor: { grid: REPAIR_COMPRESSOR, shadow: [10, 14, 9, 2, 0.24], ax: 10, ay: 14 },
    repair_stool: { grid: REPAIR_STOOL, shadow: [6, 7, 5, 1, 0.2], ax: 6, ay: 7 },
    repair_basin: { grid: REPAIR_BASIN, shadow: [9, 7, 8, 1, 0.2], ax: 9, ay: 7 },
  }[kind];
  const { w, h } = gridSize(spec.grid);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, spec.shadow[0], spec.shadow[1], spec.shadow[2], spec.shadow[3], spec.shadow[4]);
  paintGrid(ctx, spec.grid);
  return { canvas: c, ax: spec.ax, ay: spec.ay };
}

/**
 * The evening garbage cart (xe đẩy rác): a flared sheet-metal bin painted green, riveted bands and a rolled rim, heaped
 * with trash bags; a bamboo broom strapped to its side, the long push handle at its west end with the brass bell, two
 * big spoked wheels.
 */
function trashCartSprite(): PropSprite {
  const { w, h } = gridSize(TRASH_CART);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 24, 33, 18, 2, 0.28);
  paintGrid(ctx, TRASH_CART);
  return { canvas: c, ax: 24, ay: 34 };
}

/**
 * The street sellers' old bicycle, side view facing east, the little loudspeaker strapped to the handlebar. 'scrap'
 * (xe đạp ve chai): dark green step-through frame, a bale of flattened cardboard and a big woven sack roped onto the rear
 * rack, a mesh bag of bottles hanging off the handlebar. 'bun' (bánh bao): navy frame, the foam steamer box on the rack.
 */
function streetBikeSprite(load: 'scrap' | 'bun' | 'flowers' = 'scrap', fl?: FlowerInfo): PropSprite {
  const o = '#22303a';
  const [c, ctx] = makeCanvas(46, 36);
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // the bicycle itself is hand-drawn (scripts/assets/handdrawn/bike.png) in the green "scrap" colours; the other bikes
  // swap the three frame tones, then the load and the loudspeaker are painted on top
  const frame = load === 'bun' ? ['#2d4f8a', '#5f86c8', '#1f3866'] : load === 'flowers' ? ['#4a7fb5', '#8fb8e0', '#33587f'] : ['#2f6a4e', '#5fae84', '#1f4a36'];
  shadowEllipse(ctx, 23, 33, 19, 2, 0.28);
  paintGrid(ctx, BIKE, 0, 0, { recolor: { '#2f6a4e': frame[0], '#5fae84': frame[1], '#1f4a36': frame[2] } });
  if (load === 'flowers' && fl) {
    // the flowers of the month heaped on the rear rack (a wide bamboo basket) and in the front basket, no loudspeaker
    const heap = (x0: number, y0: number, w: number, h: number) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const edge = (x + y * 2) % 5 === 0;
          const lit = y < h / 2 && (x + y) % 3 !== 0;
          px(edge ? fl.center : lit ? fl.petalLit : fl.petal, x0 + x, y0 + y);
        }
      // a few green leaves poking out of the heap
      for (let x = x0 + 1; x < x0 + w; x += 4) px('#4f9a45', x, y0 + h - 1, 1, 2);
    };
    px(o, 0, 12, 19, 6);
    px('#c8955a', 1, 13, 17, 4);
    px('#a4733c', 1, 15, 17, 1);
    for (let x = 2; x < 18; x += 3) px('#e0b47c', x, 13, 1, 4);
    heap(1, 3, 17, 10);
    // front basket on the handlebar
    px(o, 34, 10, 9, 7);
    px('#c8955a', 35, 11, 7, 5);
    px('#a4733c', 35, 13, 7, 1);
    heap(34, 5, 9, 6);
    return { canvas: c, ax: 23, ay: 34 };
  }
  // the load on the rear rack, hand-drawn like the bike: the bun steamer, or the sack on a bale of cardboard
  paintGrid(ctx, load === 'bun' ? BIKE_LOAD_BUN : BIKE_LOAD_SCRAP);
  // the loudspeaker strapped to the handlebar: white horn, mouth forward, a black driver at the back
  px(o, 33, 5, 2, 4);
  px('#2a2e38', 33, 6, 2, 2);
  px(o, 35, 4, 1, 6);
  px(o, 36, 3, 4, 8);
  px('#f2f4f7', 35, 5, 1, 4);
  px('#f2f4f7', 36, 4, 3, 6);
  px('#c9d0db', 36, 8, 3, 1);
  px('#8a95a3', 39, 5, 1, 4);
  px('#d9342b', 32, 9, 2, 1);
  if (load === 'bun') return { canvas: c, ax: 23, ay: 34 };
  // a mesh bag of empty bottles hanging off the front of the handlebar
  px(o, 37, 11, 1, 2);
  px(o, 35, 13, 7, 8);
  px('#bfe4f0', 36, 14, 5, 6);
  px('#7fb0f0', 36, 14, 1, 5);
  px('#4c9a5a', 38, 14, 1, 4);
  px('#ffffff', 39, 15, 1, 1);
  px('#d9342b', 40, 14, 1, 2);
  for (let y = 15; y < 20; y += 2) px('#e8f4f8', 36, y, 5, 1);
  return { canvas: c, ax: 23, ay: 34 };
}

/**
 * Bánh mì cart: blue tin cabinet with the red "BÁNH MÌ" sign, glass case with the baguettes and a pot of xôi, striped
 * awning on two posts, two wheels and the push handle on the west end. Hand-drawn (scripts/assets/handdrawn/banhmi-cart.png).
 */
function banhmiCartSprite(): PropSprite {
  const { w, h } = gridSize(BANHMI_CART);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 21, 33, 18, 2, 0.24);
  paintGrid(ctx, BANHMI_CART);
  return { canvas: c, ax: 21, ay: 34 };
}

/**
 * Trolley loudspeaker (loa kéo) of the evening dance: a tall black box on two little wheels, the telescopic handle up,
 * a big woofer and a tweeter, and the LED ring around the woofer in rainbow colors.
 */
function danceSpeakerSprite(): PropSprite {
  const { w, h } = gridSize(DANCE_SPEAKER);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 9, 28, 7, 1.5, 0.28);
  paintGrid(ctx, DANCE_SPEAKER);
  return { canvas: c, ax: 9, ay: 28 };
}

/**
 * Pedestrian crossing sign (Vietnam's 423b): a blue square plate with a white triangle, inside it a black figure walking
 * over the zebra stripes; on a gray pole with a white/black band at the foot.
 */
function crossingSignSprite(): PropSprite {
  const { w, h } = gridSize(CROSSING_SIGN);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 9, 36, 4, 1, 0.25);
  paintGrid(ctx, CROSSING_SIGN);
  return { canvas: c, ax: 9, ay: 36 };
}

/**
 * The night hủ tiếu cart (xe hủ tiếu gõ, Sài Gòn style), side view facing east: a turquoise-painted wooden cabinet on two
 * bicycle wheels and a kickstand, the tall glass case on top (aluminum frame, "HỦ TIẾU" in red on the glass; noodles,
 * bean sprouts, herbs, char siu, shrimp and lime on the shelves), the big aluminum broth pot over a glowing charcoal
 * stove at the east end, steam rising, a bulb hanging from a little post and the push handle at the west end.
 */
/** Hủ tiếu cart: turquoise cabinet, glass case with the noodles and toppings, broth pot with steam, bulb. Hand-drawn (hutieu-cart.png). */
function hutieuCartSprite(): PropSprite {
  const { w, h } = gridSize(HUTIEU_CART);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 28, 45, 24, 2, 0.3);
  paintGrid(ctx, HUTIEU_CART);
  return { canvas: c, ax: 28, ay: 45 };
}

/** `month` (1–12; 0 = no season) dresses the trees for the time of year (world/seasons.ts). */
export function propSprite(prop: ExteriorProp, month = 0): PropSprite {
  const look: TreeLook = prop.kind === 'tree' && month ? treeLook(month, prop.seed) : 'green';
  const key = prop.kind === 'lamp' || prop.kind === 'bench' || prop.kind === 'totem' ? prop.kind : `${prop.kind}:${prop.seed % 7}${look === 'green' ? '' : `:${look}`}`;
  let s = cache.get(key);
  if (s) return s;
  switch (prop.kind) {
    case 'tree':
      s = treeSprite(prop.seed % 7, look);
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
    case 'scrap_bike':
      s = streetBikeSprite();
      break;
    case 'bun_bike':
      s = streetBikeSprite('bun');
      break;
    case 'flower_bike':
      s = streetBikeSprite('flowers', flowerInfo(FLOWER_KINDS[prop.seed % FLOWER_KINDS.length]));
      break;
    case 'dance_speaker':
      s = danceSpeakerSprite();
      break;
    case 'crossing_sign':
      s = crossingSignSprite();
      break;
    case 'hutieu_cart':
      s = hutieuCartSprite();
      break;
    case 'banhtrang_stand':
      s = banhtrangStandSprite();
      break;
    case 'bus_shelter':
      s = busShelterSprite();
      break;
    case 'bus_sign':
      s = busSignSprite();
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

/** Car seen from the side, facing right; `flip` draws it facing left. Hand-drawn (scripts/assets/handdrawn/car.png) in the
 * red of CAR_COLORS[0]; the other cars swap the three body tones. About twice a motorbike's length. */
export function carSprite(variant: number, flip: boolean): PropSprite {
  const key = `car:${variant % CAR_COLORS.length}:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [body, dark, light] = CAR_COLORS[variant % CAR_COLORS.length];
  const [red, redDark, redLight] = CAR_COLORS[0];
  const { w, h } = gridSize(CAR);
  const [c, ctx] = makeCanvas(w, h);
  shadowEllipse(ctx, 30, 29, 28, 2, 0.3);
  paintGrid(ctx, CAR, 0, 0, { flip, recolor: { [red]: body, [redDark]: dark, [redLight]: light } });
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

/** Scooter (facing right; 30 px long, the anchor where the wheels touch the ground), in one of the body colors. Both layers
 * are hand-drawn (scooter-back.png / scooter-front.png) in the red of BIKE_COLORS[0] and recoloured per variant. */
export function motorbikeSprites(variant: number, flip: boolean): BikeSprites {
  const key = `bike:${variant % BIKE_COLORS.length}:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return { back: hit, front: cache.get(key + ':front')! };
  const [body, dark, light] = BIKE_COLORS[variant % BIKE_COLORS.length];
  const [red, redDark, redLight] = BIKE_COLORS[0];
  const recolor = { [red]: body, [redDark]: dark, [redLight]: light };
  const { w, h } = gridSize(SCOOTER_BACK);
  // back: wheels, rear body, seat, exhaust (the riders sit on top of it)
  const [bc, b] = makeCanvas(w, h);
  shadowEllipse(b, 15, 21, 13, 2, 0.3);
  paintGrid(b, SCOOTER_BACK, 0, 0, { flip, recolor });
  // front: floorboard, leg shield up to the handlebar, front fender, lights, mirror
  const [fc, f] = makeCanvas(w, h);
  paintGrid(f, SCOOTER_FRONT, 0, 0, { flip, recolor });
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
  const grid = { water: CARGO_WATER, foam: CARGO_FOAM, plant: CARGO_PLANT, flowers: CARGO_FLOWERS, peach: CARGO_PEACH }[kind];
  const { w, h } = gridSize(grid);
  const [c, ctx] = makeCanvas(w, h);
  // hand-drawn (scripts/assets/handdrawn/cargo-*.png); the bouquet's bloom colours turn with the seed, the rest can be mirrored
  // by it (`flip` is the bike's own direction, the seed's parity mirrors the drawing on top of that)
  const mirror = (seed % 2 === 1) !== flip;
  const recolor = kind === 'flowers' ? rotatePairs(BLOOMS, seed % BLOOMS.length) : undefined;
  paintGrid(ctx, grid, 0, 0, { flip: kind === 'water' || kind === 'foam' ? flip : mirror, recolor });
  const s = { canvas: c, ax: 12, ay: h - 1 };
  cache.set(key, s);
  return s;
}

/** Bloom colours of the bouquet as drawn in cargo-flowers.png (red, pink, white, dark red, yellow). */
const BLOOMS: readonly (readonly string[])[] = [['#e8454a'], ['#f08ab8'], ['#ffffff'], ['#c92d3a'], ['#f2c94c']];

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
