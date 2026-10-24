// Street traffic in front of the building: a few cars all day and, at rush hour (7:00–8:30 and 17:00–18:45, local), a
// flood of motorbikes that bunch up in stop-and-go jams, honk and, on the westbound side, hop onto the far sidewalk to
// get past (the near sidewalk has the tea stall and the bánh mì cart). Rain at rush hour floods the street: the water
// rises over ~10 minutes, everyone crawls through it, some bikes stall and get pushed, and it drains over ~20 minutes
// once the rain or the rush is over. Some bikes carry things on the rack (a water jug, foam boxes, a potted plant;
// flowers on the flower holidays, peach branches before Tết), and on the first days of Tết the street is empty.
// Agents who come to work by motorbike ride in from the west, park on the near sidewalk (west of the stone path) and
// ride off again when their session ends: their bikes are owned vehicles (`owner`) the sim asks for. Now and then a
// eastbound bike gets a flat: the rider pushes it up to the repair stall on the near sidewalk, waits, and rides on.
// Pure (no DOM): the renderer steps and draws it, the sound cues drain the horns.
import { tr } from '../../../../shared/i18n';
import { TILE } from '../constants';
import { BUS_CLOSE_MS, BUS_DOOR_MS, BUS_DWELL_MS, BUS_HALF, BUS_HOLD_MAX_MS, BUS_PARK, BUS_ROUTES, BUS_SPEED, BUS_STOP_X, busGapMs, busRuns, type BusAt } from './bus';
import { REPAIR_SPOT, repairOpen } from './repair';
import { ACCIDENT_T, AccidentClock, accidentAllowed, accidentStage, detourY, obstacleGap, sceneObstacle, type AccidentScene, type Obstacle } from './accident';

export type VehicleKind = 'car' | 'bike';
/** What a bike carries on its rear rack. */
export type Cargo = 'water' | 'foam' | 'plant' | 'flowers' | 'peach';

/** The calendar as the street sees it: the days before Tết, its first three days, the flower holidays. */
export interface StreetDay {
  tet?: 'before' | 'holiday';
  flowers?: boolean;
}

export interface Vehicle {
  kind: VehicleKind;
  /** Bottom center (px). */
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  /** Cruising speed (px/s) on a free road. */
  want: number;
  /** Lane line it belongs to (px) and where it is drifting to (weaving, the sidewalk). */
  laneY: number;
  ty: number;
  variant: number;
  /** Bike: the rider alone or with a passenger behind. */
  riders: 1 | 2;
  /** Seconds crawling well below the cruising speed (horns, weaving, climbing the sidewalk). */
  stuck: number;
  /** On the far sidewalk: px left to ride there before trying to get back down. */
  sidewalk: number;
  /** Bike: stalled in the flood, the rider walks beside it pushing. */
  pushing?: boolean;
  /** Bike: what's tied to the rack (riders alone only). */
  cargo?: Cargo;
  /** A xe ôm driver waiting on the far sidewalk (the renderer's, not in the traffic). */
  parked?: boolean;
  /** An agent's own bike (character id): riding in to park, parked while they work, riding off. */
  owner?: string;
  phase?: 'arrive' | 'parked' | 'leave' | 'repair';
  /** Where an owned bike parks, or where a bike with a flat gets fixed (bottom center, px). */
  park?: { x: number; y: number };
  /** A flat tire: pushed to the repair stall, fixed there until `until` (ms), then rides on. */
  repair?: boolean;
  until?: number;
  /** Whistled off the far sidewalk by the traffic police (once is enough). */
  caught?: boolean;
  /** A racing boy: way too fast, weaving through the traffic and over the center line, honking all the way. */
  racer?: boolean;
  /** Last time this vehicle honked at a racing boy cutting past it (ms). */
  startled?: number;
  /**
   * Pulled over at a sidewalk stall (the call's tag: 'hutieu', 'tea', 'banhmi'): parked with nobody on it while the
   * rider eats, or with the rider still on it when `dinerStays` (a bánh mì to go, handed over at the curb).
   */
  diner?: string;
  dinerStays?: boolean;
  /** A city bus (sim/bus.ts; a long 'car'): its route number. It pulls over at the stop once (`served`). */
  bus?: string;
  served?: boolean;
  /** Bus: when it stopped at the curb, and when the doors started closing (ms). */
  since?: number;
  closing?: number;
  /** An ambulance (a 'car' with a light bar; sim/accident.ts) and whether its siren is on. */
  ambulance?: boolean;
  siren?: boolean;
  /** Hit a bike in a crash: stopped until `until` (ms), a bike's rider off it (the sim walks them) while `riderOff`. */
  hit?: boolean;
  riderOff?: boolean;
  /** Going around an accident through the oncoming lane, until back in its own past the scene. */
  detour?: boolean;
}

/** How long a call for a rider to pull over waits for a fitting bike (ms). */
export const DINER_CALL_MS = 120_000;

/** A sidewalk stall wants a rider to pull over and park at (x, y) until `until` (ms); `stays`: without getting off. */

export interface DinerCall {
  x: number;
  y: number;
  until: number;
  tag: string;
  stays?: boolean;
}

/** Helmet colors of the riders (the renderer draws them; the sim dresses a rider who gets off the same way). */
export const RIDER_HELMETS = ['#e8454a', '#f2c94c', '#3d7ce0', '#f4f4f0', '#e98ad0', '#4cbf7a', '#2e3648', '#f08a3c'] as const;

/** The appearance seed and look of a passing bike's rider (`i` = 0 for the rider, 1 for a passenger). */
export function riderSeed(variant: number, i = 0): { seed: number; look: 'f' | 'm'; helmet: string } {
  const seed = variant * 7 + i * 1013;
  return { seed, look: seed % 2 ? 'f' : 'm', helmet: RIDER_HELMETS[seed % RIDER_HELMETS.length] };
}

/** A racing boy whizzing past, for the people on the sidewalks to react (`police`: right past the officer). */
export interface RacerEvent {
  x: number;
  y: number;
  at: number;
  police?: boolean;
}

/**
 * When racing boys ride, fitted into the street's day: mostly at night once the street empties (after the evening
 * dance and the bánh bao bike, while the hủ tiếu cart is out), now and then in the quiet stretches between the rush
 * hours; never at rush hour (the jam, the traffic police), over lunch and the siesta, late at night or at Tết.
 * Each window: from, to (local hours) and the gap between two of them (s).
 */
export const RACER_WINDOWS: readonly { from: number; to: number; gap: readonly [number, number] }[] = [
  { from: 10, to: 11.5, gap: [720, 1200] },
  { from: 14, to: 16, gap: [720, 1200] },
  { from: 21, to: 23.5, gap: [180, 360] },
];
/** How fast they ride (px/s). */
const RACER_SPEED: readonly [number, number] = [150, 190];

/** The racing window this hour is in, or null. */
export function racerWindow(hour: number): (typeof RACER_WINDOWS)[number] | null {
  return RACER_WINDOWS.find((w) => hour >= w.from && hour < w.to) ?? null;
}
/** They start weaving when the gap ahead drops below this (px). */
const RACER_WEAVE_GAP = 60;
/** A racing boy reports where they are this often (ms), for the sidewalk to react. */
const RACER_EVENT_MS = 500;

