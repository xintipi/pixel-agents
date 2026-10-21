// Habblaud World player name rules (Phase 1 contract, section 1). Habblaud checks before sending, to
// warn right away; the world server decides, applying the same rules plus the blocked word list
// (which lives only there). Only imports ./protocol: can be copied to the world server as is. Pure: no Node or DOM.
//
// The name, after NFC, trim and collapsing repeated spaces:
// - has 3 to 20 characters (code points);
// - has only letters, combining accents (at most 3 in a row, after a letter), digits 0-9, space, `_`, `-` and `.`,
//   with at least one letter;
// - has no control, formatting, direction marks, special spaces or invisible characters (including those
//   Unicode classifies as letters but that draw nothing, like the Hangul filler U+3164);
// - uses a single script (Latin, Cyrillic, Greek, Arabic...); Japanese (kanji + hiragana + katakana), Korean
//   (hangul + hanja) and Chinese (han + bopomofo) count as one;
// - isn't a reserved name (compared by key, without spaces or `_`, `-`, `.`).
// The uniqueness key (playerNameKey) equates names that differ only in width, case, accents or spaces.
import { PLAYER_NAME_LIMITS, RESERVED_PLAYER_NAMES } from './protocol';

/** Why the name was rejected (the server responds only with the code; the reason is for the local message). */
export type PlayerNameProblem =
  | 'type' // not text
  | 'length' // outside 3 to 20 characters
  | 'invisible' // control, formatting, direction, special or invisible space
  | 'chars' // character outside the list (or too many stacked accents)
  | 'scripts' // letters from more than one script
  | 'no_letter' // no letter
  | 'reserved'; // reserved name

export type PlayerNameResult =
  | { ok: true; name: string; key: string }
  | { ok: false; code: 'name_invalid' | 'name_blocked'; problem: PlayerNameProblem };

/** Consecutive combining accents accepted after a letter (the rest is "zalgo text"). */
const MAX_MARKS = 3;

/**
 * Invisibles and the like: control, formatting, private use, unassigned (\p{C}), line and paragraph separators, the
 * default-ignorables (ZWJ, variation selectors, Hangul fillers...) and the direction marks.
 */
const INVISIBLE = /[\p{C}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\p{Bidi_Control}]/u;
/** A space that isn't the regular space (NBSP, ideographic space, tab...). */
const ODD_SPACE = /(?! )[\p{Zs}\s]/u;
const LETTER = /^\p{L}$/u;
const MARK = /^\p{M}$/u;
const OTHER_ALLOWED = /^[0-9 _.-]$/;

/** Recognized scripts, by Unicode's Script_Extensions. */
const SCRIPTS = [
  'Latin', 'Greek', 'Cyrillic', 'Armenian', 'Hebrew', 'Arabic', 'Syriac', 'Thaana', 'Devanagari', 'Bengali', 'Gurmukhi',
  'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala', 'Thai', 'Lao', 'Tibetan', 'Myanmar',
  'Georgian', 'Hangul', 'Ethiopic', 'Khmer', 'Mongolian', 'Hiragana', 'Katakana', 'Bopomofo', 'Han',
] as const;
const SCRIPT_RE = SCRIPTS.map((s) => [s, new RegExp(`^\\p{Script_Extensions=${s}}$`, 'u')] as const);
/** A letter from a script outside the list: counts on its own (two unknown scripts together aren't distinguished). */
const OTHER = 'Other';
/** Combinations that count as a single script. */
const WRITING_SYSTEMS: readonly (readonly string[])[] = [
  ...SCRIPTS.map((s) => [s]),
  ['Han', 'Hiragana', 'Katakana'],
  ['Hangul', 'Han'],
  ['Han', 'Bopomofo'],
  [OTHER],
];

function scriptsOf(letter: string): string[] {
  const found = SCRIPT_RE.filter(([, re]) => re.test(letter)).map(([s]) => s);
  return found.length ? found : [OTHER];
}

/** Do the letters fit in a single script? (Each letter can belong to more than one, like Japanese "ー".) */
function oneWritingSystem(letters: readonly string[]): boolean {
  const sets = [...new Set(letters)].map(scriptsOf);
  return WRITING_SYSTEMS.some((system) => sets.every((s) => s.some((x) => system.includes(x))));
}

/** Name without spaces at the ends and with repeated spaces collapsed (only the regular space: the others are rejected). */
function tidy(raw: string): string {
  return raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
}

/**
 * Uniqueness key of the name: NFKC → lowercase → no diacritics → collapsed spaces. "Márcio", "MARCIO",
 * "ｍａｒｃｉｏ" and "marcio " give the same key.
 */
export function playerNameKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\p{Mn}\p{Me}]/gu, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Key without the accepted separators (space, `_`, `-`, `.`), to compare with the reserved ones. */
function compactKey(key: string): string {
  return key.replace(/[ _.-]/g, '');
}

const invalid = (problem: PlayerNameProblem): PlayerNameResult => ({ ok: false, code: 'name_invalid', problem });

/** Checks and tidies the player name; returns the name to store and its key, or the server code and the reason. */
export function parsePlayerName(raw: unknown): PlayerNameResult {
  if (typeof raw !== 'string') return invalid('type');
  // Huge text isn't even processed.
  if (raw.length > PLAYER_NAME_LIMITS.max * 8) return invalid('length');
  const name = tidy(raw);
  if (INVISIBLE.test(name) || ODD_SPACE.test(name)) return invalid('invisible');
  const chars = [...name];
  if (chars.length < PLAYER_NAME_LIMITS.min || chars.length > PLAYER_NAME_LIMITS.max) return invalid('length');
  const letters: string[] = [];
  let marks = 0;
  let prevLetter = false;
  for (const ch of chars) {
    if (LETTER.test(ch)) {
      letters.push(ch);
      marks = 0;
      prevLetter = true;
    } else if (MARK.test(ch)) {
      if (!prevLetter || ++marks > MAX_MARKS) return invalid('chars');
    } else if (OTHER_ALLOWED.test(ch)) {
      marks = 0;
      prevLetter = false;
    } else return invalid('chars');
  }
  if (!letters.length) return invalid('no_letter');
  if (!oneWritingSystem(letters)) return invalid('scripts');
  const key = playerNameKey(name);
  if ((RESERVED_PLAYER_NAMES as readonly string[]).includes(compactKey(key))) return { ok: false, code: 'name_blocked', problem: 'reserved' };
  return { ok: true, name, key };
}
