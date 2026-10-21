// Lunch and the after-lunch siesta (ngủ trưa), a Vietnamese office custom: phở in the pantry from 11:30 to 12:30,
// then, until 13:30, whoever is idle puts their head down on the desk and the office lights dim a little. Pure: hours
// in, booleans/levels out (the sim and the lighting decide what to do with them).

/** Lunch (phở): from 11:30 to 12:30, flowing right into the siesta. */
export const LUNCH_START = 11.5;
export const LUNCH_END = 12.5;
/** Siesta: from 12:30 to 13:30. */
export const SIESTA_START = 12.5;
export const SIESTA_END = 13.5;
/** The lights fade over these hours (5 min) at the start and at the end of the siesta, instead of snapping. */
export const SIESTA_RAMP_H = 5 / 60;
/** At full siesta, how much of the lit office rooms' light goes away (mixed toward the dark-room shade). */
export const SIESTA_DIM = 0.35;

/** Lunchtime (hour 0–24, fractional)? */
export function lunchTime(hour: number): boolean {
  return hour >= LUNCH_START && hour < LUNCH_END;
}

/** Siesta time (hour 0–24, fractional)? Idle agents nap at their desk during it. */
export function siestaTime(hour: number): boolean {
  return hour >= SIESTA_START && hour < SIESTA_END;
}

/** How dim the office is for the siesta (0 = normal, 1 = full siesta), ramping in and out over `SIESTA_RAMP_H`. */
export function siestaLevel(hour: number): number {
  if (!siestaTime(hour)) return 0;
  return Math.min(1, (hour - SIESTA_START) / SIESTA_RAMP_H, (SIESTA_END - hour) / SIESTA_RAMP_H);
}

/** Staggered wake-up at the end of the siesta: up to this many ms after the end, by agent (not everyone at once). */
export const SIESTA_WAKE_SPREAD_MS = 12_000;
