// Registry of the art of the extra office themes (one file per theme in this folder, registered on import): the
// props that replace plants and hang on walls and elevators, and the costumes worn on the head. Keys are namespaced
// by the theme id ("valentine:balloon"), so themes never collide.
import type { PixelBuf } from '../core/pixbuf';

/**
 * Draws a prop into a 40×64 sheet anchored at the bottom center (20, 60), the same as art/seasonal.ts: the floor
 * line is y = 59 (a shadow there looks grounded); hanging props (wall/elevator) are drawn from around y = 30 down.
 * Leave a transparent margin of at least 1 px on every side (the outline is added afterwards).
 */
export type PropArt = (b: PixelBuf) => void;

/**
 * Draws a costume on the head: (x, y) is the top-left of the head rig, as in character/render.ts drawCostume —
 * the head spans roughly x..x+13 and y..y+12; hats go from y-6 to y+5, glasses at y+6..y+7. Must change at least a
 * few pixels in every direction and pose (the tests check it) and must not cover the eyes.
 */
export type CostumeArt = (b: PixelBuf, x: number, y: number) => void;

export const THEME_PROPS = new Map<string, PropArt>();
export const THEME_COSTUMES = new Map<string, CostumeArt>();
