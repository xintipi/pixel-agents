// Interface languages: English and Vietnamese. English is the source language: every text is written in English and
// goes through tr(), which returns the Vietnamese translation when Vietnamese is active or, without one, the English
// text itself. An incomplete translation never breaks the interface.
//
// Language choice (once, when this module loads):
// - browser: the saved preference (Settings > Language), otherwise Vietnamese;
// - server: HABBLAUD_LANG (vi or en), otherwise Vietnamese.
// Activity texts are built by the server, so they follow the server's language.
import { DICTIONARIES } from './locales/all';

export type Locale = 'vi' | 'en';

/** Default language when nothing was chosen. */
export const DEFAULT_LOCALE: Locale = 'vi';

/** In selector order; each language's name is in that language, for whoever doesn't read the current one. */
export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'vi', name: 'Tiếng Việt' },
  { id: 'en', name: 'English' },
];

/** Key of the preference saved in the browser. */
export const LOCALE_STORAGE_KEY = 'habblaud:locale';

/** Available dictionaries (English has none: it's the source language). In the browser it starts empty: see registerDictionary. */
const DICTS: Partial<Record<Locale, Readonly<Record<string, string>>>> = { ...DICTIONARIES };

/** The browser loads only the active language's dictionary and registers it here before building the interface. */
export function registerDictionary(l: Locale, dict: Readonly<Record<string, string>>): void {
  DICTS[l] = dict;
}

/** "vi-VN", "vi_VN.UTF-8", "en", "en_US"... -> supported language; undefined if it's neither. */
export function normalizeLocale(v: string | null | undefined): Locale | undefined {
  const s = (v ?? '').trim().toLowerCase().replace('_', '-');
  if (!s) return undefined;
  if (s === 'vi' || s.startsWith('vi-')) return 'vi';
  if (s === 'en' || s.startsWith('en-')) return 'en';
  return undefined;
}

/**
 * Server language (activities, notices, logs): HABBLAUD_LANG (vi or en), otherwise Vietnamese. The system language is
 * not used: many machines and containers default to English (en_US, or Node's en-US without LANG) even for people who
 * use Vietnamese, and the office would switch language on its own. For an English server: HABBLAUD_LANG=en.
 */
export function serverLocale(env: Record<string, string | undefined>): Locale {
  return normalizeLocale(env.HABBLAUD_LANG) ?? DEFAULT_LOCALE;
}

function detect(): Locale {
  const g = globalThis as {
    window?: unknown;
    localStorage?: { getItem(k: string): string | null };
    process?: { env?: Record<string, string | undefined> };
  };
  if (g.window !== undefined) {
    try {
      const saved = normalizeLocale(g.localStorage?.getItem(LOCALE_STORAGE_KEY));
      if (saved) return saved;
    } catch {
      // localStorage blocked (private mode, iframe): falls back to the default.
    }
    return DEFAULT_LOCALE;
  }
  const env = g.process?.env ?? {};
  // Tests compare texts in English (the source): they stay in English on any machine.
  if (env.VITEST) return normalizeLocale(env.HABBLAUD_LANG_TEST) ?? 'en';
  return serverLocale(env);
}

let current: Locale = detect();

export function getLocale(): Locale {
  return current;
}

/** Changes the active language (tests; in the browser, switching from the interface reloads the page). */
export function setLocale(l: Locale): void {
  current = l;
}

/**
 * Translates a text written in English. Numbered placeholders ({0}, {1}...) take `args` in order; the translation
 * may reorder them. Without a translation for the active language, returns the original text.
 */
export function tr(src: string, args?: readonly unknown[]): string {
  const dict = DICTS[current];
  const s = (dict && dict[src]) || src;
  if (!args || args.length === 0) return s;
  return s.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));
}

/** Language in Intl format (dates, numbers). */
export function intlLocale(): string {
  return current === 'vi' ? 'vi-VN' : 'en-US';
}