/**
 * Parking spots for the agents' bikes: on the near sidewalk, west of the stone path, clear of the lamp posts (the tea
 * stall and the bánh mì cart are east of the path). Bottom center (px), wheels just above the curb.
 */
export const PARKING: readonly { x: number; y: number }[] = [-56, -132, -166, -200, -234].map((x) => ({ x, y: 32 * TILE + 14 }));

export interface Horn {
  kind: VehicleKind;
  x: number;
  y: number;
  at: number;
}

export interface TrafficEnv {
  /** Where vehicles appear and vanish (px). */
  x0: number;
  x1: number;
  lanes: readonly { y: number; dir: 1 | -1 }[];
  /** Top of the far sidewalk (px), below the westbound lane. */
  sidewalkY: number;
  /** The zebra crossing (px), where the traffic police stand and hold the traffic. */
  crossing?: { x: number; w: number };
}

/** Traffic police (sim/police.ts): wanted once the street has been jammed this long (s)... */
const JAM_S = 8;
/** ...and sent home after this long (s) with the street flowing again (or when the rush is over). */
const CALM_S = 40;
/** A jam: at least this many vehicles on the street at rush hour; flowing again: fewer than this. */
const JAM_VEHICLES = 30;
const CALM_VEHICLES = 20;
/** Each direction gets this long (ms) before the officer turns to the other one. */
export const POLICE_PHASE_MS = 12_000;
/** The held direction stops this far (px) before the crossing. */
const STOP_BACK = 10;
/** Bikes on the far sidewalk this close (px) to the officer get whistled back down. */
const CATCH_R = 200;

/** The traffic police as the street sees them. */
export interface PoliceState {
  /** The street is jammed enough to want an officer (the sim sends one, or calls them back). */
  wanted: boolean;
  /** debug.policeNow: true = wanted now, false = not, null = the street decides. */
  forced: boolean | null;
  /** The officer is standing at the crossing (the sim says): only then is the traffic held. */
  onPost: boolean;
  /** Which direction is held now (1 = eastbound, -1 = westbound) and until when (ms). */
  hold: 1 | -1;
  holdUntil: number;
  /** Someone is walking on the crossing (the renderer says): both directions wait. */
  walkers: boolean;
  /** Bikes whistled off the sidewalk since the sim last looked (it empties it). */
  catches: number;
  jamFor: number;
  calmFor: number;
}

/** Half the length (px) of each kind, bumper to bumper. */
const HALF: Readonly<Record<VehicleKind, number>> = { car: 29, bike: 13 };
/** ...of this vehicle (a bus is longer than a car). */
function half(v: Vehicle): number {
  return v.bus ? BUS_HALF : HALF[v.kind];
}
/** Bikes spread across their lane: this far above/below the lane line (px), room enough to squeeze past a car. */
const BAND_UP = 15;
const BAND_DOWN = 6;
/** Two bikes this far apart in y ride side by side; a bike this far from a car's line gets past it. */
const SIDE_BY_SIDE = 7;
const CAR_WIDTH = 10;
/** Comfort gap (px) kept to the vehicle ahead, and how fast the speed follows the gap (1/s). */
const MIN_GAP = 3;
const GAP_GAIN = 2.2;
const ACCEL: Readonly<Record<VehicleKind, number>> = { car: 28, bike: 45 };
const BRAKE = 160;
/** Sideways drift (px/s) when weaving or climbing the curb. */
const DRIFT = 14;
/** Never more than this many vehicles at once. */
export const MAX_VEHICLES = 44;
/** Flood: seconds to fill up (rain at rush hour) and to drain; above FLOODED people stop going out to the sidewalk. */
const FLOOD_RISE_S = 600;
const FLOOD_DRAIN_S = 1_200;
export const FLOODED = 0.35;
/** Pushing a stalled bike through the water (px/s). */
const PUSH_SPEED = 11;
/** Horns not heard within this long are dropped (sound off, hidden tab). */
const HORN_STALE_MS = 1_500;
const MAX_HORNS = 8;

/** Rush hour peaks (local, fractional): ramp up, full, ramp down. */
const PEAKS: readonly (readonly [number, number, number, number])[] = [
  [6.5, 7, 8.5, 9],
  [16.5, 17, 18.75, 19.25],
];

/** How busy the street is (0 = quiet, 1 = full rush hour), by hour and weekday (0 = Sunday); weekends are lighter. */
export function rushLevel(hour: number, day: number): number {
  let level = 0;
  for (const [a, b, c, d] of PEAKS) {
    if (hour >= b && hour <= c) level = 1;
    else if (hour > a && hour < b) level = Math.max(level, (hour - a) / (b - a));
    else if (hour > c && hour < d) level = Math.max(level, (d - hour) / (d - c));
  }
  return day === 0 || day === 6 ? level * 0.35 : level;
}

export class Traffic {
  vehicles: Vehicle[] = [];
  /** Horns since the sound cues last looked (they empty it). */
  readonly horns: Horn[] = [];
  /** debug.rushNow: true = full rush hour, false = quiet, null = the clock. */
  forced: boolean | null = null;
  level = 0;
  /** How deep the water on the street is (0 = dry, 1 = up to the curb). */
  flood = 0;
  /** debug.floodNow: true = flooded now, false = dry now, null = the rain and the rush decide. */
  floodForced: boolean | null = null;
  private nextSpawn = new Map<number, number>();
  private day: StreetDay = {};
  /** Owners whose bike just parked (the renderer passes them on to the sim). */
  readonly parked: string[] = [];
  /** When the next flat tire happens (ms). */
  nextFlatAt = 0;
  /** debug.repairNow: the next bike that can gets a flat right away, whatever the hour. */
  flatNow = false;
  readonly police: PoliceState = { wanted: false, forced: null, onPost: false, hold: 1, holdUntil: 0, walkers: false, catches: 0, jamFor: 0, calmFor: 0 };
  /** When the next racing boy comes (ms; 0 = schedule); debug.racerNow sends one right away. */
  nextRacerAt = 0;
  racerNow = false;
  /** Racing boys passing by since the sim last looked (the renderer empties it). */
  readonly racerEvents: RacerEvent[] = [];
  /** Riders wanted to pull over at the sidewalk stalls: the next fitting bike for each does. */
  dinerCalls: DinerCall[] = [];
  /** Diners who just parked (the renderer passes them on to the sim): their bike's variant and the call's tag. */
  readonly diners: { variant: number; tag: string }[] = [];
  private lastRacerEvent = 0;
  /** When the next city bus comes (ms; 0 = schedule); debug.busNow sends one right away, whatever the hour. */
  nextBusAt = 0;
  busNow = false;
  /** The stop (the sim says): someone is still getting on or off, or running for the bus and the driver waits. */
  busHold = false;
  /** The accident on the street now (sim/accident.ts; null: none): the sim's crew works on it, the renderer draws it. */
  accident: AccidentScene | null = null;
  /** What the accident blocks this frame (none or one stretch of lane; reused). */
  readonly obstacles: Obstacle[] = [];
  private readonly obstacle: Obstacle = { x0: 0, x1: 0, y0: 0, y1: 0 };
  /** Street sounds since the renderer last looked (it passes them on to the sim and empties it): a crash, the siren. */
  readonly sounds: { kind: 'crash' | 'siren'; x: number; y: number }[] = [];
  /** The sim says something else is going on (siesta, New Year party, disco, power cut, visit): no crash now. */
  accidentOff = false;
  /** The world clock (ms epoch; the renderer sets it) for the accident schedule; 0 = the step's `now`. */
  clock = 0;
  readonly accidentClock = new AccidentClock();
  /** debug.crashNow: a crash at the next step, as close to this x (px) as possible. */
  crashAt: number | null = null;
  private accidentSeq = 0;
  /** An ambulance is on the street: nobody starts going around the scene (they'd meet it head-on). */
  private ambOut = false;
  /** The accident's crew on foot out on the road this frame (sim/accident-crew.ts): nobody drives through them (reused). */
  readonly crewBoxes: Obstacle[] = [];
  private readonly crewPool: Obstacle[] = [];
  private sirenAt = 0;

