// The ward loudspeaker (loa phường): two horns on a concrete pole on the near sidewalk. At 6:00 and 17:00 the ward
// radio comes on: the opening line, a few notices read one after the other, the sign-off; someone in the office groans.
// Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { ExteriorProp } from '../layout/types';
import { TILE } from '../constants';

/** The broadcast starts in these windows (local, fractional), once each. */
export const LOA_WINDOWS: readonly (readonly [number, number])[] = [
  [6, 6.25],
  [17, 17.25],
];
/** Each line stays up this long. */
export const LOA_LINE_MS = 7_000;
/** Notices read per broadcast (between the opening and the sign-off). */
const NOTICES = 3;

/** The pole (bottom center, px): back edge of the near sidewalk, between the stone path and the tea stall. */
export const LOA_POLE = { x: 2 * TILE, y: 32 * TILE + 3 } as const;
/** Height of the horns above the pole's foot (px): where the text hangs from. */
export const LOA_TOP = 58;

/** Which window this hour is in (-1: none). */
export function loaWindow(hour: number): number {
  return LOA_WINDOWS.findIndex(([from, to]) => hour >= from && hour < to);
}

export function loaProps(): readonly ExteriorProp[] {
  return [{ kind: 'loudspeaker', x: LOA_POLE.x, y: LOA_POLE.y, seed: 0 }];
}

/** One broadcast: the opening, a few notices (no repeats), the sign-off. */
export function loaScript(rng: () => number): string[] {
  const notices = [
    tr('Reminder: put the trash out between 7 and 8 PM only'),
    tr('Clear standing water, fight dengue fever!'),
    tr('Do not park motorbikes on the sidewalk'),
    tr('Household registration for temporary residents is due this month'),
    tr('Free vaccinations at the ward clinic this Saturday'),
    tr('Keep your neighborhood green, clean and beautiful'),
    tr('Beware of phone scams: never give anyone your OTP code'),
  ];
  for (let i = notices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [notices[i], notices[j]] = [notices[j], notices[i]];
  }
  return [tr('This is the ward radio station…'), ...notices.slice(0, NOTICES), tr("That concludes today's broadcast. Thank you for listening.")];
}

/** What someone in the office says about it. */
export function loaGroan(rng: () => number): string {
  const lines = [tr('The ward speaker again… 😩'), tr("So loud, I can't hear myself think 🙉"), tr('Dengue again? Every single day 😅')];
  return lines[Math.floor(rng() * lines.length)];
}
