// Registry of how the extra office themes decorate the building (one file per theme in this folder, registered on
// import), read by render/seasonal.ts: colors, which props replace plants and hang on walls/elevators, the costumes,
// the rug motif and what shows in the window glass. Christmas, Halloween, Tết and Mid-Autumn stay inline there.
import type { SeasonalTheme } from '../../api';

/** Colors of a decorated theme (garland, lights, rug, wall). */
export interface ThemePalette {
  rug: string;
  rugMotif: string;
  wallTint: string;
  trim: string;
  garland: string;
  garlandThick: boolean;
  bulb: string;
  bulbShine: string;
  glow: string;
  light: string;
}

export interface ThemeDecor {
  palette: ThemePalette;
  /** Costume keys (THEME_COSTUMES), picked per character by seed. */
  costumes: readonly string[];
  /** Prop keys (THEME_PROPS) for the first tall plant of each area, picked by seed. */
  tall: readonly string[];
  /** Prop key for every small plant. */
  small: string;
  /** Prop key hung above the elevator frames. */
  elevator: string;
  /** Props hung along wide wall faces: at these fractions of the width, `dy` px below the top of the wall. */
  wall?: { prop: string; at: readonly number[]; dy: number };
  /** Motif repeated along rugs, centered at (cx, cy), in `color` (the palette's rugMotif). Keep it within ±5 px. */
  rugMotif?(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void;
  /** Something animated in the window glass (already clipped to `glass`). `now` in ms. */
  window?(ctx: CanvasRenderingContext2D, glass: { x: number; y: number; w: number; h: number }, now: number, seed: number): void;
}

export const THEME_DECOR = new Map<SeasonalTheme, ThemeDecor>();