  /** A bike is at the repair stall being fixed. */
  get repairing(): boolean {
    return this.vehicles.some((v) => v.phase === 'repair');
  }

  /** An agent rides in from the west on the eastbound lane to park at `park`. */
  arrive(owner: string, park: { x: number; y: number }, env: TrafficEnv): void {
    const lane = env.lanes.find((l) => l.dir > 0) ?? env.lanes[0];
    if (!lane) return;
    const y = lane.y - 4;
    const want = 44 + this.rng() * 12;
    this.vehicles.push({ kind: 'bike', x: env.x0 - 10, y, dir: 1, speed: want, want, laneY: lane.y, ty: y, variant: Math.floor(this.rng() * 1e6), riders: 1, stuck: 0, sidewalk: 0, owner, phase: 'arrive', park });
  }

  /** The agent's bike leaves its spot (or turns back, if it hadn't parked yet) and rides off east. */
  depart(owner: string): void {
    const v = this.vehicles.find((o) => o.owner === owner && o.phase !== 'leave');
    if (!v) return;
    v.phase = 'leave';
    v.ty = v.laneY - 4;
    v.want = 40 + this.rng() * 14;
  }

  constructor(private readonly rng: () => number = Math.random) {}

  step(now: number, dt: number, env: TrafficEnv, hour: number, day: number, raining = false, street: StreetDay = {}): void {
    dt = Math.min(dt, 0.1);
    this.day = street;
    // the first days of Tết: everyone went home to the countryside
    this.level = this.forced !== null ? (this.forced ? 1 : 0) : street.tet === 'holiday' ? 0 : rushLevel(hour, day);
    if (this.floodForced !== null) this.flood = this.floodForced ? 1 : 0;
    else if (raining && this.level > 0.5) this.flood = Math.min(1, this.flood + dt / FLOOD_RISE_S);
    else this.flood = Math.max(0, this.flood - dt / FLOOD_DRAIN_S);
    for (const lane of env.lanes) this.spawn(now, lane, env);
    this.busSpawn(now, hour, env);
    this.racer(now, hour, env);
    this.callDiner(now);
    this.flat(now, hour);
    this.policeStep(now, dt);
    this.accidentStep(now, env, hour, raining);
    this.move(now, dt, env);
    this.vehicles = this.vehicles.filter((v) => v.x >= env.x0 - 20 && v.x <= env.x1 + 20);
    while (this.horns.length && (now - this.horns[0].at > HORN_STALE_MS || this.horns.length > MAX_HORNS)) this.horns.shift();
  }

  /** One lane's next arrival: a car every ~8–26 s when quiet, a stream of bikes at rush hour. */
  private spawn(now: number, lane: { y: number; dir: 1 | -1 }, env: TrafficEnv): void {
    const due = this.nextSpawn.get(lane.y);
    const l = this.level;
    const empty = this.day.tet === 'holiday' && this.forced === null ? 4 : 1;
    const gap = () => (0.55 + 16 * (1 - l) * (1 - l)) * (0.5 + this.rng()) * 1000 * empty;
    if (due === undefined) {
      this.nextSpawn.set(lane.y, now + gap() * this.rng());
      return;
    }
    if (now < due || this.vehicles.length >= MAX_VEHICLES) return;
    const kind: VehicleKind = this.rng() < 0.4 + 0.45 * l ? 'bike' : 'car';
    const x = lane.dir > 0 ? env.x0 : env.x1;
    const y = kind === 'car' ? lane.y : lane.y - BAND_UP + Math.round(this.rng() * (BAND_UP + BAND_DOWN));
    // the entry is still taken by the tail of a queue: try again on a later frame
    if (this.vehicles.some((o) => o.dir === lane.dir && blocks(kind, y, o) && Math.abs(o.x - x) < half(o) + HALF[kind] + MIN_GAP)) return;
    const slow = 1 - 0.3 * l;
    const want = (kind === 'car' ? 40 + this.rng() * 28 : 46 + this.rng() * 26) * slow;
    const riders = this.rng() < 0.3 ? 2 : 1;
    const cargo = kind === 'bike' && riders === 1 ? this.cargo() : undefined;
    this.vehicles.push({ kind, x, y, dir: lane.dir, speed: want, want, laneY: lane.y, ty: y, variant: Math.floor(this.rng() * 1e6), riders, stuck: 0, sidewalk: 0, cargo });
    this.nextSpawn.set(lane.y, now + gap());
  }

  /**
   * Now and then a racing boy, in the street's racing windows (RACER_WINDOWS; never at Tết): enters on either side,
   * alone or with a passenger, far faster than everyone else.
   */
  private racer(now: number, hour: number, env: TrafficEnv): void {
    const w = racerWindow(hour);
    if (!this.racerNow) {
      if (!w || this.day.tet === 'holiday') {
        this.nextRacerAt = 0;
        return;
      }
      // the first one of a window comes a little after it opens
      const [a, b] = w.gap;
      if (!this.nextRacerAt) this.nextRacerAt = now + (a + this.rng() * (b - a)) * 500;
      if (now < this.nextRacerAt) return;
      this.nextRacerAt = now + (a + this.rng() * (b - a)) * 1000;
      if (this.vehicles.some((v) => v.racer)) return;
    }
    this.racerNow = false;
    const lane = env.lanes[Math.floor(this.rng() * env.lanes.length)];
    if (!lane) return;
    const want = RACER_SPEED[0] + this.rng() * (RACER_SPEED[1] - RACER_SPEED[0]);
    const x = lane.dir > 0 ? env.x0 : env.x1;
    const y = lane.y - 4;
    this.vehicles.push({ kind: 'bike', x, y, dir: lane.dir, speed: want, want, laneY: lane.y, ty: y, variant: Math.floor(this.rng() * 1e6), riders: this.rng() < 0.25 ? 2 : 1, stuck: 0, sidewalk: 0, racer: true });
  }

