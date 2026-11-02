// Hand-drawn sprites: a character grid + palette (generated from a PNG drawn in Pixelorama by
// scripts/assets/png2grid.py), painted onto a canvas with fillRect like the procedural sprites.
export interface PixelGrid {
  /** One character -> '#rrggbb'. '.' is always transparent. */
  palette: Readonly<Record<string, string>>;
  /** All rows have the same length. */
  rows: readonly string[];
}

export function gridSize(grid: PixelGrid): { w: number; h: number } {
  return { w: grid.rows[0]?.length ?? 0, h: grid.rows.length };
}

export interface PaintOptions {
  /** Mirrors the drawing left-right (one drawing, two sprites). */
  flip?: boolean;
  /** Swaps palette colours by hex ('#rrggbb' -> '#rrggbb'): one drawing, several colour variants. */
  recolor?: Readonly<Record<string, string>>;
}

/** Paints the grid with its top-left corner at (x, y); runs of the same colour become one fillRect. */
export function paintGrid(ctx: CanvasRenderingContext2D, grid: PixelGrid, x = 0, y = 0, opts: PaintOptions = {}): void {
  grid.rows.forEach((source, ry) => {
    const row = opts.flip ? [...source].reverse().join('') : source;
    let rx = 0;
    while (rx < row.length) {
      const ch = row[rx];
      let end = rx + 1;
      while (end < row.length && row[end] === ch) end++;
      const base = ch === '.' ? undefined : grid.palette[ch];
      const color = base && opts.recolor?.[base] ? opts.recolor[base] : base;
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x + rx, y + ry, end - rx, 1);
      }
      rx = end;
    }
  });
}

/** Problems with a grid (empty list: valid): ragged rows or characters missing from the palette. */
export function gridProblems(grid: PixelGrid): string[] {
  const out: string[] = [];
  const w = grid.rows[0]?.length ?? 0;
  grid.rows.forEach((row, i) => {
    if (row.length !== w) out.push(`row ${i} has ${row.length} columns, expected ${w}`);
    for (const ch of row) if (ch !== '.' && !grid.palette[ch]) out.push(`row ${i}: '${ch}' is not in the palette`);
  });
  return out;
}

/** Recolor table that turns colour pairs around: pair i becomes pair i + turn (wrapping). */
export function rotatePairs(pairs: readonly (readonly string[])[], turn: number): Record<string, string> {
  const out: Record<string, string> = {};
  pairs.forEach((from, i) => {
    const to = pairs[(i + turn) % pairs.length];
    from.forEach((c, k) => {
      out[c] = to[k];
    });
  });
  return out;
}
