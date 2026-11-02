// Hand-drawn office furniture (scripts/assets/handdrawn/furniture/*.png, drawn in Pixelorama) as the art module wants it:
// pure pixel buffers with their anchor and dynamic regions. Only the pieces that don't depend on a seed are drawn by hand
// (see SEED_VARIATIONS in art/furniture/index.ts); the rest stays procedural.
import { parseColor } from '../core/color';
import { PixelBuf } from '../core/pixbuf';
import type { BufFurniture, BufSprite, Rects } from '../core/sprite';
import { FURNITURE_DATA } from './furniture-data';

export interface HandSprite {
  ax: number;
  ay: number;
  /** Dynamic regions (screen, glass, board...) in sprite px. */
  rects?: Rects;
  /** One character -> '#rrggbb' or '#rrggbbaa'. '.' is transparent. */
  palette: Readonly<Record<string, string>>;
  rows: readonly string[];
}

export interface HandFurnitureData {
  base: HandSprite;
  front?: HandSprite;
}

function toBuf(s: HandSprite): BufSprite {
  const buf = new PixelBuf(s.rows[0]?.length ?? 0, s.rows.length);
  const pal = new Map(Object.entries(s.palette).map(([k, v]) => [k, parseColor(v)] as const));
  s.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal.get(row[x]);
      if (c) buf.put(x, y, c);
    }
  });
  return { buf, ax: s.ax, ay: s.ay, rects: s.rects };
}

/** The hand-drawn version of a (normalised) piece of furniture, or undefined when it is still procedural. */
export function handFurniture(kind: string, variant: string | undefined, state: number): BufFurniture | undefined {
  const d = FURNITURE_DATA[`${kind}|${variant ?? '-'}|${state}`];
  return d ? { base: toBuf(d.base), front: d.front ? toBuf(d.front) : undefined } : undefined;
}