  /**
   * A racing boy's line: when someone is close ahead, swerve to wherever along its lane band or the center line has the
   * most room ahead (never into an oncoming vehicle); the ones cut past honk; the sidewalks and the officer hear about it.
   */
  private race(v: Vehicle, dt: number, now: number, env: TrafficEnv): void {
    const lead = this.leader(v, v.y);
    if (lead && lead.gap < RACER_WEAVE_GAP && v.y === v.ty) {
      const other = env.lanes.find((l) => l.dir !== v.dir);
      const center = other ? Math.round((v.laneY + other.y) / 2) : v.laneY;
      const ys: number[] = [];
      for (let y = v.laneY - BAND_UP; y <= v.laneY + BAND_DOWN; y += 3) ys.push(y);
      for (let y = center - 3; y <= center + 3; y += 3) ys.push(y);
      let best = v.y;
      let room = lead.gap;
      for (const y of ys) {
        if (!this.clear(v, y) || this.oncoming(v, y)) continue;
        const g = this.leader(v, y)?.gap ?? Infinity;
        if (g > room + 8) {
          room = g;
          best = y;
        }
      }
      v.ty = best;
    }
    if (v.y !== v.ty) v.y += Math.sign(v.ty - v.y) * Math.min(Math.abs(v.ty - v.y), DRIFT * 5 * dt);
    // whoever just got cut past honks (once in a while each)
    for (const o of this.vehicles) {
      if (o === v || o.racer || Math.abs(o.x - v.x) > 16 || Math.abs(o.y - v.y) > 14) continue;
      if (now - (o.startled ?? -1e9) > 3_000 && this.rng() < 0.6) {
        o.startled = now;
        this.honk(o, now);
      }
    }
    if (this.rng() < 1.5 * dt) this.honk(v, now);
    if (now - this.lastRacerEvent >= RACER_EVENT_MS) {
      this.lastRacerEvent = now;
      const c = env.crossing;
      const past = this.police.onPost && c && !v.caught && Math.abs(v.x - (c.x + c.w / 2)) < 30;
      if (past) v.caught = true;
      this.racerEvents.push({ x: v.x, y: v.y, at: now, police: !!past });
      if (this.racerEvents.length > 16) this.racerEvents.shift();
    }
  }

  /**
   * Someone hungry: for each call, the next eastbound rider alone (no load) coming up to the spot pulls over and parks
   * there; they get off to eat (the sim walks them), or wait on the bike, and ride on when `dinerLeave` says so.
   */
  private callDiner(now: number): void {
    // nobody came by in time (a quiet street): never mind
    this.dinerCalls = this.dinerCalls.filter((c) => now <= c.until);
    for (let i = 0; i < this.dinerCalls.length; i++) {
      const park = this.dinerCalls[i];
      const v = this.vehicles.find((o) => o.kind === 'bike' && o.dir > 0 && !o.owner && !o.phase && !o.racer && !o.pushing && !o.cargo && o.riders === 1 && park.x - o.x > 80 && park.x - o.x < 700);
      if (!v) continue;
      v.phase = 'arrive';
      v.park = { x: park.x, y: park.y };
      v.diner = park.tag;
      v.dinerStays = park.stays;
      this.dinerCalls.splice(i--, 1);
    }
  }

  /** The diner riding `variant` is done eating: back on the bike and into the lane. */
  dinerLeave(variant: number): void {
    const v = this.vehicles.find((o) => o.diner && o.variant === variant && o.phase === 'parked');
    if (!v) return;
    v.diner = undefined;
    v.dinerStays = undefined;
    v.phase = 'leave';
    v.ty = v.laneY - 4;
    v.want = 40 + this.rng() * 14;
  }

  /** An oncoming vehicle near `v`'s path at height `y` (a racing boy won't swerve head-on into it). */
  private oncoming(v: Vehicle, y: number): boolean {
    return this.vehicles.some((o) => o.dir !== v.dir && Math.abs(o.y - y) < (o.kind === 'car' ? CAR_WIDTH : SIDE_BY_SIDE) && (o.x - v.x) * v.dir > -10 && (o.x - v.x) * v.dir < 140);
  }

  /**
   * Every few minutes while the stall is open, one eastbound bike coming up to it gets a flat: the rider gets off and
   * pushes it there. One at a time.
   */
  private flat(now: number, hour: number): void {
    if (!this.nextFlatAt) this.nextFlatAt = now + (30 + this.rng() * 60) * 1000;
    if (!this.flatNow && (now < this.nextFlatAt || !repairOpen(hour))) return;
    if (this.vehicles.some((v) => v.repair && v.phase)) return;
    const v = this.vehicles.find((o) => o.kind === 'bike' && o.dir > 0 && !o.owner && !o.racer && !o.phase && !o.pushing && !o.cargo && o.riders === 1 && REPAIR_SPOT.x - o.x > 50 && REPAIR_SPOT.x - o.x < 220);
    if (!v) return;
    v.phase = 'arrive';
    v.park = REPAIR_SPOT;
    v.repair = true;
    v.pushing = true;
    this.flatNow = false;
    this.nextFlatAt = now + (150 + this.rng() * 150) * 1000;
  }

  /**
   * Is the street jammed (rush hour, a bunch of vehicles crawling for a while)? Then an officer is wanted, until the rush
   * is over or the street has flowed for a while. With the officer at the post, the directions take turns.
   */
  private policeStep(now: number, dt: number): void {
    const p = this.police;
    // the bikes rarely come to a dead stop here: a jam is a street packed solid at rush hour (or a bunch crawling)
    let stuck = 0;
    let busy = 0;
    for (const v of this.vehicles) {
      if (v.phase || v.owner) continue;
      busy++;
      if (v.stuck > 1) stuck++;
    }
    const jammed = this.level > 0.6 && (busy >= JAM_VEHICLES || stuck >= 6);
    p.jamFor = jammed ? p.jamFor + dt : Math.max(0, p.jamFor - dt);
    p.calmFor = busy < CALM_VEHICLES && stuck < 3 ? p.calmFor + dt : 0;
    if (p.forced !== null) p.wanted = p.forced;
    else if (!p.wanted && p.jamFor >= JAM_S) p.wanted = true;
    else if (p.wanted && (this.level < 0.3 || p.calmFor >= CALM_S)) p.wanted = false;
    if (!p.onPost) {
      p.holdUntil = 0;
      return;
    }
    // an officer directing at an accident down the street: the one at the crossing holds the same side, so nobody
    // gets waved on at one and stopped at the other
    const s = this.accident;
    if (s?.directing) {
      p.hold = s.hold;
      p.holdUntil = s.holdUntil;
      return;
    }
    if (now >= p.holdUntil) {
      p.hold = p.hold === 1 ? -1 : 1;
      p.holdUntil = now + POLICE_PHASE_MS;
    }
  }

  /** Room (px) before the officer's stop line for `v`, or Infinity if it may go (its turn, or already past the line). */
  private stopGap(v: Vehicle, env: TrafficEnv): number {
    const c = env.crossing;
    const p = this.police;
    if (!c || !p.onPost || v.racer || v.ambulance || (!p.walkers && p.hold !== v.dir) || onSidewalk(v) || v.phase === 'parked') return Infinity;
    const line = v.dir > 0 ? c.x - STOP_BACK : c.x + c.w + STOP_BACK;
    const ahead = (line - v.x) * v.dir - half(v);
    return ahead < 0 ? Infinity : ahead;
  }

