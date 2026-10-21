// Thần Tài altar in the reception (bàn thờ Thần Tài): when an agent has been waiting on the user for a long time
// (permission or answer), an idle coworker now and then goes to light incense and bow for luck; and the first one
// free in the morning lights the day's incense. Purely visual and driven only by real agent state. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import { tetDay } from '../api';

/** An agent waiting on the user at least this long is worth a prayer. */
export const ALTAR_WAIT_MS = 2 * 60_000;
/** At most one prayer for a waiting agent in this window, office-wide. */
export const ALTAR_COOLDOWN_MS = 5 * 60_000;
/** Chance per second (housekeeping tick) that someone goes once it is due: not right on the dot. */
export const ALTAR_CHANCE = 1 / 20;
/** Lit incense smokes this long. */
export const INCENSE_MS = 4 * 60_000;
/** Morning incense: from this hour until MORNING_END_H (local, fractional). */
export const MORNING_START_H = 7;
export const MORNING_END_H = 11;

/** The agent (character mode, agent status and since when) has been waiting on the user for at least ALTAR_WAIT_MS. */
export function waitingLong(mode: string, status: string, statusSince: number, now: number): boolean {
  return mode === 'wait' && status === 'waiting' && now - statusSince >= ALTAR_WAIT_MS;
}

/** The office-wide cooldown since the last prayer for a waiting agent has passed (0 = never prayed). */
export function cooldownOver(lastPrayerAt: number, now: number): boolean {
  return !lastPrayerAt || now - lastPrayerAt >= ALTAR_COOLDOWN_MS;
}

/** Local day key (yyyy-m-d), to light the morning incense once a day. */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** The morning incense is still to be lit today (it is morning and nobody lit it yet). */
export function morningDue(hour: number, now: number, litDay: string): boolean {
  return hour >= MORNING_START_H && hour < MORNING_END_H && litDay !== dayKey(now);
}

/** Vía Thần Tài: the 10th day of the lunar new year (mùng 10 tháng Giêng), 9 days after Tết. */
export function isViaThanTai(now: number): boolean {
  const d = new Date(now);
  const tet = tetDay(d.getFullYear());
  if (!tet) return false;
  const via = new Date(tet.getFullYear(), tet.getMonth(), tet.getDate() + 9);
  return d.getFullYear() === via.getFullYear() && d.getMonth() === via.getMonth() && d.getDate() === via.getDate();
}

/** Altar sprite state: bit 0 = incense lit, bit 1 = Vía Thần Tài decorations. */
export function altarState(litUntil: number, now: number): number {
  return (now < litUntil ? 1 : 0) | (isViaThanTai(now) ? 2 : 0);
}

/** What the coworker says at the altar (for a coworker who has been waiting, or the morning incense). */
export function prayerLine(rng: () => number, why: 'wait' | 'morning'): string {
  const lines =
    why === 'wait'
      ? [tr('Please let the permission be approved 🙏'), tr('Thần Tài, bless this deploy 🙏'), tr('May the user answer soon 🙏'), tr('Let the build pass, please 🙏')]
      : [tr('A smooth day, no bugs 🙏'), tr("Thần Tài, bless today's work 🙏"), tr('Green tests all day 🙏')];
  return lines[Math.floor(rng() * lines.length)];
}
