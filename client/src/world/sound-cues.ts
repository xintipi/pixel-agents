// Ambient sounds suggested by the world: keyboard of whoever is working in view, "ding" when an elevator
// door opens (someone arrives or leaves), the circles (ping-pong paddle hits, arcade), the office life the sim
// points out (pets, bathroom, coffee machine, pizza, yawns, the robot vacuum), room parties and the weather outside
// (rain and wind beds, distant thunder, birds by day) and the horns of the traffic on the street. Only observes the simulation and the camera; whoever decides
// whether to play (preference, volume, hidden tab) is the UI.
import type { SoundCue } from './api';
import type { Camera } from './camera';
import type { Character } from './sim/character';
import type { Sim } from './sim/sim';
import { BUILDING_H, COL_W } from './constants';
import { TILE } from '../art/api';
import { FIREWORK_RISE, FIREWORK_TUBES, fireworkBurst } from './fireworks';
import { rectPx, slotRect } from './layout/geometry';
import type { Weather } from './render/weather';
import type { Horn } from './sim/traffic';
import { GENERATOR } from './sim/outage';

/** Re-evaluates who is typing every this many ms. */
const KEYS_TICK_MS = 160;
/** Period (ms) of one ping-pong ball trip (the same as the drawing). */
const PINGPONG_PERIOD = 1_100;
/** Beds (rain, wind, the robot's hum): their level is re-sent every this many ms while they last. */
const BED_TICK_MS = 400;
/** A sound the sim suggested longer ago than this is dropped (fast forward, a frame that took too long). */
const SFX_STALE_MS = 1_500;
/** How loud each office-life sound is next to the others (1 = as loud as the elevator). */
const SFX_GAIN: Partial<Record<SoundCue['kind'], number>> = { door: 0.7, flush: 0.8, tap: 0.7, coffee: 0.8, yawn: 0.8, bark: 0.9, meow: 0.9, robot_start: 0.8, robot_dock: 0.8 };
/** At most one horn this often (ms): a rush-hour jam honks a lot, and it shouldn't drown the rest (global cap). */
const HORN_GAP_MS = 650;
/** Heard even off screen (quieter): the doorbell of the pizza delivery, the power going and coming back, a close thunderclap. */
const SFX_OFFSCREEN: ReadonlySet<SoundCue['kind']> = new Set(['pizza', 'power_off', 'power_on', 'thunder']);

interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class SoundCues {
  private doors: number[] = [];
  private keysAt = 0;
  private nextKeysAt = 0;
  private nextArcadeAt = 0;
  private rally = new Map<number, number>();
  /** Last state of each firework tube: the cycle and whether it had already opened. */
  private tubes: { cycle: number; open: boolean }[] = [];
  private bedsAt = 0;
  private nextThunderAt = 0;
  private nextBirdAt = 0;
  private hornAt = 0;
  /** Parties already heard, by room (the key of the effect). */
  private parties = new Map<string, number>();
  /** Weather outside, the night factor and the street's horns (from the renderer); without it, no weather sounds. */
  env: (() => { weather: Weather; night: number; horns?: Horn[] }) | null = null;

  constructor(
    private readonly sim: Sim,
    private readonly camera: Camera,
    private readonly rng: () => number = Math.random,
  ) {}

  update(now: number, emit: (cue: SoundCue) => void): void {
    const a = this.camera.screenToWorld(0, 0);
    const b = this.camera.screenToWorld(this.camera.viewW, this.camera.viewH);
    const view = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    // from far away (low zoom) everything gets quieter
    const near = Math.max(0.45, Math.min(1, 0.25 + this.camera.zoom * 0.25));
    this.elevators(view, emit);
    this.keys(now, view, near, emit);
    this.social(now, view, near, emit);
    this.fireworks(now, view, emit);
    this.officeLife(view, near, emit);
    this.roomParties(view, near, emit);
    this.beds(now, view, near, emit);
    this.horns(now, view, near, emit);
  }

  /** The traffic's horns: only those in view, at most one every HORN_GAP_MS; the queue is emptied either way. */
  private horns(now: number, view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    const list = this.env?.().horns;
    if (!list?.length) return;
    const h = now - this.hornAt >= HORN_GAP_MS ? list.find((e) => this.inView(e.x, e.y, view, 24)) : undefined;
    list.length = 0;
    if (!h) return;
    this.hornAt = now;
    emit({ kind: h.kind === 'car' ? 'horn_car' : 'horn_bike', gain: near * (0.6 + this.rng() * 0.4), pan: this.pan(h.x, view) });
  }

  /** What the sim pointed out at a spot (coffee machine, stall, pets, robot beeps...): only what is in view. */
  private officeLife(view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    const list = this.sim.sfx;
    if (!list.length) return;
    for (const e of list) {
      if (this.sim.now - e.at > SFX_STALE_MS) continue;
      const k = SFX_GAIN[e.kind] ?? 1;
      if (this.inView(e.x, e.y, view, 24)) emit({ kind: e.kind, gain: near * k, pan: this.pan(e.x, view) });
      else if (SFX_OFFSCREEN.has(e.kind)) emit({ kind: e.kind, gain: 0.4 * k, pan: this.pan(e.x, view) });
    }
    list.length = 0;
  }

  /** A room party starting (merged PR, achievement, big delivery): party horn and poppers, if the room is in view. */
  private roomParties(view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    const fxs = this.sim.roomFx.active;
    for (const id of this.parties.keys()) if (!fxs.has(id)) this.parties.delete(id);
    for (const [id, fx] of fxs) {
      if (fx.kind !== 'party' || this.parties.get(id) === fx.key) continue;
      const fresh = !this.parties.has(id) ? this.sim.now - fx.start < 2_000 : true;
      this.parties.set(id, fx.key);
      const room = this.sim.rooms.get(id);
      if (!fresh || !room) continue;
      const r = rectPx(slotRect(room.slot));
      const cx = r.x + r.w / 2;
      if (this.inView(cx, r.y + r.h / 2, view, r.w / 2)) emit({ kind: 'party', gain: near, pan: this.pan(cx, view) });
    }
  }

  /**
   * Continuous sounds: the weather outside (rain; wind, softer when it snows) louder the more of the outside is in
   * view, distant thunder now and then while it rains, birds on sunny days, and the robot vacuum's hum when it's in
   * view and running.
   */
  private beds(now: number, view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    if (now - this.bedsAt < BED_TICK_MS) return;
    this.bedsAt = now;
    const robot = this.sim.pets.robot;
    if (robot.dockTile && robot.state !== 'charge' && this.inView(robot.x, robot.y, view, 32)) emit({ kind: 'robot_hum', gain: near * 0.7, pan: this.pan(robot.x, view) });
    // the generator outside during a scheduled power cut: loud next to it, a far putt-putt otherwise
    if (this.sim.generatorRunning) emit({ kind: 'generator', gain: this.inView(GENERATOR.x, GENERATOR.y, view, 48) ? near * 0.8 : 0.25, pan: this.pan(GENERATOR.x, view) });
    const env = this.env?.();
    if (!env) return;
    const outside = this.outsideShare(view);
    const level = 0.35 + 0.65 * outside;
    if (env.weather === 'rain') {
      emit({ kind: 'rain', gain: level, pan: 0 });
      if (!this.nextThunderAt) this.nextThunderAt = now + 8_000 + this.rng() * 25_000;
      else if (now >= this.nextThunderAt) {
        this.nextThunderAt = now + 25_000 + this.rng() * 45_000;
        emit({ kind: 'thunder', gain: 0.5 + this.rng() * 0.5, pan: (this.rng() - 0.5) * 1.2 });
      }
    } else this.nextThunderAt = 0;
    if (env.weather === 'wind' || env.weather === 'snow') emit({ kind: 'wind', gain: level * (env.weather === 'snow' ? 0.4 : 1), pan: 0 });
    if (env.weather === 'clear' && env.night < 0.4 && outside > 0.1) {
      if (!this.nextBirdAt) this.nextBirdAt = now + 2_000 + this.rng() * 6_000;
      else if (now >= this.nextBirdAt) {
        this.nextBirdAt = now + 4_000 + this.rng() * 9_000;
        emit({ kind: 'bird', gain: (0.4 + 0.6 * outside) * near, pan: (this.rng() - 0.5) * 1.2 });
      }
    } else this.nextBirdAt = 0;
  }

  /** Share (0–1) of the view that is outside the building. */
  private outsideShare(v: ViewRect): number {
    const area = Math.max(1, (v.x1 - v.x0) * (v.y1 - v.y0));
    const bw = this.sim.building.cols * COL_W * TILE;
    const bh = BUILDING_H * TILE;
    const ix = Math.max(0, Math.min(v.x1, bw) - Math.max(v.x0, 0));
    const iy = Math.max(0, Math.min(v.y1, bh) - Math.max(v.y0, 0));
    return Math.max(0, Math.min(1, 1 - (ix * iy) / area));
  }

  /**
   * New Year: a whistle when each firework rises and the boom (with crackling) when it opens, panned to where it
   * is on screen; far ones are quieter. The schedule is the drawing's (fireworks.ts).
   */
  private fireworks(now: number, view: ViewRect, emit: (cue: SoundCue) => void): void {
    if (this.sim.newYear.phase !== 'party') {
      this.tubes.length = 0;
      return;
    }
    const building = { x: 0, y: 0, w: this.sim.building.cols * COL_W * TILE, h: BUILDING_H * TILE };
    for (let i = 0; i < FIREWORK_TUBES; i++) {
      const b = fireworkBurst(i, now, building);
      const open = b.p >= FIREWORK_RISE;
      const prev = this.tubes[i];
      this.tubes[i] = { cycle: b.cycle, open };
      // first frame: only remembers (no burst of sounds when the party starts)
      if (!prev) continue;
      const gain = this.inView(b.cx, b.cy, view, 80) ? 1 : 0.45;
      const pan = this.pan(b.cx, view);
      if (b.cycle !== prev.cycle && !open) emit({ kind: 'firework_launch', gain: gain * 0.6, pan });
      if (open && (!prev.open || b.cycle !== prev.cycle)) emit({ kind: 'firework_boom', gain, pan });
    }
  }

  private pan(x: number, v: ViewRect): number {
    const half = Math.max(1, (v.x1 - v.x0) / 2);
    return Math.max(-0.7, Math.min(0.7, ((x - (v.x0 + v.x1) / 2) / half) * 0.7));
  }

  private inView(x: number, y: number, v: ViewRect, m = 16): boolean {
    return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
  }

  /** "Ding" when the door starts opening; off-screen, quieter (still signals that someone arrived). */
  private elevators(view: ViewRect, emit: (cue: SoundCue) => void): void {
    this.sim.elevators.forEach((e, i) => {
      const prev = this.doors[i];
      this.doors[i] = e.door;
      if (prev === undefined || prev > 0.01 || e.door <= 0.01) return;
      const spot = this.sim.spots.get(e.spotId);
      if (!spot) return;
      emit({ kind: 'elevator', gain: this.inView(spot.x, spot.y, view, 24) ? 1 : 0.5, pan: this.pan(spot.x, view) });
    });
  }

  /** Bursts of keystrokes, more frequent the more people are typing on screen. */
  private keys(now: number, view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    if (now - this.keysAt < KEYS_TICK_MS) return;
    this.keysAt = now;
    let n = 0;
    let sx = 0;
    for (const ch of this.sim.chars.values()) {
      if (!typing(ch) || !this.inView(ch.x, ch.y, view)) continue;
      n++;
      sx += ch.x;
    }
    if (!n || now < this.nextKeysAt) return;
    if (this.rng() > Math.min(0.8, 0.3 + 0.12 * n)) return;
    this.nextKeysAt = now + (700 + this.rng() * 1500) / Math.sqrt(Math.min(n, 6));
    emit({ kind: 'keys', gain: near * Math.min(1, 0.6 + 0.1 * n), pan: this.pan(sx / n, view), count: 2 + Math.floor(this.rng() * 5) });
  }

  /** Ping-pong (paddle hits and bounces in the rhythm of the drawn ball) and the arcade. */
  private social(now: number, view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    const alive = new Set<number>();
    for (const g of this.sim.social.gatherings) {
      if (g.phase !== 'run') continue;
      if (g.kind !== 'pingpong' && g.kind !== 'arcade') continue;
      let x = 0;
      let y = 0;
      let k = 0;
      for (const m of g.members) {
        if (m.role !== 'player' || m.left) continue;
        const ch = this.sim.chars.get(m.id);
        if (!ch) continue;
        x += ch.x;
        y += ch.y;
        k++;
      }
      if (!k) continue;
      x /= k;
      y /= k;
      if (!this.inView(x, y, view, 24)) continue;
      if (g.kind === 'pingpong') {
        alive.add(g.id);
        // every half trip: paddle hit (ends) or bounce on the table (middle), as in the drawing
        const seg = Math.floor(((now - g.startAt) % (PINGPONG_PERIOD * 2)) / (PINGPONG_PERIOD / 2));
        const prev = this.rally.get(g.id);
        this.rally.set(g.id, seg);
        if (prev !== undefined && prev !== seg) emit({ kind: seg % 2 === 0 ? 'pingpong' : 'table', gain: near, pan: this.pan(x, view) });
      } else if (now >= this.nextArcadeAt) {
        this.nextArcadeAt = now + 500 + this.rng() * 900;
        emit({ kind: 'arcade', gain: near * 0.8, pan: this.pan(x, view) });
      }
    }
    for (const id of this.rally.keys()) if (!alive.has(id)) this.rally.delete(id);
  }
}

/** Seated at their own desk, typing. */
function typing(ch: Character): boolean {
  return ch.mode === 'work' && ch.seated && ch.pose === 'type' && !ch.leaving && !ch.inside && ch.alpha > 0.5;
}
