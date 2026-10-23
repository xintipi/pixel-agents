// Secret words typed in the office (outside text fields): "disco" (the disco) and "cupdien" (a power cut, the breaker
// trips). Recognizes the sequence amid regular keystrokes. Pure, testable in node.

/** Typing this trips the breaker for fun (sim/outage.ts): "cúp điện", without the accents. */
export const OUTAGE_WORD = 'cupdien';

/** Direct disco shortcut: Shift + D (D alone is not a shortcut; Ctrl+Shift+D and Alt+D belong to the browser). */
export function isDiscoShortcut(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'd';
}

export class KonamiDetector {
  private pos = 0;
  private readonly seq: readonly string[];

  constructor(word = 'disco') {
    this.seq = [...word];
  }

  /** How many letters of the word have been typed so far. */
  get progress(): number {
    return this.pos;
  }

  /** One key (`KeyboardEvent.key`); returns true when the sequence has just been completed. */
  push(key: string): boolean {
    const k = key.toLowerCase();
    if (k === this.seq[this.pos]) this.pos++;
    // wrong key: restart, reusing the key if it opens the sequence ("ddisco" still counts)
    else this.pos = k === this.seq[0] ? 1 : 0;
    if (this.pos < this.seq.length) return false;
    this.pos = 0;
    return true;
  }
}
