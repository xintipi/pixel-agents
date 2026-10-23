// The night security guard (bác bảo vệ ca đêm): after 22:00 an older guard in a khaki-olive uniform and cap walks in
// from the sidewalk with his flashlight, makes a round down the corridor and into the rooms where agents are still at
// the desk, and at each one stops beside them and gently nags them to go home and sleep; the agent answers back. Around
// 23:00 he pulls the roll-up shutter (cửa cuốn) down over the corridor's west glass entrance; whoever still walks
// through that gap at night (back from the hủ tiếu cart, a bike ride home) gets it lifted partway while they pass. Then
// he sits on a plastic stool by the entrance with the flashlight, dozing or reading the paper until ~5:30, and leaves;
// at 6:00 the shutter rolls back up. Purely visual: nothing about the real agents changes. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { Appearance, Dir, HeldItem, IconName, Pose } from '../../art/api';
import { COL_W, CORRIDOR_Y, FOOT_DX, FOOT_DY, TILE } from '../constants';
import type { ExteriorProp } from '../layout/types';
import { facing, type Character } from './character';
import type { Step } from './steps';
import { LANE_Y, STOOL_FOOT_DY, TEA_DOOR, routeToSeat, wayBack } from './tea';

export const GUARD_ID = 'npc:bao-ve';
const GUARD_SEED = 6061;

/** On duty (local, fractional; across midnight): from 22:00 until 5:30. */
export const GUARD_ON_H = 22;
export const GUARD_OFF_H = 5.5;
/** The round only when he walks in before this hour (later he goes straight to the shutter and the stool). */
export const GUARD_ROUND_TO_H = 23;
/** The shutter is down from 23:00 until 6:00. */
export const SHUTTER_DOWN_H = 23;
export const SHUTTER_UP_H = 6;
/** At most this many desks visited a night. */
export const GUARD_MAX_VISITS = 6;
/** He walks in from (and back to) this x (px), off to the west on the sidewalk. */
export const GUARD_FROM_X = -19 * TILE;

/** His post: a corridor tile just inside the entrance, on a plastic stool, facing the shutter. */
export const GUARD_POST = { tx: 2, ty: CORRIDOR_Y + 1 } as const;
export const GUARD_SEAT = { x: GUARD_POST.tx * TILE + FOOT_DX, y: GUARD_POST.ty * TILE + FOOT_DY, dir: 'left' as Dir, color: 0 } as const;

/** Shutter level (0 = rolled up, 1 = down to the floor) while someone walks through the gap: clear of the open panel. */
export const SHUTTER_LIFT = 0.35;
/** Rolling down takes ~2.5 s, lifting for someone ~0.4 s, rolling all the way up in the morning ~3 s. */
const DOWN_PER_S = 1 / 2.5;
const LIFT_PER_S = 1.6;
const OPEN_PER_S = 1 / 3;

/** The guard's uniform: khaki-olive shirt, darker trousers, grey hair and a moustache (the cap is the 'baove' costume). */
export const GUARD_LOOK: Partial<Appearance> = {
  top: '#9a9256',
  topAccent: '#6b6638',
  topStyle: 'shirt_tie',
  bottom: '#4d5230',
  shoes: '#1d2230',
  hair: '#c9c6bd',
  hairStyle: 'short',
  facialHair: 'mustache',
  accessory: 'none',
  lanyard: null,
};

export function guardOnDuty(hour: number): boolean {
  return hour >= GUARD_ON_H || hour < GUARD_OFF_H;
}

export function shutterHours(hour: number): boolean {
  return hour >= SHUTTER_DOWN_H || hour < SHUTTER_UP_H;
}

/** Walking in now, he makes the round of the desks first. */
export function roundHours(hour: number): boolean {
  return hour >= GUARD_ON_H && hour < GUARD_ROUND_TO_H;
}

/** Someone at the west gap (feet, px): just inside the door tile out to the doormat. */
export function nearGap(x: number, y: number): boolean {
  const doorY = TEA_DOOR.ty * TILE + FOOT_DY;
  return x >= -3 * TILE && x < 2 * TILE && Math.abs(y - doorY) <= 1.5 * TILE;
}

/** Where the shutter is heading: up by day, down at night, lifted partway while someone walks through. */
export function shutterTarget(closed: boolean, someoneAtGap: boolean): number {
  if (!closed) return 0;
  return someoneAtGap ? SHUTTER_LIFT : 1;
}

/** One frame of the shutter moving toward `target` (slow down, quick lift for someone, slow all the way up). */
export function shutterStep(level: number, target: number, dt: number): number {
  if (level < target) return Math.min(target, level + DOWN_PER_S * dt);
  if (level > target) return Math.max(target, level - (target > 0 ? LIFT_PER_S : OPEN_PER_S) * dt);
  return level;
}

