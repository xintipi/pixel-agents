// Traffic police (công an giao thông) at rush hour: when the street jams (sim/traffic.ts decides), an officer in the
// mustard uniform, peaked cap and white gloves walks out to the middle of the zebra crossing and directs the traffic for
// real: one direction at a time, the other waiting at the stop line, both when someone is on the crossing, and bikes
// riding the far sidewalk get whistled back down. When the street flows again (or the rush is over) the officer walks
// off. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { Dir, Pose } from '../../art/api';
import { CROSSWALK, STREET_H, STREET_Y } from '../layout/exterior';
import { LANE_Y } from './tea';

/** The post: the middle of the crossing, on the center line between the two lanes (feet, px). */
export const POLICE_POST = { x: CROSSWALK.x + Math.round(CROSSWALK.w / 2), y: STREET_Y + Math.round(STREET_H / 2) + 4 } as const;

/** Walks in from the west end of the near sidewalk, along it to the crossing, out to the post. */
export function policeRouteIn(fromX: number): number[] {
  return [fromX, LANE_Y, POLICE_POST.x, LANE_Y, POLICE_POST.x, POLICE_POST.y];
}

/** ...and back the same way. */
export function policeRouteOut(toX: number): number[] {
  return [POLICE_POST.x, LANE_Y, toX, LANE_Y];
}

/**
 * The officer's gesture for the held direction (1 = eastbound waits, -1 = westbound waits): facing the waiting traffic
 * with the palm up ('raise_hand'), then waving the other side through with the baton ('use'), back and forth.
 */
export function policeGesture(hold: 1 | -1, now: number): { pose: Pose; dir: Dir } {
  // the eastbound traffic comes from the west: to stop it, face west (left)
  const faceHeld: Dir = hold === 1 ? 'left' : 'right';
  const faceGo: Dir = hold === 1 ? 'right' : 'left';
  return Math.floor(now / 900) % 2 === 0 ? { pose: 'raise_hand', dir: faceHeld } : { pose: 'use', dir: faceGo };
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** On arrival at the post. */
export function policeArrive(rng: () => number): string {
  return pick(rng, [tr('Tweet tweet! Slow down, one side at a time! 👮'), tr('Stay in your lane, everyone! 👮')]);
}

/** Now and then, directing. */
export function policeWhistle(rng: () => number): string {
  return pick(rng, [tr('Tweet! Go, go! 👮'), tr('Tweet tweet! Stop there! 👮'), tr('Let the pedestrians cross! 👮')]);
}

/** A bike caught riding the sidewalk. */
export function policeCatch(rng: () => number): string {
  return pick(rng, [tr('Hey! Off the sidewalk, now! 👮'), tr('The sidewalk is for walking! Back down! 👮')]);
}
