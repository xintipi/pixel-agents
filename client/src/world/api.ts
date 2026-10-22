// World CONTRACT (office canvas) consumed by the UI (client/src/ui/**).
// Implementation: client/src/world/index.ts -> createWorld().
// Rule: changes here must be ADDITIVE.

export type Selection = { type: 'agent'; id: string } | { type: 'room'; id: string } | null;

export interface WorldOptions {
  /** Show labels with the characters' names. */
  showNames: boolean;
  /** Activity bubbles: all, only important ones (needs you, selected, recent changes) or none. */
  bubbles: 'all' | 'important' | 'none';
  /** How often agents wander around the office when idle. */
  liveliness: 'calm' | 'normal' | 'lively';
  /** Camera follows the selected agent. */
  followSelected: boolean;
  /** Day/night cycle by local time (windows, lighting). */
  dayNight: boolean;
  /** (Optional, additive) Day/night cycle: automatic, always day or always night. Overrides `dayNight`. */
  daylight?: DaylightMode;
  /** Visual theme: automatic (follows the calendar; see seasonalThemeFor), none, Christmas, Halloween or Tết. */
  theme?: OfficeTheme;
}

/**
 * Theme the renderer draws: the original office ('none') or one of the seasonal ones. Tết (Vietnamese Lunar New Year)
 * is office-only: Habblaud World does not know it, and the building goes with 'none' (see officeThemeForWorld).
 */
export type SeasonalTheme = 'none' | 'christmas' | 'halloween' | 'tet' | 'midautumn' | 'valentine' | 'women' | 'devday' | 'national' | 'children';
/** Themes Habblaud World knows (the others are office-only: there the building goes without a theme). */
const WORLD_KNOWN = new Set<OfficeTheme>(['auto', 'none', 'christmas', 'halloween']);
export type OfficeTheme = 'auto' | SeasonalTheme;

/** Day 1 of Tết (mùng 1 Tết, Vietnamese calendar), from 2024 to 2040: month (1-12) and day. */
const TET_DAYS: Record<number, [number, number]> = {
  2024: [2, 10], 2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3],
  2031: [1, 23], 2032: [2, 11], 2033: [1, 31], 2034: [2, 19], 2035: [2, 8], 2036: [1, 28], 2037: [2, 15],
  2038: [2, 4], 2039: [1, 24], 2040: [2, 12],
};

/** Mid-Autumn day (rằm tháng 8, the 15th of the 8th lunar month), from 2024 to 2040: month (1-12) and day. */
const MID_AUTUMN_DAYS: Record<number, [number, number]> = {
  2024: [9, 17], 2025: [10, 6], 2026: [9, 25], 2027: [9, 15], 2028: [10, 3], 2029: [9, 22], 2030: [9, 12],
  2031: [10, 1], 2032: [9, 19], 2033: [9, 8], 2034: [9, 27], 2035: [9, 16], 2036: [10, 4], 2037: [9, 24],
  2038: [9, 13], 2039: [10, 2], 2040: [9, 20],
};

/** Mid-Autumn on the date (local time): the week before the full moon and two days after. */
export function isMidAutumnSeason(date: Date): boolean {
  const day = MID_AUTUMN_DAYS[date.getFullYear()];
  if (!day) return false;
  const moon = new Date(date.getFullYear(), day[0] - 1, day[1]);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((today.getTime() - moon.getTime()) / 86_400_000);
  return diff >= -7 && diff <= 2;
}

/** Mùng 1 Tết of the year (local date, midnight), or null outside the table. */
export function tetDay(year: number): Date | null {
  const d = TET_DAYS[year];
  return d ? new Date(year, d[0] - 1, d[1]) : null;
}

/** Tết on the date (local time): from 23 tháng Chạp (7 days before mùng 1) to mùng 7 (6 days after). */
export function isTetSeason(date: Date): boolean {
  const day = TET_DAYS[date.getFullYear()];
  if (!day) return false;
  const tet = new Date(date.getFullYear(), day[0] - 1, day[1]);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((today.getTime() - tet.getTime()) / 86_400_000);
  return diff >= -7 && diff <= 6;
}

/**
 * Theme drawn on a date (local time). On automatic: Halloween from October 1 to 31, Christmas from November 1 to
 * December 26, Tết around the Lunar New Year (only with `lunarNewYear`, the Vietnamese UI) and, for the rest of the
 * year, the original office.
 */
