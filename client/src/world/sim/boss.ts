// The boss's rounds (sếp đi tuần): on weekdays, in office hours, now and then the boss steps out of the elevator in a
// white shirt and red tie, walks through the lounge and the lit rooms, looks around and leaves. Idle agents in sight
// get a fright: at the desk they pretend to type, on the phone they swap it for papers, napping they jolt awake; once
// the boss is gone, a sigh of relief. Agents really working get a nod. Purely visual: nothing about the real agents
// changes. Pure (no DOM).
import { tr } from '../../../../shared/i18n';

/** Office hours of the rounds (local, fractional), skipping the lunch break and the siesta. */
export const BOSS_FROM_H = 8.5;
export const BOSS_TO_H = 17.5;
const LUNCH_FROM_H = 11.5;
const LUNCH_TO_H = 13.5;

/** Between two rounds (ms): a random wait in this range. The first comes a few minutes after the page opens. */
export const BOSS_GAP_MS: readonly [number, number] = [25 * 60_000, 50 * 60_000];
export const BOSS_FIRST_MS: readonly [number, number] = [4 * 60_000, 10 * 60_000];

/** How far (tiles, in each direction) the boss sees. */
export const BOSS_SIGHT = 6;

/** After the boss is out of sight, the pretending lasts this much longer (ms). */
export const BOSS_LINGER_MS = 1_800;

/** How long the boss stands looking around in each room (ms). */
export const BOSS_LOOK_MS: readonly [number, number] = [2_500, 4_500];

/** At most this many rooms per round (besides the lounge). */
export const BOSS_MAX_ROOMS = 4;

/** Weekday (Mon–Fri), office hours and not over lunch/siesta. */
export function bossHours(hour: number, weekday: number): boolean {
  if (weekday < 1 || weekday > 5) return false;
  if (hour < BOSS_FROM_H || hour >= BOSS_TO_H) return false;
  return hour < LUNCH_FROM_H || hour >= LUNCH_TO_H;
}

/** Within the boss's sight (Chebyshev distance in tiles). */
export function inSight(boss: { tx: number; ty: number }, ch: { tx: number; ty: number }, range = BOSS_SIGHT): boolean {
  return Math.max(Math.abs(boss.tx - ch.tx), Math.abs(boss.ty - ch.ty)) <= range;
}

/** Order of the stops: left to right along the corridor (the elevator is on the far west). */
export function patrolOrder<T extends { tx: number }>(stops: readonly T[], max = BOSS_MAX_ROOMS): T[] {
  return [...stops].sort((a, b) => a.tx - b.tx).slice(0, max);
}

/** What the boss says on stepping out of the elevator. */
export function arrivalLine(rng: () => number): string {
  const lines = [tr('Morning, team! 👔'), tr('How are we doing? 👔'), tr('Just passing by… 👔')];
  return lines[Math.floor(rng() * lines.length)];
}

/** What the boss says on catching someone idle. */
export function catchLine(rng: () => number): string {
  const lines = [tr('Hmm… 🤨'), tr('Busy, are we? 🤨'), tr('Deadline is Friday, right? 🤨')];
  return lines[Math.floor(rng() * lines.length)];
}
