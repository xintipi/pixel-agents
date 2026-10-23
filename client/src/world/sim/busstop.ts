// The people at the bus stop across the street (sim/bus.ts has the stop and the timetable, sim/traffic.ts drives the
// bus): passers-by walk up over time and wait (on the bench, scrolling the phone, looking down the street for it); when
// the bus opens its doors they line up and get on, and a few others step off and walk away to either end of the
// sidewalk. Now and then someone comes running after it ("Wait for me, uncle!"): sometimes the driver waits, sometimes
// it pulls away without them and they grumble and wait for the next one. The street holds the bus while anyone is still
// getting on or off (`hold`). Street characters only (never the agents). Pure (no DOM).
import type { AgentInfo } from '../../../../shared/types';
import type { Appearance } from '../../art/api';
import { tr } from '../../../../shared/i18n';
import {
  BUS_CHASE_CHANCE,
  BUS_DOOR,
  BUS_DWELL_MS,
  BUS_RIDER_CHANCE,
  BUS_RIDER_RUSH,
  BUS_SEAT_DEPTH,
  BUS_SPOTS,
  BUS_TO_H,
  BUS_WAIT_CHANCE,
  BUS_WALK_Y,
  busRouteIn,
  busRouteOff,
  busRouteToDoor,
  busRuns,
  caughtLine,
  chaseLine,
  lastBusLine,
  missedLine,
  waitLine,
  type BusAt,
  type BusPhase,
} from './bus';
import { Character } from './character';
import type { Step } from './steps';
import { Stall } from './tea';

/** What the stop needs from the sim. */
export interface BusHost {
  readonly extras: Character[];
  appearance(seed: number, look: 'f' | 'm'): Appearance;
  npc(id: string, name: string, look: 'f' | 'm', seed: number, now: number): AgentInfo;
  say(ch: Character, text: string, now: number): void;
  now(): number;
  /** Local hour (fractional) and how busy the street is (0–1). */
  hour(now: number): number;
  rush(now: number): number;
  /** Where the far sidewalk begins and ends (px). */
  ends(): { west: number; east: number };
  /** No street life now (a visit to someone else's office). */
  quiet(): boolean;
}

/** Id prefix of the people at the stop. */
export const BUS_RIDER_ID = 'npc:bus:';
/** At most this many waiting at once (the spots), and how many step off a bus at most. */
const MAX_OFF = 3;
/** Between two people stepping off, and between two getting on (ms). */
const OFF_GAP_MS = 900;
const ON_GAP_MS = 650;

export class BusStop {
  /** Places at the stop (index -> who). */
  readonly spots = new Stall(BUS_SPOTS.length);
  /** The bus this frame (the renderer passes on what the street says). */
  bus: BusAt | null = null;
  /** Walking to the front door right now. */
  private readonly boarding = new Set<string>();
  /** Still to step off this bus, and when the next one does (ms). */
  private offLeft = 0;
  private nextOffAt = 0;
  /** This bus's chaser: planned (and whether the driver waits), on the way, done. */
  private chase: { waited: boolean; id: string | null; done: boolean } | null = null;
  private openSince = 0;
  private wasOpen = false;
  private lastPhase: BusPhase | null = null;
  private seq = 0;
  /** debug.busNow: the next bus gets a runner for sure, waited for ('wait') or not ('miss'). */
  chaseNext: 'wait' | 'miss' | null = null;
  /** People who got on / off since the start (for the tests). */
  boarded = 0;
  alighted = 0;

  constructor(private readonly host: BusHost) {}

  /** The street must keep the bus at the stop: someone is getting on or off, or the driver waits for a runner. */
  get hold(): boolean {
    return this.boarding.size > 0 || (this.offLeft > 0 && !!this.bus?.doorsOpen) || (!!this.chase?.waited && !!this.chase.id && !this.chase.done);
  }