  /** What a lone rider carries, if anything: the season's load first, else now and then something everyday. */
  private cargo(): Cargo | undefined {
    const r = this.rng();
    const tet = this.day.tet;
    if (tet && r < (tet === 'holiday' ? 0.45 : 0.3)) return 'peach';
    if (this.day.flowers && r < 0.25) return 'flowers';
    if (r > 0.88) return (['water', 'foam', 'plant'] as const)[Math.floor(this.rng() * 3)];
    return undefined;
  }

  private move(now: number, dt: number, env: TrafficEnv): void {
    const l = this.level;
    // through deep water everyone crawls; now and then a bike's engine drowns and the rider gets off to push
    const wade = 1 - 0.55 * this.flood;
    for (const v of this.vehicles) {
      if (v.bus) this.busStep(v, now, dt);
      if (v.phase === 'parked') continue;
      // hit a bike: stays put a while (its rider off arguing), then rides on (around the scene)
      if (v.hit) {
        if (now < (v.until ?? 0)) {
          v.speed = 0;
          continue;
        }
        v.hit = false;
        v.riderOff = false;
      }
      if (v.phase === 'repair') {
        if (now < (v.until ?? 0)) continue;
        // fixed: back on the bike and into the lane
        v.pushing = false;
        v.phase = 'leave';
        v.ty = v.laneY;
      }
      if (v.kind === 'bike' && !v.owner && !v.racer && !v.pushing && v.riders === 1 && this.flood > 0.6 && !onSidewalk(v) && this.rng() < 0.012 * dt) v.pushing = true;
      if (v.pushing && !v.repair && this.flood < 0.2) v.pushing = false;
      const lead = this.leader(v, v.y);
      const gap = lead ? lead.gap : Infinity;
      const want = v.pushing ? PUSH_SPEED : (onSidewalk(v) ? v.want * 0.7 : v.want) * (onSidewalk(v) ? 1 : wade);
      let target = Math.min(want, Math.max(0, gap - MIN_GAP) * GAP_GAIN);
      // riding in to park: up onto the sidewalk near the spot, braking to stop right at it
      const toPark = v.phase === 'arrive' && v.park ? (v.park.x - v.x) * v.dir : Infinity;
      if (toPark < 70 && !v.detour) {
        v.ty = v.park!.y;
        target = Math.min(target, Math.max(0, toPark) * 1.6 + (toPark > 1 ? 6 : 0));
      }
      // pulling out of a spot: slowly until back on the road
      if (v.phase === 'leave' && v.y !== v.ty) target = Math.min(target, 22);
      // the traffic police hold this direction: brake for the stop line before the crossing
      // ...and at an accident, the officer there holds one side at a time
      const stop = Math.min(this.stopGap(v, env), this.sceneStop(v));
      // going around an accident: slowly
      if (v.detour) target = Math.min(target, 26);
      if (stop < Infinity) target = Math.min(target, Math.max(0, stop - 1) * GAP_GAIN);
      // at rush hour someone always brakes for no reason: the stop-and-go waves start here
      if (l > 0.3 && !v.racer && this.rng() < 0.25 * l * dt) target *= 0.3;
      v.speed = target < v.speed ? Math.max(target, v.speed - BRAKE * dt) : Math.min(target, v.speed + ACCEL[v.kind] * dt);
      let step = v.speed * dt;
      if (gap - step < 1) step = Math.max(0, gap - 1);
      if (stop - step < 0) step = Math.max(0, stop);
      v.x += v.dir * step;
      v.stuck = v.speed < want * 0.35 ? v.stuck + dt : 0;
      // around an accident: the street's traffic, the racing boy, and agents riding in whose spot is still a way off
      if (!v.detour && this.obstacles.length && !v.ambulance && !v.bus && !v.pushing && !onSidewalk(v) && (!v.phase || (v.phase === 'arrive' && toPark > 150))) this.tryDetour(v);
      const giving = v.kind === 'bike' && !v.racer && this.makeWay(v);
      if (v.detour) this.goAround(v, dt);
      else if (v.owner || v.phase) this.ride(v, dt, now);
      else if (v.racer) this.race(v, dt, now, env);
      else if (v.kind === 'bike' && !v.pushing) this.steer(v, dt, env, giving);
      if (v.stuck > 1 && !v.owner && !v.phase && this.rng() < 0.12 * dt) this.honk(v, now);
      else if (v.kind === 'bike' && l > 0.5 && this.rng() < 0.015 * dt) this.honk(v, now);
    }
  }

  /** An owned bike: drifts towards its spot or back to the road (yielding to the traffic there), parks when it's there. */
  private ride(v: Vehicle, dt: number, now: number): void {
    if (v.y !== v.ty) {
      const y = v.y + Math.sign(v.ty - v.y) * Math.min(Math.abs(v.ty - v.y), DRIFT * 1.6 * dt);
      // a bus blinking to pull out gets let in after a few seconds (it's a bus)
      if (v.phase !== 'leave' || this.clear(v, y) || (v.bus && now - (v.closing ?? now) > BUS_CLOSE_MS + 3_000)) v.y = y;
    }
    if (v.phase === 'arrive' && v.park && v.y === v.park.y && (v.park.x - v.x) * v.dir <= 1) {
      v.x = v.park.x;
      v.speed = 0;
      if (v.repair) {
        v.phase = 'repair';
        v.until = now + (35 + this.rng() * 20) * 1000;
      } else {
        v.phase = 'parked';
        if (v.owner) this.parked.push(v.owner);
        if (v.diner) this.diners.push({ variant: v.variant, tag: v.diner });
        // stays on the bike: a beep to the vendor
        if (v.diner && v.dinerStays) this.honk(v, now);

      }
    }
    if (v.phase === 'leave' && v.y === v.ty) v.phase = undefined;
  }

  /**
   * A city bus's next run: every 15–20 minutes in service hours (more often at rush hour; never on the first days of
   * Tết), one at a time, entering at the east end on the westbound lane, by the far sidewalk where the stop is.
   */
  private busSpawn(now: number, hour: number, env: TrafficEnv): void {
    if (!this.busNow) {
      if (!busRuns(hour) || this.day.tet === 'holiday') {
        this.nextBusAt = 0;
        return;
      }
      // the first one comes somewhere within a gap
      if (!this.nextBusAt) this.nextBusAt = now + busGapMs(this.level, this.rng) * this.rng();
      if (now < this.nextBusAt) return;
    }
    const lane = env.lanes.find((l) => l.dir < 0);
    if (!lane) return;
    if (this.vehicles.some((v) => v.bus)) {
      this.busNow = false;
      this.nextBusAt = now + busGapMs(this.level, this.rng);
      return;
    }
    const x = lane.dir > 0 ? env.x0 : env.x1;
    // the entry is still taken by the tail of a queue: try again on a later frame
    if (this.vehicles.some((o) => o.dir === lane.dir && blocks('car', lane.y, o) && Math.abs(o.x - x) < half(o) + BUS_HALF + MIN_GAP)) return;
    const variant = Math.floor(this.rng() * 1e6);
    this.vehicles.push({ kind: 'car', x, y: lane.y, dir: lane.dir, speed: BUS_SPEED, want: BUS_SPEED, laneY: lane.y, ty: lane.y, variant, riders: 1, stuck: 0, sidewalk: 0, bus: BUS_ROUTES[variant % BUS_ROUTES.length] });
    this.busNow = false;
    this.nextBusAt = now + busGapMs(this.level, this.rng);
  }

