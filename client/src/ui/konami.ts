// Secret disco code: typing "disco" in the office (outside text fields). Recognizes the sequence amid
// regular keystrokes. Pure, testable in node.

const SEQUENCE = ['d', 'i', 's', 'c', 'o'];

/** Direct disco shortcut: Shift + D (D alone is not a shortcut; Ctrl+Shift+D and Alt+D belong to the browser). */
export function isDiscoShortcut(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'd';
}

export class KonamiDetector {
  private pos = 0;

  /** One key (`KeyboardEvent.key`); returns true when the sequence has just been completed. */
  push(key: string): boolean {
    const k = key.toLowerCase();
    if (k === SEQUENCE[this.pos]) this.pos++;
    // wrong key: restart, reusing the key if it opens the sequence ("ddisco" still counts)
    else this.pos = k === SEQUENCE[0] ? 1 : 0;
    if (this.pos < SEQUENCE.length) return false;
    this.pos = 0;
    return true;
  }
}