  /** Every frame (after the street moved): the bus's arrival, the doors, those stepping off, the runner. */
  frame(now: number): void {
    const bus = this.bus;
    const phase = bus?.phase ?? null;
    if (phase !== this.lastPhase) {
      // a new bus pulling in: will anyone come running after it?
      if (phase === 'pulling' || (phase === 'stopped' && this.lastPhase !== 'pulling')) {
        const rng = Math.random;
        const forced = this.chaseNext;
        this.chaseNext = null;
        if (forced) this.chase = { waited: forced === 'wait', id: null, done: false };
        else this.chase = !this.host.quiet() && rng() < BUS_CHASE_CHANCE ? { waited: rng() < BUS_WAIT_CHANCE, id: null, done: false } : null;
        this.offLeft = Math.floor(Math.random() * (MAX_OFF + 1));
      }
      if (phase === null || phase === 'coming') this.chase = null;
      this.lastPhase = phase;
    }
    const open = !!bus?.doorsOpen;
    if (open && !this.wasOpen) {
      this.openSince = now;
      this.nextOffAt = now + 300;
    }
    if (!bus || bus.phase === 'leaving' || bus.phase === 'coming') this.offLeft = 0;
    // the doors closing on the one the driver doesn't wait for: here they come, too late
    const closing = this.wasOpen && !open && bus?.phase === 'stopped';
    this.wasOpen = open;
    if (this.host.quiet()) return;
    if (open && this.offLeft > 0 && now >= this.nextOffAt) {
      this.offLeft--;
      this.nextOffAt = now + OFF_GAP_MS;
      this.spawnOff(now);
    }
    const c = this.chase;
    if (c && !c.id && !c.done) {
      // the driver sees them in the mirror just before closing the doors, and waits
      if (c.waited && open && now - this.openSince > BUS_DWELL_MS - 1_500) this.spawnChaser(now, 250);
      else if (!c.waited && closing) this.spawnChaser(now, 170);
    }
    // the runner is gone some other way (the tab came back): don't hold the bus for them
    if (c?.id && !c.done && !this.host.extras.some((e) => e.id === c.id && !e.gone)) c.done = true;
  }

  /** New people walk up to wait on their own (the tests turn it off to count exactly who's there). */
  arrivals = true;

  /** Once a second: now and then someone walks up to wait, and someone waiting grumbles. */
  tick(now: number): void {
    if (this.host.quiet()) return;
    const hour = this.host.hour(now);
    const waiting = this.waiting();
    if (waiting.length && Math.random() < 0.02) {
      const who = waiting[Math.floor(Math.random() * waiting.length)];
      if (who.sayUntil <= now) this.host.say(who, waitLine(who.rng), now);
    }
    // the last bus is around 21:00: nobody starts waiting after 20:45
    if (!this.arrivals || !busRuns(hour) || hour > BUS_TO_H - 0.25 || !this.spots.hasFree()) return;

    if (Math.random() < BUS_RIDER_CHANCE + BUS_RIDER_RUSH * this.host.rush(now)) this.spawnWaiter(now, false);
  }

  /** Those waiting at the stop now (sitting or standing at their spot). */
  waiting(): Character[] {
    const ids = this.spots.sitting();
    return this.host.extras.filter((e) => ids.includes(e.id) && !e.gone);
  }

  /** Debug: `n` people waiting at the stop right away (already there). Returns how many. */
  ridersNow(n: number, now: number): number {
    let k = 0;
    for (let i = 0; i < n && this.spots.hasFree(); i++) if (this.spawnWaiter(now, true)) k++;
    return k;
  }

  /** The tab came back (everyone outside is gone): start over. */
  reset(): void {
    this.spots.clear();
    this.boarding.clear();
    this.offLeft = 0;
    this.chase = null;
    this.wasOpen = false;
    this.lastPhase = null;
    this.bus = null;
  }

  private person(now: number, name: string): Character | null {
    const n = ++this.seq;
    const seed = 52_000 + n * 131;
    const look = seed % 2 ? 'f' : 'm';
    let appearance: Appearance;
    try {
      appearance = { ...this.host.appearance(seed, look), lanyard: null };
    } catch {
      return null;
    }
    const ch = new Character(this.host.npc(`${BUS_RIDER_ID}${n}`, name, look, seed, now), appearance);
    ch.crowd = true;
    return ch;
  }

  /** Someone walks up from one end of the sidewalk (or is already there: `there`) to a free spot and waits. */
  private spawnWaiter(now: number, there: boolean): boolean {
    const ch = this.person(now, tr('Passer-by'));
    if (!ch) return false;
    const i = this.spots.reserve(ch.id, Math.random);
    if (i < 0) return false;
    const spot = BUS_SPOTS[i];
    const { west, east } = this.host.ends();
    const fromWest = Math.random() < 0.5;
    if (there) {
      ch.x = spot.x;
      ch.y = spot.y;
      ch.dir = spot.dir;
      ch.queue.push(...this.waitAt(ch, i));
    } else {
      const pts = busRouteIn(fromWest ? west : east, spot);
      ch.x = pts[0];
      ch.y = pts[1];
      ch.dir = fromWest ? 'right' : 'left';
      ch.queue.push({ t: 'route', pts }, ...this.waitAt(ch, i));
    }
    this.host.extras.push(ch);
    return true;
  }