  /**
   * The bus at the stop: coming up to it, it signals and pulls over to the curb; stopped, the doors open for a while
   * (longer while the stop holds it: people getting on and off, someone running for it), close, and it pulls out.
   * The bikes stuck behind it honk.
   */
  private busStep(v: Vehicle, now: number, dt: number): void {
    if (!v.phase && !v.served && (v.x - BUS_PARK.x) * -v.dir > 0 && (v.x - BUS_PARK.x) * -v.dir < 160) {
      v.phase = 'arrive';
      v.park = BUS_PARK;
      return;
    }
    if (v.phase !== 'parked') return;
    if (v.since === undefined) v.since = now;
    const open = now - v.since;
    if (v.closing === undefined && open >= BUS_DOOR_MS + BUS_DWELL_MS && (!this.busHold || open >= BUS_HOLD_MAX_MS)) v.closing = now;
    if (v.closing !== undefined && now - v.closing >= BUS_CLOSE_MS) {
      v.phase = 'leave';
      v.served = true;
      v.park = undefined;
      v.ty = v.laneY;
      v.want = BUS_SPEED;
      return;
    }
    // whoever is stuck right behind it leans on the horn
    if (this.rng() < 0.6 * dt) {
      const o = this.vehicles.find((b) => b !== v && b.dir === v.dir && b.stuck > 0.5 && (b.x - v.x) * v.dir < 0 && (v.x - b.x) * v.dir < BUS_HALF + 60);
      if (o) this.honk(o, now);
    }
  }

  /** The bus as the stop sees it (null: no bus on the street). */
  busAt(now: number): BusAt | null {
    const v = this.vehicles.find((o) => o.bus);
    if (!v || !v.bus) return null;
    const phase = v.phase === 'arrive' ? 'pulling' : v.phase === 'parked' ? 'stopped' : v.phase === 'leave' || v.served ? 'leaving' : 'coming';
    const doorsOpen = phase === 'stopped' && v.since !== undefined && now - v.since >= BUS_DOOR_MS && v.closing === undefined;
    return { phase, x: v.x, route: v.bus, doorsOpen };
  }

  // ------------------------------------------------------------------ accident (sim/accident.ts)

  /**
   * The accident's street side: when one is due (the schedule, or debug.crashNow) a bike goes down; while it lasts,
   * the stretch it blocks, the ambulance sent, driven up, stopped by the scene and sent off; and it ends when the crew
   * is done (or it took too long).
   */
  private accidentStep(now: number, env: TrafficEnv, hour: number, raining: boolean): void {
    if (this.accident && accidentStage(this.accident, now) === 'done') this.endAccident();
    if (!this.accident) {
      const clock = this.clock || now;
      const allowed = accidentAllowed({ hour, tetHoliday: this.day.tet === 'holiday' && this.forced === null, blocked: this.accidentOff });
      const forced = this.crashAt;
      if ((forced !== null || this.accidentClock.due(clock, this.level, raining, allowed)) && this.crash(now, env, forced, raining)) this.accidentClock.fired(clock);
      this.crashAt = null;
    }
    this.obstacles.length = 0;
    this.crewBoxes.length = 0;
    const s = this.accident;
    if (!s) {
      this.ambOut = false;
      return;
    }
    if (sceneObstacle(s, this.obstacle)) this.obstacles.push(this.obstacle);
    this.ambulanceStep(s, now, env);
    this.ambOut = this.vehicles.some((v) => v.ambulance);
    // the officer, the medics and the riders out on the road: a small box around each one's feet
    const w = s.walkers;
    if (w) {
      for (let i = 0; i + 1 < w.length; i += 2) {
        const box = (this.crewPool[i >> 1] ??= { x0: 0, x1: 0, y0: 0, y1: 0 });
        box.x0 = w[i] - 4;
        box.x1 = w[i] + 4;
        box.y0 = w[i + 1] - 4;
        box.y1 = w[i + 1] + 2;
        this.crewBoxes.push(box);
      }
    }
  }

  /**
   * A bike goes down: one riding alone in its lane (away from the ends of the street; with `nearX`, the closest to it)
   * with someone right behind that bumps it; in the rain, or forced, it may slip on its own. Forced with no bike around,
   * one goes down anyway in the busier lane. Returns whether it happened.
   */
  private crash(now: number, env: TrafficEnv, nearX: number | null, raining: boolean): boolean {
    const lo = env.x0 + 160;
    const hi = env.x1 - 160;
    let best: Vehicle | null = null;
    let partner: Vehicle | null = null;
    let score = Infinity;
    for (const v of this.vehicles) {
      if (v.kind !== 'bike' || v.phase || v.owner || v.racer || v.pushing || v.parked || v.hit || v.detour || v.cargo || v.riders !== 1 || onSidewalk(v)) continue;
      if (v.x < lo || v.x > hi || (nearX !== null && Math.abs(v.x - nearX) > 200)) continue;
      const p = this.follower(v);
      if (!p && nearX === null && !raining) continue;
      const sc = (nearX === null ? 0 : Math.abs(v.x - nearX)) + (p ? 0 : 300);
      if (sc < score) {
        score = sc;
        best = v;
        partner = p;
      }
    }
    if (!best && nearX === null) return false;
    const between = ([a, b]: readonly [number, number]) => a + this.rng() * (b - a);
    let x: number;
    let y: number;
    let lane: { y: number; dir: 1 | -1 };
    let variant: number;
    if (best) {
      x = best.x;
      y = best.y;
      lane = { y: best.laneY, dir: best.dir };
      variant = best.variant;
      this.vehicles.splice(this.vehicles.indexOf(best), 1);
    } else {
      // forced on an empty stretch: the lane with more vehicles near the spot
      const count = (l: { y: number }) => this.vehicles.filter((o) => o.laneY === l.y && Math.abs(o.x - nearX!) < 400).length;
      lane = [...env.lanes].sort((a, b) => count(b) - count(a))[0];
      if (!lane) return false;
      x = Math.max(lo, Math.min(hi, nearX!));
      y = lane.y - 4;
      variant = Math.floor(this.rng() * 1e6);
    }
    const s: AccidentScene = {
      id: ++this.accidentSeq,
      at: now,
      x,
      laneY: lane.y,
      dir: lane.dir,
      variant,
      other: partner ? partner.variant : null,
      otherKind: partner ? partner.kind : 'bike',
      otherX: 0,
      otherY: 0,
      otherUntil: now + between(ACCIDENT_T.other),
      officerDue: now + between(ACCIDENT_T.officer),
      ambulanceDue: now + between(ACCIDENT_T.ambulance),
      officerAt: 0,
      cones: 0,
      directing: false,
      hold: lane.dir,
      holdUntil: 0,
      bike: 'down',
      bikeX: x,
      bikeY: y,
      bandaged: false,
      doors: false,
      loaded: false,
      done: false,
      ambulance: 'none',
      ambX: 0,
      ambY: 0,
      ambDir: lane.dir > 0 ? -1 : 1,
    };
    if (partner) {
      // right behind it, stopped dead
      partner.x = x - lane.dir * (half(partner) + 9);
      partner.speed = 0;
      partner.hit = true;
      partner.until = s.otherUntil;
      partner.riderOff = partner.kind === 'bike';
      s.otherX = partner.x;
      s.otherY = partner.y;
    }
    this.accident = s;
    this.sounds.push({ kind: 'crash', x, y });
    // whoever is close behind honks
    for (const o of this.vehicles) if (o !== partner && o.dir === lane.dir && (x - o.x) * lane.dir > 0 && (x - o.x) * lane.dir < 140 && this.rng() < 0.5) this.honk(o, now);
    return true;
  }