export function seasonalThemeFor(theme: OfficeTheme | undefined, date: Date, lunarNewYear = false): SeasonalTheme {
  if (theme && theme !== 'auto') return theme;
  // Vietnamese UI: Mid-Autumn first (when the full moon falls in October it wins over Halloween), then the dated days
  if (lunarNewYear && isMidAutumnSeason(date)) return 'midautumn';
  const special = lunarNewYear ? specialDayTheme(date) : null;
  if (special) return special;
  const month = date.getMonth();
  if (month === 9) return 'halloween';
  if (month === 10 || (month === 11 && date.getDate() <= 26)) return 'christmas';
  if (lunarNewYear && isTetSeason(date)) return 'tet';
  return 'none';
}

/** The office choice in Habblaud World's format, which only knows Christmas and Halloween: the others go as none. */
export function officeThemeForWorld(theme: OfficeTheme): 'auto' | 'none' | 'christmas' | 'halloween' {
  return WORLD_KNOWN.has(theme) ? (theme as 'auto' | 'none' | 'christmas' | 'halloween') : 'none';
}

/** Days from `month`/`day` of this year to `date` (negative before). */
function daysFrom(date: Date, month: number, day: number): number {
  const ref = new Date(date.getFullYear(), month - 1, day);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today.getTime() - ref.getTime()) / 86_400_000);
}

/**
 * The dated days of the Vietnamese calendar, on automatic with the Vietnamese UI: Valentine (Feb 12–15), Women's Day
 * (Mar 6–9 and Oct 18–21), Programmer's Day (the 256th day of the year, ±1), National Day (Apr 29–May 2, Reunification
 * and Labor Day, and Sep 1–3) and Children's Day (May 30–Jun 2).
 */
export function specialDayTheme(date: Date): SeasonalTheme | null {
  const near = (m: number, d: number, before: number, after: number) => {
    const n = daysFrom(date, m, d);
    return n >= -before && n <= after;
  };
  if (near(2, 14, 2, 1)) return 'valentine';
  if (near(3, 8, 2, 1) || near(10, 20, 2, 1)) return 'women';
  const day256 = new Date(date.getFullYear(), 0, 256);
  if (near(day256.getMonth() + 1, day256.getDate(), 1, 1)) return 'devday';
  if (near(4, 30, 1, 2) || near(9, 2, 1, 1)) return 'national';
  if (near(6, 1, 2, 1)) return 'children';
  return null;
}

/** Day/night cycle: follows local time, or fixes day or night. */
export type DaylightMode = 'auto' | 'day' | 'night';

/** Ambient sounds the world suggests (who plays them, and whether, is up to the UI). */
export type SoundCueKind =
  | 'keys'
  | 'elevator'
  | 'pingpong'
  | 'table'
  | 'arcade'
  | 'firework_launch'
  | 'firework_boom'
  // office life: pets, the robot vacuum, bathroom, coffee machine, pizza delivery, yawns and room parties
  | 'bark'
  | 'meow'
  | 'robot_start'
  | 'robot_dock'
  | 'robot_hum'
  | 'door'
  | 'flush'
  | 'tap'
  | 'coffee'
  | 'pizza'
  | 'yawn'
  | 'party'
  // the street: the evening garbage cart's hand bell
  | 'trash_bell'
  // weather outside: rain and wind are beds (the world keeps sending their level while they last), thunder and birds one-offs
  | 'rain'
  | 'wind'
  | 'thunder'
  | 'bird'
  // the street: a motorbike's "tin tin" and a car's longer horn
  | 'horn_bike'
  | 'horn_car';

export interface SoundCue {
  kind: SoundCueKind;
  /** 0..1: proximity (zoom, off screen...). */
  gain: number;
  /** -1 (left) .. 1 (right): position on screen. */
  pan: number;
  /** Keyboard: how many keys in the burst. */
  count?: number;
}