  /** At spot `i`: sits on the bench or stands, phone or eyes down the street, until the doors open (or service ends). */
  private waitAt(ch: Character, i: number): Step[] {
    const spot = BUS_SPOTS[i];
    const phone = ch.rng() < 0.55;
    return [
      {
        t: 'do',
        fn: () => {
          this.spots.sit(i, ch.id);
          ch.dir = spot.dir;
          if (spot.seat) {
            ch.seated = true;
            ch.sortY = BUS_SEAT_DEPTH;
          }
        },
      },
      {
        t: 'until',
        cond: () => !!this.bus?.doorsOpen || this.serviceOver(),
        minMs: 1_500,
        maxMs: 45 * 60_000,
        // standing without the phone: looking east, where the bus comes from
        pose: phone ? 'read' : spot.seat ? 'sit' : 'stand',
        held: phone ? 'phone' : 'none',
        dir: phone || spot.seat ? spot.dir : 'right',
      },
      {
        t: 'do',
        fn: () => {
          this.spots.release(ch.id);
          ch.seated = false;
          ch.sortY = null;
          if (this.bus?.doorsOpen) {
            // in line: one after the other
            const rank = this.boarding.size;
            this.boarding.add(ch.id);
            ch.queue.unshift({ t: 'act', pose: 'stand', dir: 'up', ms: 200 + rank * ON_GAP_MS }, { t: 'route', pts: busRouteToDoor(ch) }, { t: 'do', fn: () => this.atDoor(ch, false) });
            return;
          }
          // waited for nothing (after the last bus, or far too long): walks off
          this.host.say(ch, lastBusLine(ch.rng), this.host.now());
          const { west, east } = this.host.ends();
          const to = ch.rng() < 0.5 ? west : east;
          ch.queue.unshift({ t: 'route', pts: [ch.x, BUS_WALK_Y, to, BUS_WALK_Y] }, { t: 'remove' });
        },
      },
    ];
  }

  /** At the front door: on board if it's still open, otherwise missed it (grumbles, waits for the next one). */
  private atDoor(ch: Character, chaser: boolean): void {
    this.boarding.delete(ch.id);
    const now = this.host.now();
    if (this.bus?.doorsOpen) {
      this.boarded++;
      if (chaser) {
        this.host.say(ch, caughtLine(ch.rng), now);
        ch.queue.unshift({ t: 'act', pose: 'stand', dir: 'up', ms: 900 }, { t: 'do', fn: () => this.chaserDone(ch) }, { t: 'remove' });
      } else ch.queue.unshift({ t: 'remove' });
      return;
    }
    this.host.say(ch, missedLine(ch.rng), now);
    const after: Step[] = [{ t: 'act', pose: 'stand', dir: 'left', ms: 2_000 }, { t: 'do', fn: () => this.chaserDone(ch) }];
    const i = this.spots.reserve(ch.id, ch.rng);
    if (i >= 0) after.push({ t: 'route', pts: busRouteIn(ch.x, BUS_SPOTS[i]).slice(2) }, ...this.waitAt(ch, i));
    else {
      const { west, east } = this.host.ends();
      after.push({ t: 'route', pts: [ch.x, BUS_WALK_Y, ch.rng() < 0.5 ? west : east, BUS_WALK_Y] }, { t: 'remove' });
    }
    ch.queue.unshift(...after);
  }

  private chaserDone(ch: Character): void {
    if (this.chase?.id === ch.id) this.chase.done = true;
  }

  /** Someone stepping down from the middle door, off to one end of the sidewalk. */
  private spawnOff(now: number): void {
    const ch = this.person(now, tr('Passer-by'));
    if (!ch) return;
    const { west, east } = this.host.ends();
    const pts = busRouteOff(Math.random() < 0.5 ? west : east, Math.round(Math.random() * 6) - 3);
    ch.x = pts[0];
    ch.y = pts[1];
    ch.dir = 'down';
    ch.queue.push({ t: 'route', pts }, { t: 'remove' });
    this.alighted++;
    this.host.extras.push(ch);
  }

  /** Late: comes running along the sidewalk from `dist` px away, shouting, to the front door. */
  private spawnChaser(now: number, dist: number): void {
    const c = this.chase;
    if (!c) return;
    const ch = this.person(now, tr('Passer-by'));
    if (!ch) {
      c.done = true;
      return;
    }
    c.id = ch.id;
    const fromWest = Math.random() < 0.4;
    const x = BUS_DOOR.x + (fromWest ? -dist : dist);
    ch.x = x;
    ch.y = BUS_WALK_Y;
    ch.dir = fromWest ? 'right' : 'left';
    ch.queue.push(
      { t: 'do', fn: () => this.host.say(ch, chaseLine(ch.rng), this.host.now()) },
      { t: 'route', run: true, pts: [x, BUS_WALK_Y, BUS_DOOR.x + (fromWest ? -4 : 4), BUS_WALK_Y - 6, BUS_DOOR.x, BUS_DOOR.y] },
      { t: 'do', fn: () => this.atDoor(ch, true) },
    );
    this.host.extras.push(ch);
  }

  private serviceOver(): boolean {
    return !busRuns(this.host.hour(this.host.now())) && !this.bus;
  }
}
