// Evening folk dance (nhảy dân vũ): every evening a group of aunties in matching red tops walks to the sidewalk across
// the street, lines up by a trolley loudspeaker (loa kéo) and dances in step, the same 8-move routine over and over.
// Now and then an idle agent walks out, crosses the street and joins the back row, always half a beat late, then goes
// back to the desk. At the end the group walks off. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { Dir, Pose } from '../../art/api';
import { BUILDING_H, TILE } from '../constants';
import type { ExteriorProp } from '../layout/types';

/** Dance hours (local, fractional). */
export const DANCE_FROM_H = 19;
export const DANCE_TO_H = 20.5;
/** How many aunties in the group, and how far apart they arrive (ms). */
export const DANCERS = 7;
export const DANCER_GAP_MS = 2_500;
/** Each second of the dance, the chance that an idle agent goes to join. */
export const DANCE_JOIN_CHANCE = 0.02;
/** One beat of the music (ms): the routine moves every two. */
export const BEAT_MS = 520;

/** The sidewalk across the street (tiles from the building's south edge, like the outdoor layout). */
const FAR_WALK_Y = (BUILDING_H + 9) * TILE;
/** Where the group walks in and out: along the middle of that sidewalk. */
export const DANCE_WALK_Y = FAR_WALK_Y + 14;

export interface DanceSlot {
  /** Feet (px). */
  x: number;
  y: number;
}

const COLS = [4, 5.5, 7, 8.5, 10].map((t) => Math.round(t * TILE));
const ROWS = [FAR_WALK_Y + 12, FAR_WALK_Y + 28, FAR_WALK_Y + 46];

/** The aunties' places: the front row and the first two of the second one. */
export const DANCER_SLOTS: readonly DanceSlot[] = [...COLS.map((x) => ({ x, y: ROWS[0] })), { x: COLS[0], y: ROWS[1] }, { x: COLS[1], y: ROWS[1] }];

/** Places for agents who join: the rest of the second row and the back row on the grass. */
export const JOIN_SLOTS: readonly DanceSlot[] = [{ x: COLS[2], y: ROWS[1] }, { x: COLS[3], y: ROWS[1] }, { x: COLS[1], y: ROWS[2] }, { x: COLS[3], y: ROWS[2] }];

/** The trolley loudspeaker, at the group's left. */
export const DANCE_SPEAKER = { x: 2 * TILE, y: FAR_WALK_Y + 20 } as const;

export function danceTime(hour: number): boolean {
  return hour >= DANCE_FROM_H && hour < DANCE_TO_H;
}

/** An aunty walks in from the west end of the far sidewalk to her place. */
export function dancerRouteIn(fromX: number, slot: DanceSlot): number[] {
  return [fromX, DANCE_WALK_Y, slot.x, DANCE_WALK_Y, slot.x, slot.y];
}

/** ...and at the end walks off east. */
export function dancerRouteOut(slot: DanceSlot, toX: number): number[] {
  return [slot.x, DANCE_WALK_Y, toX, DANCE_WALK_Y];
}

/** The routine: 8 moves, two beats each, the whole group in step. */
const ROUTINE: readonly { pose: Pose; dir: Dir }[] = [
  { pose: 'cheer', dir: 'down' },
  { pose: 'stand', dir: 'left' },
  { pose: 'cheer', dir: 'down' },
  { pose: 'stand', dir: 'right' },
  { pose: 'stretch', dir: 'down' },
  { pose: 'raise_hand', dir: 'left' },
  { pose: 'stretch', dir: 'down' },
  { pose: 'raise_hand', dir: 'right' },
];

/** The move at time `now` (ms); `lagBeats` > 0 for whoever is a little behind. */
export function danceMove(now: number, lagBeats = 0): { pose: Pose; dir: Dir } {
  const beat = Math.floor(now / BEAT_MS) - lagBeats;
  const i = (((Math.floor(beat / 2) % ROUTINE.length) + ROUTINE.length) % ROUTINE.length) | 0;
  return ROUTINE[i];
}

export function danceSpeakerProps(up: boolean): readonly ExteriorProp[] {
  return up ? [{ kind: 'dance_speaker', x: DANCE_SPEAKER.x, y: DANCE_SPEAKER.y, seed: 0 }] : [];
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** What the aunties call out now and then. */
export function dancerLine(rng: () => number): string {
  return pick(rng, [tr('One, two, three, cha cha cha! 💃'), tr('Arms up, ladies! 💃'), tr('Turn left, turn right! 🎶')]);
}

/** What an agent says on joining. */
export function joinLine(rng: () => number): string {
  return pick(rng, [tr('Can I join? 😅'), tr('Teach me this one! 💃'), tr('After a day of coding… 🕺')]);
}
