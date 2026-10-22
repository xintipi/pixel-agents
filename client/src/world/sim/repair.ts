// Motorbike repair stall (tiệm vá xe) on the near sidewalk, east of the bánh mì cart: a rack of hanging tires, the air
// compressor, a basin of water to find the leak, a stool and a tire propped up as the sign. The mechanic sits there
// through the day looking at his phone; now and then an eastbound bike gets a flat, the rider pushes it up onto the
// curb and waits while he fixes it (the traffic drives the bike, the sim the mechanic). Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { ExteriorProp } from '../layout/types';
import { BUILDING_H, TILE } from '../constants';

/** Open hours (local, fractional). */
export const REPAIR_OPEN_H = 7;
export const REPAIR_CLOSE_H = 18.5;

/** Top of the near sidewalk (px): two tiles under the building (exterior.ts), right above the street. */
const WALK_Y = (BUILDING_H + 2) * TILE;
/** Stall center (px): between the lamp posts east of the bánh mì cart, in view above the bottom panels. */
export const REPAIR_X = 29 * TILE;

/** Where a bike with a flat stops (bottom center, px): east of the mechanic, wheels at the curb like the parked bikes. */
export const REPAIR_SPOT = { x: REPAIR_X + 22, y: WALK_Y + 30 } as const;
/** The mechanic's stool (his feet, px). */
export const MECHANIC_SEAT = { x: REPAIR_X + 2, y: WALK_Y + 28 } as const;
/** He walks in along the sidewalk, like the street sellers. */
export const MECHANIC_WALK_Y = WALK_Y + 23;

export function repairOpen(hour: number): boolean {
  return hour >= REPAIR_OPEN_H && hour < REPAIR_CLOSE_H;
}

/** The stall's things, while it's set up (bottom centers, px). */
export function repairShopProps(up: boolean): readonly ExteriorProp[] {
  if (!up) return [];
  return [
    { kind: 'repair_rack', x: REPAIR_X - 18, y: WALK_Y + 14, seed: 0 },
    { kind: 'repair_sign', x: REPAIR_X - 36, y: WALK_Y + 29, seed: 0 },
    { kind: 'repair_compressor', x: REPAIR_X - 12, y: WALK_Y + 29, seed: 0 },
    { kind: 'repair_stool', x: MECHANIC_SEAT.x, y: MECHANIC_SEAT.y, seed: 0 },
    { kind: 'repair_basin', x: REPAIR_X + 11, y: WALK_Y + 31, seed: 0 },
  ];
}

/** What the mechanic says to the rider with the flat. */
export function mechanicLine(rng: () => number): string {
  const lines = [tr('Flat tire? Ten minutes 🔧'), tr('Nail in the tire, patching it now'), tr('Need a new inner tube, this one is done')];
  return lines[Math.floor(rng() * lines.length)];
}

/** ...and when it's done. */
export function mechanicDone(rng: () => number): string {
  const lines = [tr('All set, good to go! 👍'), tr("Done! Watch out for nails on this street")];
  return lines[Math.floor(rng() * lines.length)];
}