  /** The vehicle right behind `v` in its way, close enough to bump it (null: none). */
  private follower(v: Vehicle): Vehicle | null {
    let best: Vehicle | null = null;
    let gap = 40;
    for (const o of this.vehicles) {
      if (o === v || o.dir !== v.dir || o.phase || o.owner || o.racer || o.ambulance || o.bus || o.parked || o.hit || !blocks(o.kind, o.y, v)) continue;
      const g = (v.x - o.x) * v.dir - half(o) - half(v);
      if (g >= 0 && g < gap) {
        gap = g;
        best = o;
      }
    }
    return best;
  }

  /**
   * The ambulance: sent in the other lane when due (from that lane's end of the street, or not too far off), its siren
   * wailing; bikes ahead make way; it stops beside the scene with its back doors there (put there if it's very late),
   * waits for the medics to load the rider, and drives off with the siren on.
   */
  private ambulanceStep(s: AccidentScene, now: number, env: TrafficEnv): void {
    let amb: Vehicle | undefined;
    for (const v of this.vehicles) if (v.ambulance) amb = v;
    if (!amb && (s.ambulance === 'coming' || s.ambulance === 'there')) s.ambulance = 'none';
    if (!amb && s.ambulance === 'leaving') s.ambulance = 'gone';
    const lane = env.lanes.find((l) => l.dir !== s.dir) ?? env.lanes[0];
    if (!lane) return;
    // its back doors by the scene
    const stopX = s.x + lane.dir * (HALF.car - 9);
    if (!amb && s.ambulance === 'none' && now >= s.ambulanceDue) {
      const far = 700;
      const x = lane.dir > 0 ? Math.max(env.x0, s.x - far) : Math.min(env.x1, s.x + far);
      amb = { kind: 'car', x, y: lane.y, dir: lane.dir, speed: 55, want: 72, laneY: lane.y, ty: lane.y, variant: 0, riders: 1, stuck: 0, sidewalk: 0, ambulance: true, siren: true, phase: 'arrive', park: { x: stopX, y: lane.y } };
      this.vehicles.push(amb);
      s.ambulance = 'coming';
      s.ambDir = lane.dir;
    }
    if (!amb) return;
    if (amb.siren && now - this.sirenAt >= 1_900) {
      this.sirenAt = now;
      this.sounds.push({ kind: 'siren', x: amb.x, y: amb.y });
    }
    if (s.ambulance === 'coming') {
      // very late (stuck somewhere): it's simply there, the ones standing on its spot moved back along the queue (not
      // while someone going around the scene is passing there)
      if (now - s.at > ACCIDENT_T.ambulanceLate && amb.phase === 'arrive' && !this.vehicles.some((o) => o.detour && Math.abs(o.x - stopX) < half(o) + HALF.car + MIN_GAP)) {
        this.makeRoom(amb, stopX);
        amb.x = stopX;
        amb.y = amb.laneY;
        amb.speed = 0;
        amb.phase = 'parked';
      }
      if (amb.phase === 'parked') {
        s.ambulance = 'there';
        s.ambX = amb.x;
        s.ambY = amb.y;
        amb.siren = false;
        return;
      }
      // the bikes ahead pull over to the far edge of their lane
      for (const o of this.vehicles) {
        if (o.kind !== 'bike' || o.dir !== amb.dir || o.phase || onSidewalk(o) || o.detour) continue;
        const ahead = (o.x - amb.x) * amb.dir;
        const edge = o.laneY - BAND_UP;
        if (ahead > 0 && ahead < 110 && Math.abs(o.y - amb.y) < CAR_WIDTH && this.clear(o, edge)) o.ty = edge;
      }
    } else if (s.ambulance === 'there' && s.loaded) {
      s.ambulance = 'leaving';
      amb.phase = 'leave';
      amb.park = undefined;
      amb.ty = amb.laneY;
      amb.siren = true;
    }
  }

  /**
   * Room in its lane for the ambulance put at `x`: whoever stands on the spot (or right behind it) is moved back behind
   * it, and the queue behind them in turn, keeping the usual gap. Rare (a very late ambulance), so it may allocate.
   */
  private makeRoom(amb: Vehicle, x: number): void {
    const d = amb.dir;
    const row = this.vehicles
      .filter((o) => o !== amb && o.dir === d && !o.detour && o.phase !== 'parked' && !onSidewalk(o) && blocks('car', amb.laneY, o) && (o.x - x) * d < half(o) + HALF.car + MIN_GAP)
      .sort((a, b) => (b.x - a.x) * d);
    let back = x - d * HALF.car;
    for (const o of row) {
      const front = o.x + d * half(o);
      if ((back - front) * d < MIN_GAP) {
        o.x = back - d * (MIN_GAP + half(o));
        o.speed = 0;
      }
      back = o.x - d * half(o);
    }
  }

  /** The accident is over (or dropped): the vehicles stopped by it ride on, an ambulance still there drives off. */
  endAccident(): void {
    const s = this.accident;
    if (!s) return;
    s.done = true;
    this.accident = null;
    this.obstacles.length = 0;
    this.crewBoxes.length = 0;
    for (const v of this.vehicles) {
      if (v.hit) {
        v.hit = false;
        v.riderOff = false;
      }
      if (v.ambulance && (v.phase === 'arrive' || v.phase === 'parked')) {
        v.phase = 'leave';
        v.park = undefined;
        v.ty = v.laneY;
        v.siren = true;
      }
    }
  }

  /**
   * Stuck close behind the accident: go around it through the oncoming lane, when that's free ahead (or the officer
   * there waves this side on and holds the other).
   */
  private tryDetour(v: Vehicle): void {
    const s = this.accident;
    const o = this.obstacles[0];
    // with an ambulance on the street nobody pulls out: it would meet them head-on in the oncoming lane
    if (!s || !o || v.dir !== s.dir || v.hit || this.ambOut) return;
    if (obstacleGap(v.x, half(v), v.dir, v.y, v.kind === 'car' ? 5 : 1, o) > 24) return;
    if (s.directing && s.hold === v.dir) return;
    const y = detourY(s);
    if (!this.clear(v, y)) return;
    // the officer holds the other side: only what's still at the scene matters; otherwise, anyone coming up ahead
    const waved = s.directing && s.hold !== v.dir;
    for (const u of this.vehicles) {
      if (u.dir === v.dir || onSidewalk(u) || (u.phase === 'parked' && !u.ambulance)) continue;
      const ahead = (u.x - v.x) * v.dir;
      if (waved ? u.x + half(u) > o.x0 - 6 && u.x - half(u) < o.x1 + 6 : ahead > -half(u) - 10 && ahead < 230) return;
    }
    v.detour = true;
    v.ty = y;
  }

