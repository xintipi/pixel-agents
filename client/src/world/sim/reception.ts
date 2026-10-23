// The receptionist (lễ tân): a young woman in a navy uniform with her hair in a bun who staffs the reception desk in
// office hours. She steps out of the elevator in the morning, stands behind the counter (typing, on the phone, sorting
// papers), greets the agents who arrive and says goodbye to those who leave, smiles at whoever walks past, stands up
// straight when the boss goes by, eats at the desk at lunch and dozes off during the siesta; in the evening she takes the
// elevator home. Purely visual: she is an extra, never an agent. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { HeldItem, Pose } from '../../art/api';

/** Id of the receptionist (extra). */
export const RECEPTIONIST_ID = 'npc:le-tan';

/** Office hours (local, fractional): she arrives at opening and leaves at closing. */
export const RECEPTION_OPEN_H = 7.5;
export const RECEPTION_CLOSE_H = 18;

/** Where she stands: behind the reception counter (local tile of the reception; the counter is at (9..11, 5)). */
export const RECEPTION_DESK_SPOT = { lx: 10, ly: 4 } as const;
/** She stands this many px north of the tile's usual foot point (more of her shows above the counter). */
export const RECEPTION_DESK_LIFT = 3;

/** At most one greeting/goodbye bubble per this long (ms). */
export const GREET_COOLDOWN_MS = 20_000;
/** A greeting that couldn't be said within this long (the agent never came by) is dropped (ms). */
export const GREET_EXPIRE_MS = 60_000;
/** The little smile at a passer-by: at most one per this long (ms). */
export const SMILE_COOLDOWN_MS = 15_000;
/** Who counts as walking past (tiles, Chebyshev distance from her). */
export const PASS_RANGE = 2;
/** How close the boss has to come for her to stand up straight (tiles). */
export const BOSS_RANGE = 4;
/** How close (tiles) an arriving/leaving agent has to be for the greeting, besides being in the reception. */
export const GREET_RANGE = 9;

export function receptionOpen(hour: number): boolean {
  return hour >= RECEPTION_OPEN_H && hour < RECEPTION_CLOSE_H;
}

/** Cooldown check: `last` is when she last spoke (0 = never). */
export function canGreet(last: number, now: number, cooldown = GREET_COOLDOWN_MS): boolean {
  return !last || now - last >= cooldown;
}

function pick(lines: readonly string[], rng: () => number): string {
  return lines[Math.floor(rng() * lines.length)];
}

/** What she says to an agent stepping into the office: "good morning" before 11:00. */
export function helloLine(hour: number, rng: () => number): string {
  if (hour < 11) return pick([tr('Good morning! ☀️'), tr('Welcome to the office! 😊')], rng);
  return pick([tr('Welcome to the office! 😊'), tr('Hello! Have a great day! 😊')], rng);
}

/** What she says to an agent going home: "see you tomorrow" late in the day. */
export function byeLine(hour: number, rng: () => number): string {
  if (hour >= 16) return tr('See you tomorrow! 👋');
  return pick([tr('Goodbye! Take care! 👋'), tr('See you soon! 👋')], rng);
}

/** What she says now and then on the desk phone. */
export function phoneLine(rng: () => number): string {
  return pick([tr('Habblaud, how may I help you? 📞'), tr('One moment, please… 📞')], rng);
}

export interface DeskAct {
  pose: Pose;
  held: HeldItem;
  ms: number;
  /** Says a phone line when it starts. */
  phone?: boolean;
  /** Dozing (the siesta): the zzz above her head. */
  doze?: boolean;
}

/**
 * Her next little thing at the desk: typing on the computer, the phone, sorting papers, standing ready; lunch at the
 * desk; dozing during the siesta.
 */
export function deskAct(rng: () => number, opts: { lunch: boolean; siesta: boolean }): DeskAct {
  const ms = (a: number, b: number) => Math.round(a + rng() * (b - a));
  if (opts.siesta) return { pose: 'sulk', held: 'none', ms: ms(15_000, 30_000), doze: true };
  const r = rng();
  if (opts.lunch && r < 0.6) return { pose: 'stand', held: 'noodles', ms: ms(10_000, 20_000) };
  if (r < 0.35) return { pose: 'use', held: 'none', ms: ms(5_000, 12_000) };
  if (r < 0.5) return { pose: 'read', held: 'phone', ms: ms(5_000, 9_000), phone: rng() < 0.4 };
  if (r < 0.7) return { pose: 'read', held: 'papers', ms: ms(4_000, 9_000) };
  return { pose: 'stand', held: 'none', ms: ms(4_000, 10_000) };
}
