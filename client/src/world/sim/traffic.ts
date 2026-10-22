// Street traffic in front of the building: a few cars all day and, at rush hour (7:00–8:30 and 17:00–18:45, local), a
// flood of motorbikes that bunch up in stop-and-go jams, honk and, on the westbound side, hop onto the far sidewalk to
// get past (the near sidewalk has the tea stall and the bánh mì cart). Rain at rush hour floods the street: the water
// rises over ~10 minutes, everyone crawls through it, some bikes stall and get pushed, and it drains over ~20 minutes
// once the rain or the rush is over. Some bikes carry things on the rack (a water jug, foam boxes, a potted plant;
// flowers on the flower holidays, peach branches before Tết), and on the first days of Tết the street is empty.
// Agents who come to work by motorbike ride in from the west, park on the near sidewalk (west of the stone path) and
// ride off again when their session ends: their bikes are owned vehicles (`owner`) the sim asks for.
// Pure (no DOM): the renderer steps and draws it, the sound cues drain the horns.
import { tr } from '../../../../shared/i18n';
import { TILE } from '../constants';

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
  phase?: 'arrive' | 'parked' | 'leave';
  /** Where an owned bike parks (bottom center, px). */
  park?: { x: number; y: number };
}

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
}

/** Half the length (px) of each kind, bumper to bumper. */
const HALF: Readonly<Record<VehicleKind, number>> = { car: 29, bike: 13 };
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
    if (this.vehicles.some((o) => o.dir === lane.dir && blocks(kind, y, o) && Math.abs(o.x - x) < HALF[o.kind] + HALF[kind] + MIN_GAP)) return;
    const slow = 1 - 0.3 * l;
    const want = (kind === 'car' ? 40 + this.rng() * 28 : 46 + this.rng() * 26) * slow;
    const riders = this.rng() < 0.3 ? 2 : 1;
    const cargo = kind === 'bike' && riders === 1 ? this.cargo() : undefined;
    this.vehicles.push({ kind, x, y, dir: lane.dir, speed: want, want, laneY: lane.y, ty: y, variant: Math.floor(this.rng() * 1e6), riders, stuck: 0, sidewalk: 0, cargo });
    this.nextSpawn.set(lane.y, now + gap());
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
      if (v.phase === 'parked') continue;
      if (v.kind === 'bike' && !v.owner && !v.pushing && v.riders === 1 && this.flood > 0.6 && !onSidewalk(v) && this.rng() < 0.012 * dt) v.pushing = true;
      if (v.pushing && this.flood < 0.2) v.pushing = false;
      const lead = this.leader(v, v.y);
      const gap = lead ? lead.gap : Infinity;
      const want = v.pushing ? PUSH_SPEED : (onSidewalk(v) ? v.want * 0.7 : v.want) * (onSidewalk(v) ? 1 : wade);
      let target = Math.min(want, Math.max(0, gap - MIN_GAP) * GAP_GAIN);
      // riding in to park: up onto the sidewalk near the spot, braking to stop right at it
      const toPark = v.phase === 'arrive' && v.park ? v.park.x - v.x : Infinity;
      if (toPark < 70) {
        v.ty = v.park!.y;
        target = Math.min(target, Math.max(0, toPark) * 1.6 + (toPark > 1 ? 6 : 0));
      }
      // pulling out of a spot: slowly until back on the road
      if (v.phase === 'leave' && v.y !== v.ty) target = Math.min(target, 22);
      // at rush hour someone always brakes for no reason: the stop-and-go waves start here
      if (l > 0.3 && this.rng() < 0.25 * l * dt) target *= 0.3;
      v.speed = target < v.speed ? Math.max(target, v.speed - BRAKE * dt) : Math.min(target, v.speed + ACCEL[v.kind] * dt);
      let step = v.speed * dt;
      if (gap - step < 1) step = Math.max(0, gap - 1);
      v.x += v.dir * step;
      v.stuck = v.speed < want * 0.35 ? v.stuck + dt : 0;
      if (v.owner) this.ride(v, dt);
      else if (v.kind === 'bike' && !v.pushing) this.steer(v, dt, env);
      if (v.stuck > 1 && !v.owner && this.rng() < 0.12 * dt) this.honk(v, now);
      else if (v.kind === 'bike' && l > 0.5 && this.rng() < 0.015 * dt) this.honk(v, now);
    }
  }

  /** An owned bike: drifts towards its spot or back to the road (yielding to the traffic there), parks when it's there. */
  private ride(v: Vehicle, dt: number): void {
    if (v.y !== v.ty) {
      const y = v.y + Math.sign(v.ty - v.y) * Math.min(Math.abs(v.ty - v.y), DRIFT * 1.6 * dt);
      if (v.phase !== 'leave' || this.clear(v, y)) v.y = y;
    }
    if (v.phase === 'arrive' && v.park && v.y === v.park.y && v.park.x - v.x <= 1) {
      v.x = v.park.x;
      v.speed = 0;
      v.phase = 'parked';
      if (v.owner) this.parked.push(v.owner);
    }
    if (v.phase === 'leave' && v.y === v.ty) v.phase = undefined;
  }

  /** Bikes weave through the jam and, westbound, ride the far sidewalk for a stretch. */
  private steer(v: Vehicle, dt: number, env: TrafficEnv): void {
    if (onSidewalk(v)) {
      v.sidewalk -= v.speed * dt;
      if (v.sidewalk <= 0) {
        const back = v.laneY - BAND_UP + Math.round(this.rng() * (BAND_UP + BAND_DOWN));
        if (this.clear(v, back)) v.ty = back;
      }
    } else if (v.stuck > 1.5 && v.dir < 0 && this.level > 0.5 && this.rng() < 0.6 * dt) {
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
      if (o === v || o.dir !== v.dir || !blocks(v.kind, y, o)) continue;
      const ahead = (o.x - v.x) * v.dir;
      if (ahead <= 0) continue;
      const gap = ahead - HALF[o.kind] - HALF[v.kind];
      if (gap < best) best = gap;
    }
    return best === Infinity ? null : { gap: best };
  }

  /** Room at height `y` beside `v`: nobody overlapping it there, ahead or behind. */
  private clear(v: Vehicle, y: number): boolean {
    return !this.vehicles.some((o) => o !== v && o.dir === v.dir && blocks(v.kind, y, o) && Math.abs(o.x - v.x) < HALF[o.kind] + HALF[v.kind] + MIN_GAP);
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