export interface WorldApi {
  /** Selects (or clears) an agent/room. `focus` moves the camera to it. */
  select(sel: Selection, opts?: { focus?: boolean }): void;
  getSelection(): Selection;
  /** Fired when the selection changes (by a click on the canvas or by select()). */
  onSelect(cb: (sel: Selection) => void): () => void;
  /** Agent under the cursor (for UI tooltips). */
  onHover(cb: (agentId: string | null) => void): () => void;
  focusAgent(id: string, opts?: { follow?: boolean }): void;
  focusRoom(id: string): void;
  /** Frames the whole building. */
  overview(): void;
  zoomBy(factor: number): void;
  getOptions(): WorldOptions;
  setOptions(o: Partial<WorldOptions>): void;
  /** Screen position (CSS px, relative to the viewport) just above the character's head, or null if not visible. */
  screenPositionOf(agentId: string): { x: number; y: number } | null;
  /**
   * (Optional, additive) Screen area covered by UI panels, in CSS px. The world then frames
   * (overview) and centers (focusAgent/focusRoom/follow) within the free area.
   */
  setViewInsets?(insets: Partial<ViewInsets>): void;
  /**
   * (Optional, additive) Social life of an agent present in the office: personality, coin
   * wallet, friendships/rivalries with those there now and the circle it is part of. null if not present.
   */
  social?(agentId: string): AgentSocial | null;
  /** (Optional, additive) Right click on an office room: room id and the click point (window px). */
  onRoomContextMenu?(cb: (roomId: string, at: { x: number; y: number }) => void): () => void;
  /** (Optional, additive) Social events (matches and bets) for the feed. */
  onSocialEvent?(cb: (e: SocialEvent) => void): () => void;
  /**
   * (Optional, additive) Timelapse: with `p`, the world draws the replayed day (clock and animation
   * factor from `p`); `null` returns to live. Each call restarts the world from scratch (nobody walks to their desk:
   * everyone already appears in place), so call it on entering, on jumping to another point and on leaving; the next
   * store snapshot is applied as the initial load.
   */
  setPlayback?(p: WorldPlayback | null): void;
  /** (Optional, additive) Ambient sounds: keyboards of visible workers, elevator, wheels. */
  onSound?(cb: (cue: SoundCue) => void): () => void;
  /**
   * (Optional, additive) Office off screen (the city scene is open): stops drawing and the camera
   * keyboard; on return, the simulation advances the time that passed (as with the tab in the background).
   */
  setSuspended?(suspended: boolean): void;
  /**
   * (Optional, additive) Party in a room (confetti, a banner with `text` and the crew celebrating, ~12 s), like the
   * merged-PR one: achievements and big pieces of work delivered. Live only (does nothing in the timelapse).
   */
  celebrate?(roomId: string, text: string, agentId?: string): void;
  /** (Optional, additive) Disco (type "disco"): turns on for ~30 s, or off if already playing. Returns whether it is on. */
  disco?(): boolean;
  /** (Optional, additive) Pizza party: the delivery guy brings the boxes to the pantry. Returns whether it came. */
  pizzaParty?(): boolean;
  /** (Optional, additive) Reception work tree: the stage (0 sprout … 4 blooming); null goes back to the normal pot. */
  setWorkTree?(stage: 0 | 1 | 2 | 3 | 4 | null): void;
  destroy(): void;
}

/** Timelapse clocks (see world/playback.ts). */
export interface WorldPlayback {
  /** Replayed instant (epoch ms): time of the sky, the lighting and the wall clock. */
  clock(): number;
  /** Animation factor (1 = real time; 0 = paused). */
  scale(): number;
}

export interface AgentSocial {
  traits: { emoji: string; label: string; desc: string }[];
  /** Catchphrase ("Tá pago!"). */
  catchphrase: string;
  /** Coin balance (🪙). */
  coins: number;
  /** How much it has earned working (starting balance + tasks + requests + deliveries). */
  earned: number;
  wins: number;
  losses: number;
  /** Present colleagues it has a friendship or rivalry with; `record` = [wins, losses] against them. */
  bonds: { id: string; name: string; kind: 'amizade' | 'rivalidade'; record: [number, number] | null }[];
  /** What it is doing in a circle now ("📺 Watching football on TV with Rafaela"), or null. */
  doing: string | null;
  /** Statement: most recent transactions first. */
  ledger: { at: number; delta: number; icon: string; text: string }[];
}

/** Resolved match/bet (becomes a feed line). */
export interface SocialEvent {
  id: string;
  at: number;
  icon: string;
  /** Protagonist (who won). */
  agentId: string;
  /** Text without the protagonist's name: "won 🪙10 from Caio at rock-paper-scissors". */
  text: string;
  /** Where it happened ("Lounge", "Pantry"...). */
  place: string;
}

/** Viewport margins covered by the UI (CSS px). */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_WORLD_OPTIONS: WorldOptions = {
  showNames: true,
  bubbles: 'important',
  liveliness: 'normal',
  followSelected: false,
  dayNight: true,
  theme: 'auto',
};
