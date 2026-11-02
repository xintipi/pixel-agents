// Fishing mini game: the fish and the odd things that come up. Hand-drawn in Pixelorama
// (scripts/assets/handdrawn/fishing/*.png -> sprites/*.ts). The five fish shapes use one canonical palette that each
// species recolours with its own five colours; the junk (boot, can, bottle, chest) is drawn in its final colours.
import type { PixelGrid } from '../art/handdrawn/grid';
import { gridSize, paintGrid } from '../art/handdrawn/grid';
import type { Fish, Shape } from './fish';
import { FISH_DEEP } from './sprites/fish-deep';
import { FISH_EEL } from './sprites/fish-eel';
import { FISH_LONG } from './sprites/fish-long';
import { FISH_ROUND } from './sprites/fish-round';
import { FISH_STURGEON } from './sprites/fish-sturgeon';
import { JUNK_BOOT } from './sprites/junk-boot';
import { JUNK_BOTTLE } from './sprites/junk-bottle';
import { JUNK_CAN } from './sprites/junk-can';
import { JUNK_CHEST } from './sprites/junk-chest';

const SHAPES: Record<Shape, PixelGrid> = {
  round: FISH_ROUND,
  deep: FISH_DEEP,
  long: FISH_LONG,
  eel: FISH_EEL,
  sturgeon: FISH_STURGEON,
  boot: JUNK_BOOT,
  can: JUNK_CAN,
  bottle: JUNK_BOTTLE,
  chest: JUNK_CHEST,
};

/** Colours of the fish drawings as they are in the PNGs; each species swaps them for its own. */
const BASE = {
  outline: '#2e3648',
  light: '#b9d278',
  body: '#8fa36a',
  shade: '#6f8550',
  belly: '#d6dcaa',
  bellyShade: '#aeb886',
  fin: '#7fa05f',
  finDark: '#566a44',
};

type Rgb = [number, number, number];
const rgb = (c: string): Rgb => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as Rgb;
const mixHex = (a: string, b: string, t: number): string => {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(x[i] + (y[i] - x[i]) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

const recolors = new Map<number, Record<string, string>>();

/** The base-palette -> species-palette table of a fish (junk has none: it is drawn in its own colours). */
function recolorOf(f: Fish): Record<string, string> | undefined {
  if (f.junk) return undefined;
  let r = recolors.get(f.id);
  if (!r) {
    const [body, shade, belly, outline, fin] = f.pal;
    recolors.set(
      f.id,
      (r = {
        [BASE.outline]: outline,
        [BASE.light]: mixHex(body, '#ffffff', 0.35),
        [BASE.body]: body,
        [BASE.shade]: shade,
        [BASE.belly]: belly,
        [BASE.bellyShade]: mixHex(belly, body, 0.45),
        [BASE.fin]: fin,
        [BASE.finDark]: mixHex(fin, '#000000', 0.3),
      }),
    );
  }
  return r;
}

export const fishGrid = (f: Fish): PixelGrid => SHAPES[f.shape];

/** Box (px) that holds the biggest drawing, so the Fishdex icons line up. */
export const FISH_BOX = { w: 58, h: 28 } as const;

/** Draws the fish centred on (cx, cy), `scale` times bigger; `dark` paints it as a silhouette (not caught yet). */
export function drawFish(ctx: CanvasRenderingContext2D, f: Fish, cx: number, cy: number, scale = 1, dark = false): void {
  const g = fishGrid(f);
  const { w, h } = gridSize(g);
  ctx.save();
  ctx.translate(Math.round(cx - (w * scale) / 2), Math.round(cy - (h * scale) / 2));
  ctx.scale(scale, scale);
  const silhouette: PixelGrid = { palette: Object.fromEntries(Object.keys(g.palette).map((k) => [k, '#1d2433'])), rows: g.rows };
  paintGrid(ctx, dark ? silhouette : g, 0, 0, { recolor: recolorOf(f) });
  ctx.restore();
}

/** The little fish that rides the reeling track (small enough for the track), in the species' colours. */
const MARKER: PixelGrid = {
  palette: { o: '#2e3648', b: '#8fa36a', s: '#6f8550', l: '#d6dcaa', e: '#1b1b1b' },
  rows: ['....ooooo..', 'o..obbbbbo.', 'oo.obbbbebo', 'oo.osssssso', 'o..olllllo.', '....ooooo..'],
};

export function drawMarker(ctx: CanvasRenderingContext2D, f: Fish, cx: number, cy: number): void {
  const { w, h } = gridSize(MARKER);
  const r = f.junk ? undefined : { [BASE.body]: f.pal[0], [BASE.shade]: f.pal[1], [BASE.belly]: f.pal[2], [BASE.outline]: f.pal[3] };
  paintGrid(ctx, MARKER, Math.round(cx - w / 2), Math.round(cy - h / 2), { recolor: r });
}
