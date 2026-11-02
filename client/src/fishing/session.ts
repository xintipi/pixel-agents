// The fishing loop as a state machine, with no drawing: idle -> charge (hold) -> wait (release) -> bite -> reel -> result.
// One input: press/release (space, mouse, touch). `update(dt)` takes seconds.
import { rollFish, type Catch, type Cond } from './fish';

export type Phase = 'idle' | 'charge' | 'wait' | 'bite' | 'reel' | 'result';
export type FishingEvent = 'cast' | 'bite' | 'early' | 'missed' | 'slipped' | 'caught';

/** Height of the reeling track (px) and of the green zone. */
export const TRACK_H = 140;
export const ZONE_H = 34;
/** Height of the fish marker on the track. */
export const FISH_H = 9;

export interface Reel {
  /** Fish (top of the marker) and where it is heading. */
  fy: number;
  target: number;
  /** Time left until the fish picks another target. */
  ft: number;
  /** Top of the green zone and its speed (px/s). */
  zy: number;
  zv: number;
  /** 0..1: at 1 the fish is yours, at 0 it got away. */
  prog: number;
  inZone: boolean;
}

export class Session {
  phase: Phase = 'idle';
  /** Seconds in the current phase. */
  t = 0;
  /** Charge (0..1) while holding, then the cast's distance. */
  power = 0;
  hold = false;
  waitFor = 0;
  reel: Reel = {
    fy: 60,
    target: 60,
    ft: 0,
    zy: 50,
    zv: 0,
    prog: 0.35,
    inZone: false,
  };
  caught: Catch | null = null;

  constructor(
    private readonly cond: () => Cond,
    private readonly emit: (e: FishingEvent) => void = () => {},
    private readonly rnd: () => number = Math.random,
  ) {}

  private go(p: Phase): void {
    this.phase = p;
    this.t = 0;
  }

  press(): void {
    this.hold = true;
    switch (this.phase) {
      case 'idle':
        this.power = 0;
        this.go('charge');
        break;
      case 'wait':
        this.emit('early');
        this.go('idle');
        break;
      case 'bite':
        this.caught = rollFish(this.power, this.cond(), this.rnd);
        this.reel = {
          fy: 60,
          target: 60,
          ft: 0,
          zy: 50,
          zv: 0,
          prog: 0.35,
          inZone: false,
        };
        this.go('reel');
        break;
      case 'result':
        // a beat before it can be dismissed, so the press that finished the reel doesn't skip the result
        if (this.t > 0.5) this.go('idle');
        break;
    }
  }

  release(): void {
    this.hold = false;
    if (this.phase !== 'charge') return;
    this.waitFor = 1.8 + this.rnd() * 4;
    this.emit('cast');
    this.go('wait');
  }

  update(dt: number): void {
    this.t += dt;
    switch (this.phase) {
      case 'charge':
        this.power = (1 - Math.cos(this.t * 2.6)) / 2;
        break;
      case 'wait':
        if (this.t >= this.waitFor) {
          this.emit('bite');
          this.go('bite');
        }
        break;
      case 'bite':
        if (this.t > 1.1) {
          this.emit('missed');
          this.go('idle');
        }
        break;
      case 'reel':
        this.updateReel(dt);
        break;
    }
  }

  private updateReel(dt: number): void {
    const R = this.reel;
    const r = this.caught!.fish.rarity;
    R.ft -= dt;
    if (R.ft <= 0) {
      R.target = this.rnd() * (TRACK_H - FISH_H);
      R.ft = [1.3, 1.0, 0.75, 0.5][r] * (0.5 + this.rnd());
    }
    R.fy += (R.target - R.fy) * Math.min(1, dt * [2.5, 3.5, 4.5, 6][r]);
    R.zv = Math.max(-170, Math.min(170, R.zv + (this.hold ? -420 : 320) * dt));
    R.zy += R.zv * dt;
    if (R.zy < 0) {
      R.zy = 0;
      R.zv = 0;
    }
    if (R.zy > TRACK_H - ZONE_H) {
      R.zy = TRACK_H - ZONE_H;
      R.zv *= -0.3;
    }
    const c = R.fy + FISH_H / 2;
    R.inZone = c >= R.zy && c <= R.zy + ZONE_H;
    R.prog += (R.inZone ? 0.3 : -0.18 - r * 0.04) * dt;
    if (R.prog >= 1) {
      this.emit('caught');
      this.go('result');
    } else if (R.prog <= 0) {
      this.caught = null;
      this.emit('slipped');
      this.go('idle');
    }
  }
}
