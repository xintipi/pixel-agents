// UI preferences, persisted in localStorage ('habblaud:prefs').
// Pure: storage is injected (testable in node).
import { DEFAULT_SOUND_SETTINGS, sanitizeSoundSettings, type SoundSettings } from '../audio/scheduler';
import type { DaylightMode, WorldOptions } from '../world/api';
import { DEFAULT_WORLD_OPTIONS } from '../world/api';
import { clampVndRate, DEFAULT_VND_RATE, type CostAlert, type CostCurrency } from './cost';

export const PREFS_KEY = 'habblaud:prefs';

export interface UiPrefs {
  showNames: boolean;
  bubbles: WorldOptions['bubbles'];
  liveliness: WorldOptions['liveliness'];
  /** Day/night cycle: automatic (local time), always day or always night. */
  daylight: DaylightMode;
  theme: NonNullable<WorldOptions['theme']>;
  /** Synthesized sounds (master switch; off by default). */
  sound: boolean;
  /** Master volume and sound categories. */
  sounds: SoundSettings;
  /** Browser Notification for alerts with the tab hidden. */
  browserNotifications: boolean;
  sidebarOpen: boolean;
  feedOpen: boolean;
  /** Accounts hidden in the sidebar (AccountInfo.id). */
  hiddenAccounts: string[];
  /** Habblaud World: notice when the first visitor enters your building (on each connection). On by default. */
  worldVisitNotify: boolean;
  /** Each agent's cost in the sidebar (when Claude Code records it). */
  rowCost: boolean;
  /** Cost currency: dollar or Vietnamese dong (approximate, at the `vndRate` exchange rate). */
  costCurrency: CostCurrency;
  /** Conversion exchange rate (VND per US$). */
  vndRate: number;
  /** Alert when an agent spends this amount (US$) in 10 minutes. */
  costAlert: CostAlert;
}

export const DEFAULT_PREFS: UiPrefs = {
  showNames: DEFAULT_WORLD_OPTIONS.showNames,
  bubbles: DEFAULT_WORLD_OPTIONS.bubbles,
  liveliness: DEFAULT_WORLD_OPTIONS.liveliness,
  daylight: 'auto',
  theme: 'auto',
  sound: false,
  sounds: DEFAULT_SOUND_SETTINGS,
  browserNotifications: false,
  sidebarOpen: true,
  feedOpen: true,
  hiddenAccounts: [],
  worldVisitNotify: true,
  rowCost: true,
  costCurrency: 'usd',
  vndRate: DEFAULT_VND_RATE,
  costAlert: '2',
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Validates field by field: unknown or corrupted values fall back to the default. */
export function sanitizePrefs(raw: unknown): UiPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_PREFS;
  return {
    showNames: bool(o.showNames, d.showNames),
    bubbles: oneOf(o.bubbles, ['all', 'important', 'none'] as const, d.bubbles),
    liveliness: oneOf(o.liveliness, ['calm', 'normal', 'lively'] as const, d.liveliness),
    // old preferences: the "day and night" switch turned off becomes "always day"
    daylight: oneOf(o.daylight, ['auto', 'day', 'night'] as const, o.dayNight === false ? 'day' : d.daylight),
    theme: oneOf(o.theme, ['auto', 'none', 'christmas', 'halloween', 'tet', 'midautumn', 'valentine', 'women', 'devday', 'national', 'children'] as const, d.theme),
    sound: bool(o.sound, d.sound),
    sounds: sanitizeSoundSettings(o.sounds),
    browserNotifications: bool(o.browserNotifications, d.browserNotifications),
    sidebarOpen: bool(o.sidebarOpen, d.sidebarOpen),
    feedOpen: bool(o.feedOpen, d.feedOpen),
    hiddenAccounts: Array.isArray(o.hiddenAccounts) ? o.hiddenAccounts.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
    worldVisitNotify: bool(o.worldVisitNotify, d.worldVisitNotify),
    rowCost: bool(o.rowCost, d.rowCost),
    costCurrency: oneOf(o.costCurrency, ['usd', 'vnd'] as const, d.costCurrency),
    vndRate: o.vndRate === undefined ? d.vndRate : clampVndRate(o.vndRate),
    costAlert: oneOf(o.costAlert, ['off', '1', '2', '5'] as const, d.costAlert),
  };
}

export function loadPrefs(storage: StorageLike | null): UiPrefs {
  if (!storage) return { ...DEFAULT_PREFS };
  try {
    const raw = storage.getItem(PREFS_KEY);
    return sanitizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: StorageLike | null, prefs: UiPrefs): void {
  if (!storage) return;
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked (private tab): preferences only last this session.
  }
}

/** Part of the preferences the world (canvas) consumes. */
export function worldOptionsFrom(p: UiPrefs): Partial<WorldOptions> {
  return { showNames: p.showNames, bubbles: p.bubbles, liveliness: p.liveliness, dayNight: p.daylight !== 'day', daylight: p.daylight, theme: p.theme };
}

/** localStorage guarded against browsers that throw when accessing it. */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Migration from the old name (CodeTown, up to 0.3.2): the keys were `codetown:prefs`,
 * `codetown:update-seen`, `codetown.wallets.v1`... and now start with `habblaud`.
 */
const LEGACY_NAME = 'codetown';
const LEGACY_PREFIXES = [`${LEGACY_NAME}:`, `${LEGACY_NAME}.`];
const NAME = 'habblaud';

type ListableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/**
 * Renames the old-name keys so those who update do not lose their preferences or coins.
 * Runs at boot, before any read. If the new key already exists, it wins and the old one is just deleted.
 * Returns how many keys it copied.
 */
export function migrateLegacyKeys(storage: ListableStorage | null): number {
  if (!storage) return 0;
  const legacy: string[] = [];
  try {
    // List before touching: deleting during the scan changes the key(i) indexes.
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && LEGACY_PREFIXES.some((p) => key.startsWith(p))) legacy.push(key);
    }
  } catch {
    return 0;
  }
  let copied = 0;
  for (const old of legacy) {
    try {
      const value = storage.getItem(old);
      const key = NAME + old.slice(LEGACY_NAME.length);
      if (value !== null && storage.getItem(key) === null) {
        storage.setItem(key, value);
        copied++;
      }
      // Only deletes after copying: if the write fails (quota full), the old one stays for next time.
      storage.removeItem(old);
    } catch {
      // move on to the other keys
    }
  }
  return copied;
}