/** The next desk on the round: the closest one not yet visited tonight. */
export function nextVisit<T extends { id: string; x: number; y: number }>(cands: Iterable<T>, from: { x: number; y: number }, visited: ReadonlySet<string>): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (visited.has(c.id)) continue;
    const d = Math.abs(c.x - from.x) + Math.abs(c.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** The stool at the post while he's on duty. */
export function guardStoolProps(on: boolean): readonly ExteriorProp[] {
  return on ? [{ kind: 'tea_stool', x: GUARD_SEAT.x, y: GUARD_SEAT.y + STOOL_FOOT_DY, seed: GUARD_SEAT.color }] : [];
}

/** Sitting at the post: watching with the flashlight on, reading the paper, or dozing (unless just woken up). */
export function postBlock(rng: () => number, awake: boolean): { pose: Pose; held: HeldItem; ms: number; icon?: IconName } {
  const r = rng();
  const ms = (a: number, b: number) => a + rng() * (b - a);
  if (r < 0.45 || (awake && r < 0.7)) return { pose: 'sit', held: 'flashlight', ms: ms(15_000, 30_000) };
  if (r < 0.7 || awake) return { pose: 'read', held: 'papers', ms: ms(20_000, 40_000) };
  return { pose: 'sleep', held: 'none', ms: ms(30_000, 60_000), icon: 'zzz' };
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** Walking in for the night. */
export function arriveLine(rng: () => number): string {
  return pick(rng, [tr('Evening rounds! 🔦'), tr('Night shift, let me take a look around 🔦')]);
}

/** Beside someone still at the desk. */
export function nagLine(rng: () => number): string {
  return pick(rng, [
    tr("It's late, go home and get some sleep, kid 🌙"),
    tr('Still at it? Go home and rest, kid 🌙'),
    tr("The computer won't run away, go to bed 🌙"),
    tr("Don't stay up too late, health comes first 🌙"),
  ]);
}

/** ...who is napping at the desk: he lets them sleep. */
export function hushLine(rng: () => number): string {
  return pick(rng, [tr('Asleep at the desk again… 🤫'), tr("Poor kid, worn out… I'll let them sleep 🤫")]);
}

/** The agent's answer: working, or idle at the desk. */
export function replyLine(working: boolean, rng: () => number): string {
  return working
    ? pick(rng, [tr('Just one more commit, uncle! 😅'), tr('Almost done, I promise, uncle! 😅'), tr('The build is still running, uncle 😅')])
    : pick(rng, [tr("Yes uncle, I'm heading home soon! 🙏"), tr('Just waiting for a reply, uncle 😅'), tr('Five more minutes, uncle! 🙏')]);
}

/** He sighs at the answer. */
export function sighLine(rng: () => number): string {
  return pick(rng, [tr('You young ones… 😮‍💨'), tr("Alright, but don't forget to turn off the lights 💡")]);
}

/** Pulling the shutter down. */
export function shutterLine(rng: () => number): string {
  return pick(rng, [tr('Closing up for the night! 🔒'), tr('Down comes the shutter 🔒')]);
}

/** Lifting it for someone at night. */
export function passLine(rng: () => number): string {
  return pick(rng, [tr('Mind your head, kid! 🔦'), tr('Out this late? Careful now 🔦')]);
}

/** Leaving at dawn. */
export function byeLine(rng: () => number): string {
  return pick(rng, [tr('Morning already, home I go 🌅'), tr('Shift over, have a good day 🌅')]);
}

/** What the simulation lends the guard (sim/sim.ts). */
export interface GuardHost {
  now(): number;
  visit(): boolean;
  hour(now: number): number;
  extras(): Character[];
  chars(): Iterable<Character>;
  people(): Iterable<Character>;
  /** A walkable tile next to `target`, closest to `from`. */
  besideTile(target: Character, from: Character): { x: number; y: number };
  say(ch: Character, text: string): void;
  /** A street character (not an agent) with the seed's look plus `patch`; null if the art fails. */
  npc(id: string, name: string, look: 'f' | 'm', seed: number, patch: Partial<Appearance>): Character | null;
  /** Building width (columns): the round walks to the east end of the corridor. */
  cols(): number;
}

/** An agent still at the desk (working, waiting or idle): the round visits them. */
function atDesk(c: Character): boolean {
  return !c.leaving && !c.gone && !c.outdoors && !c.inside && !!c.homeSpot && c.atSpot === c.homeSpot;
}

/** The guard and the shutter. Runs `update` once a second and `tick` every frame. */
export class NightGuard {
  /** How far the shutter is down (0 = rolled up, 1 = down to the floor); the renderer draws it. */
  shutter = 0;
  /** The shutter is down for the night (the guard pulled it, or it was already down when the page opened). */
  closed = false;
  /** Debug: shutter forced down (true) or up (false); null = the night's schedule. */
  shutterOverride: boolean | null = null;
  /** Someone is walking through the gap right now (the shutter is lifted for them). */
  passing = false;
  private forcedUntil = 0;
  private readonly visited = new Set<string>();
  private lastUpdate = -1e15;
  private seated = false;
  /** Walking off at dawn: only then does he lift the shutter for himself (his post is right by it). */
  private leaving = false;
  private awakeUntil = 0;
  private passSaidAt = -1e15;

  constructor(private readonly host: GuardHost) {}

  /** The guard, while he's around. */
  get guard(): Character | undefined {
    return this.host.extras().find((e) => e.id === GUARD_ID && !e.gone);
  }

  private onDuty(now: number): boolean {
    return guardOnDuty(this.host.hour(now)) || now < this.forcedUntil;
  }

  /** Once a second: the shutter's schedule, the guard walking in, his next block, waking up for whoever passes. */
  update(now: number): void {
    const h = this.host;
    if (h.visit()) return;
    // page just opened (or back from a long hidden tab): everything as it would be by now
    const snap = now - this.lastUpdate > 10_000;
    this.lastUpdate = now;
    const hour = h.hour(now);
    const duty = this.onDuty(now);
    if (!duty) this.visited.clear();
    let g = this.guard;
    if (duty && !g) g = this.spawn(snap && now >= this.forcedUntil, roundHours(hour) || now < this.forcedUntil) ?? undefined;
    if (this.shutterOverride !== null) this.closed = this.shutterOverride;
    else if (!shutterHours(hour)) this.closed = false;
    else if (snap || !g) {
      this.closed = true;
      if (snap) this.shutter = 1;
    }
    if (!g) return;
    if (this.passing && this.seated && now - this.passSaidAt > 30_000) {
      // someone at the shutter: he wakes up and looks
      this.passSaidAt = now;
      this.awakeUntil = now + 60_000;
      if (g.pose === 'sleep') {
        g.step = null;
        g.queue.length = 0;
        g.setIcon(null, 0, now);
      }
      if (g.rng() < 0.6) h.say(g, passLine(g.rng));
      else {
        g.chatEmoji = '👀';
        g.chatUntil = now + 1_500;
      }
    }
    // time to pull the shutter (or to go home): he gets up from the stool right away
    const due = !duty || (shutterHours(hour) && !this.closed && this.shutterOverride === null);
    if (due && this.seated && g.step?.t === 'act' && !g.queue.length) {
      g.step = null;
      g.setIcon(null, 0, now);
    }
    if (!g.step && !g.queue.length) this.plan(g, now, duty, hour);
  }

  /** Every frame: the shutter rolls toward where it's heading (lifted while someone walks through the gap). */
  tick(dt: number): void {
    if (this.host.visit()) {
      this.shutter = 0;
      return;
    }
    let near = false;
    if (this.closed) {
      for (const p of this.host.people()) {
        if (p.inside || p.alpha < 0.3 || (p.id === GUARD_ID && !this.leaving)) continue;
        if (nearGap(p.x, p.y)) {
          near = true;
          break;
        }
      }
    }
    this.passing = near;
    this.shutter = shutterStep(this.shutter, shutterTarget(this.closed, near), dt);
  }

  /** Debug: the guard comes now for a round of the desks (whatever the hour) and stays on duty a few minutes. */
  guardNow(): boolean {
    const now = this.host.now();
    if (this.host.visit()) return false;
    this.forcedUntil = now + 5 * 60_000;
    this.visited.clear();
    const g = this.guard;
    if (!g) return !!this.spawn(false, true);
    // out on the sidewalk (walking in or off): let him be; walking off, the next one comes in for the round
    if (g.step?.t === 'route' || g.queue.some((s) => s.t === 'route')) return true;
    g.step = null;
    g.queue.length = 0;
    if (this.seated) g.queue.push(this.standUp(g));
    this.pushRound(g);
    return true;
  }

  /** Debug: shutter down (true) or up (false) now; null goes back to the night's schedule. */
  shutterNow(down: boolean | null): void {
    this.shutterOverride = down;
    if (down !== null) this.closed = down;
  }

  /** Stool at the post (while he's around). */
  props(): readonly ExteriorProp[] {
    return guardStoolProps(!!this.guard);
  }

  private spawn(atPost: boolean, round: boolean): Character | null {
    const ch = this.host.npc(GUARD_ID, tr('Night guard'), 'm', GUARD_SEED, GUARD_LOOK);
    if (!ch) return null;
    ch.costume = 'baove';
    this.seated = false;
    this.leaving = false;
    if (atPost) {
      ch.placeAtTile(GUARD_POST.tx, GUARD_POST.ty);
      this.sit(ch);
    } else {
      ch.x = GUARD_FROM_X;
      ch.y = LANE_Y;
      ch.dir = 'right';
      ch.queue.push(
        { t: 'route', pts: wayBack(routeToSeat({ x: GUARD_FROM_X, y: LANE_Y })), held: 'flashlight', trail: 'back' },
        { t: 'do', fn: () => this.host.say(ch, arriveLine(ch.rng)) },
      );
      if (round) this.pushRound(ch);
    }
    this.host.extras().push(ch);
    return ch;
  }

  /** The round: down the corridor to the east end, then desk by desk (the closest next) back toward the entrance. */
  private pushRound(g: Character): void {
    g.queue.push({ t: 'go', tx: this.host.cols() * COL_W - 3, ty: TEA_DOOR.ty, held: 'flashlight' }, { t: 'do', fn: () => this.visitNext(g) });
  }

  private visitNext(g: Character): void {
    if (this.visited.size >= GUARD_MAX_VISITS) return;
    const desks: Character[] = [];
    for (const c of this.host.chars()) if (atDesk(c)) desks.push(c);
    const c = nextVisit(desks, g, this.visited);
    if (!c) return;
    this.visited.add(c.id);
    const at = this.host.besideTile(c, g);
    const rng = g.rng;
    let hushed = false;
    g.queue.unshift(
      { t: 'go', tx: at.x, ty: at.y, held: 'flashlight' },
      {
        t: 'do',
        fn: () => {
          g.dir = facing(g.x, g.y, c.x, c.y);
          if (!atDesk(c)) {
            g.chatEmoji = '🤷';
            g.chatUntil = this.host.now() + 1_200;
            return;
          }
          hushed = c.pose === 'sleep';
          this.host.say(g, hushed ? hushLine(rng) : nagLine(rng));
        },
      },
      { t: 'act', pose: 'stand', held: 'flashlight', ms: 2_600 },
      {
        t: 'do',
        fn: () => {
          if (hushed || !atDesk(c)) return;
          this.host.say(c, replyLine(c.mode === 'work' || c.mode === 'shell', c.rng));
        },
      },
      { t: 'act', pose: 'stand', held: 'flashlight', ms: 2_800 },
      {
        t: 'do',
        fn: () => {
          if (!hushed && atDesk(c) && rng() < 0.5) this.host.say(g, sighLine(rng));
        },
      },
      { t: 'act', pose: 'stand', held: 'flashlight', ms: 1_200 },
      { t: 'do', fn: () => this.visitNext(g) },
    );
  }

  /** What's next when his queue runs out: leave at dawn, pull the shutter at 23:00, otherwise a while at the post. */
  private plan(g: Character, now: number, duty: boolean, hour: number): void {
    if (!duty) {
      this.leaving = true;
      if (this.seated) g.queue.push(this.standUp(g));
      g.queue.push(
        { t: 'go', tx: TEA_DOOR.tx, ty: TEA_DOOR.ty, held: 'flashlight' },
        { t: 'do', fn: () => this.host.say(g, byeLine(g.rng)) },
        { t: 'route', pts: routeToSeat({ x: GUARD_FROM_X, y: LANE_Y }), held: 'flashlight' },
        { t: 'remove' },
      );
      return;
    }
    if (shutterHours(hour) && !this.closed && this.shutterOverride === null) {
      if (this.seated) g.queue.push(this.standUp(g));
      g.queue.push(
        { t: 'go', tx: TEA_DOOR.tx, ty: TEA_DOOR.ty, held: 'flashlight' },
        {
          t: 'do',
          fn: () => {
            this.closed = true;
            this.host.say(g, shutterLine(g.rng));
          },
        },
        { t: 'act', pose: 'use', dir: 'left', ms: 2_800 },
      );
      return;
    }
    if (!this.seated) {
      g.queue.push(
        { t: 'go', tx: GUARD_POST.tx, ty: GUARD_POST.ty, fx: GUARD_SEAT.x, fy: GUARD_SEAT.y, dir: GUARD_SEAT.dir, held: 'flashlight' },
        { t: 'do', fn: () => this.sit(g) },
      );
    }
    const b = postBlock(g.rng, now < this.awakeUntil);
    g.queue.push({ t: 'act', pose: b.pose, held: b.held, dir: GUARD_SEAT.dir, icon: b.icon, ms: b.ms });
  }

  private sit(g: Character): void {
    this.seated = true;
    g.x = GUARD_SEAT.x;
    g.y = GUARD_SEAT.y;
    g.dir = GUARD_SEAT.dir;
    g.seated = true;
    g.sortY = GUARD_SEAT.y + STOOL_FOOT_DY + 0.25;
    g.setPose('sit', 'flashlight');
  }

  private standUp(g: Character): Step {
    return {
      t: 'do',
      fn: () => {
        this.seated = false;
        g.seated = false;
        g.sortY = null;
        g.setIcon(null, 0, this.host.now());
      },
    };
  }
}