  /** Going around the accident: out to the detour line, and back into the lane once past the scene (or it's gone). */
  private goAround(v: Vehicle, dt: number): void {
    const o = this.obstacles[0];
    const past = !this.accident || !o || (v.dir > 0 ? v.x - half(v) > o.x1 + 4 : v.x + half(v) < o.x0 - 4);
    if (past && Math.abs(v.ty - v.laneY) > BAND_DOWN + 6) {
      const back = v.kind === 'car' ? v.laneY : v.laneY - 4;
      if (this.clear(v, back)) v.ty = back;
    }
    if (v.y !== v.ty) v.y += Math.sign(v.ty - v.y) * Math.min(Math.abs(v.ty - v.y), DRIFT * 1.4 * dt);
    else if (past) v.detour = false;
  }

  /** Room (px) before the accident's stop line for `v` while the officer there holds its side, else Infinity. */
  private sceneStop(v: Vehicle): number {
    const s = this.accident;
    const o = this.obstacles[0];
    if (!s || !o || !s.directing || s.hold !== v.dir || v.detour || v.ambulance || v.racer || v.phase || onSidewalk(v)) return Infinity;
    const line = v.dir > 0 ? o.x0 - 16 : o.x1 + 16;
    const ahead = (line - v.x) * v.dir - half(v);
    return ahead < 0 ? Infinity : ahead;
  }

  /**
   * An oncoming bike with someone going around the accident just ahead in its band: over to the far side of its lane
   * (away from the detour line). Returns whether it's making way (then it doesn't weave about meanwhile).
   */
  private makeWay(v: Vehicle): boolean {
    const s = this.accident;
    if (!s || v.dir === s.dir || v.detour || onSidewalk(v)) return false;
    const away = detourY(s) < v.laneY ? v.laneY + BAND_DOWN : v.laneY - BAND_UP;
    for (const o of this.vehicles) {
      if (!o.detour || Math.abs(o.y - v.y) >= 12) continue;
      const ahead = (o.x - v.x) * v.dir;
      if (ahead <= -half(o) || ahead >= 160) continue;
      if (v.ty !== away && this.clear(v, away)) v.ty = away;
      return true;
    }
    return false;
  }

  /** Bikes weave through the jam and, westbound, ride the far sidewalk for a stretch (not while making way: `giving`). */
  private steer(v: Vehicle, dt: number, env: TrafficEnv, giving = false): void {
    const police = this.police.onPost && env.crossing ? env.crossing.x + env.crossing.w / 2 : null;
    if (giving) {
      // just moving over (below)
    } else if (onSidewalk(v)) {
      v.sidewalk -= v.speed * dt;
      // the officer saw that: a whistle, and back down to the road right away
      if (police !== null && !v.caught && Math.abs(v.x - police) < CATCH_R) {
        v.caught = true;
        v.sidewalk = 0;
        this.police.catches++;
      }
      if (v.sidewalk <= 0) {
        const back = v.laneY - BAND_UP + Math.round(this.rng() * (BAND_UP + BAND_DOWN));
        if (this.clear(v, back)) v.ty = back;
      }
    } else if (police === null && v.stuck > 1.5 && v.dir < 0 && this.level > 0.5 && Math.abs(v.x - BUS_STOP_X) > 110 && this.rng() < 0.6 * dt) {
      const walk = env.sidewalkY + 6 + Math.round(this.rng() * 10);
      if (this.clear(v, walk)) {
        v.ty = walk;
        v.sidewalk = 60 + this.rng() * 120;
      }
    } else if (v.stuck > 0.6 && this.rng() < 1.5 * dt) {
      const y = v.laneY - BAND_UP + Math.round(this.rng() * (BAND_UP + BAND_DOWN));
      if (this.clear(v, y)) v.ty = y;
    }
    if (v.y === v.ty) return;
    // someone moved into the way meanwhile: stay put
    const y = v.y + Math.sign(v.ty - v.y) * Math.min(Math.abs(v.ty - v.y), DRIFT * dt);
    if (this.clear(v, y)) v.y = y;
    else v.ty = v.y;
  }

  /** Closest vehicle ahead in the way at height `y`, and the bumper-to-bumper gap to it. */
  private leader(v: Vehicle, y: number): { gap: number } | null {
    let best = Infinity;
    for (const o of this.vehicles) {
      if (o === v || !blocks(v.kind, y, o)) continue;
      if (o.dir !== v.dir) {
        // head-on around an accident: whoever goes around the scene and an oncoming vehicle in the same band both stop
        // short of each other; the oncoming bike moves over to the far side of its lane (makeWay) and both ride on
        // (cars keep to the middle of their lane, clear of the detour line, so they never meet one)
        if (!o.detour && !v.detour) continue;
      } else if (v.ambulance && o.kind === 'bike') continue; // the bikes make way for an ambulance
      const ahead = (o.x - v.x) * v.dir;
      if (ahead <= 0) continue;
      const gap = ahead - half(o) - half(v);
      if (gap < best) best = gap;
    }
    // an accident blocking the lane, and its crew out on the road
    const margin = v.kind === 'car' ? 5 : 1;
    for (const o of this.obstacles) {
      const gap = obstacleGap(v.x, half(v), v.dir, y, margin, o);
      if (gap < best) best = gap;
    }
    for (const o of this.crewBoxes) {
      const gap = obstacleGap(v.x, half(v), v.dir, y, margin, o);
      if (gap < best) best = gap;
    }
    return best === Infinity ? null : { gap: best };
  }

  /** Room at height `y` beside `v`: nobody overlapping it there, ahead or behind. */
  private clear(v: Vehicle, y: number): boolean {
    return !this.vehicles.some((o) => o !== v && o.dir === v.dir && blocks(v.kind, y, o) && Math.abs(o.x - v.x) < half(o) + half(v) + MIN_GAP);
  }

  private honk(v: Vehicle, now: number): void {
    this.horns.push({ kind: v.kind, x: v.x, y: v.y, at: now });
  }
}

/** Riding (or heading for) the far sidewalk: slower there. */
function onSidewalk(v: Vehicle): boolean {
  return v.ty > v.laneY + BAND_DOWN;
}

/** What someone says looking at the flooded street from the curb. */
export function floodLine(rng: () => number): string {
  const lines = [tr('Flooded again... 🌊'), tr('How am I getting home in this? 😩'), tr('Should have brought my poncho ☔'), tr('Look, someone pushing their bike 😂')];
  return lines[Math.floor(rng() * lines.length)];
}

/** Does `o` stand in the way of a vehicle of `kind` riding at height `y`? */
function blocks(kind: VehicleKind, y: number, o: Vehicle): boolean {
  const reach = kind === 'car' || o.kind === 'car' ? CAR_WIDTH : SIDE_BY_SIDE;
  return Math.abs(o.y - y) < reach;
}
