// Interface sounds (opt-in): wires the sound board to the preferences, plays the ambient sounds the
// world suggests (keyboard, elevator, circles) and unlocks audio on the user's first gesture.
import { SoundBoard } from '../audio/board';
import { CricketAmbience } from '../audio/crickets';
import { LofiPlayer } from '../audio/lofi';
import type { SoundKind } from '../audio/scheduler';
import type { UiComponent, UiContext } from './context';

export class SoundControl implements UiComponent {
  readonly board = new SoundBoard();
  private previewAt = 0;

  /** Background lofi (its own switch and volume, apart from the office sounds). */
  readonly music = new LofiPlayer();
  /** Crickets at night under the lofi (same switch and volume as the music; follow the world's night). */
  readonly crickets: CricketAmbience;

  constructor(private ctx: UiContext) {
    this.crickets = new CricketAmbience(() => ctx.world.nightLevel?.() ?? 0);
    this.sync();
    ctx.world.onSound?.((cue) => this.board.play(cue.kind, cue));
    // The browser only unlocks audio after a user gesture.
    const unlock = () => {
      if (this.ctx.prefs.sound) void this.board.unlock();
      if (this.ctx.prefs.music) {
        this.music.start();
        this.crickets.unlock();
      }
    };
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('keydown', unlock);
  }

  render(): void {
    this.sync();
  }

  /** Applies the current preferences (master switch, volume, categories). */
  sync(): void {
    this.board.configure(this.ctx.prefs.sound, this.ctx.prefs.sounds);
    this.music.configure(this.ctx.prefs.music, this.ctx.prefs.musicVolume);
    this.crickets.configure(this.ctx.prefs.music, this.ctx.prefs.musicVolume);
  }

  /** Turns the disco track on or off (called from the shortcut: the gesture unlocks audio); the lofi steps aside. */
  disco(on: boolean, seconds = 30): void {
    this.sync();
    this.board.disco(on, seconds);
    this.music.duck(on ? seconds : 0);
    this.crickets.duck(on ? seconds : 0);
  }

  /** Sample when changing settings (called from the click: unlocks audio). */
  preview(kind: SoundKind = 'pop'): void {
    this.sync();
    const now = performance.now();
    const ready = this.board.unlock();
    if (now - this.previewAt < 250) return;
    this.previewAt = now;
    // the AudioContext's first "resume" is asynchronous
    void ready.then(() => this.board.play(kind));
  }
}
