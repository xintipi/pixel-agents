// Night bánh tráng nướng (grilled rice paper, "Đà Lạt pizza"): from 20:00 to 22:00 an auntie carries her low metal
// stand along the curb, sets it on the sidewalk east of the tea stall's stacked stools, sits on a little plastic stool
// and grills over a round clay brazier of charcoal (bếp than): she turns the rice paper, fans the coals now and then
// (gray smoke drifts off; at night the coals glow) and calls out to the street. Once a night a few neighborhood kids
// walk up from one end of the sidewalk, crowd around the stand, buy one each and walk off eating; now and then an idle
// agent walks out (corridor door, stone path, sidewalk) to buy one and eats it back at the desk. At 22:00 she waits
// for the last customers and carries the stand off east. Purely visual. Pure (no DOM): the sim lends the controller a
// few hooks (BanhTrangHost).
import { tr } from '../../../../shared/i18n';
import type { Appearance, Dir, HeldItem } from '../../art/api';
import { TILE } from '../constants';
import type { ExteriorProp } from '../layout/types';
import { Character } from './character';
import type { Step } from './steps';
import { LANE_Y, STOOL_FOOT_DY, Stall, TEA_DOOR, routeToSeat, seatDepth, type TeaSeat } from './tea';

/** Selling hours (local, fractional). */
export const BANHTRANG_OPEN_H = 20;
export const BANHTRANG_CLOSE_H = 22;
/** The kids come by once a night, starting somewhere in this window (local, fractional). */
export const KIDS_FROM_H = 20.25;
export const KIDS_TO_H = 21.5;
/** Each second while the stand is out with a free spot: the chance an idle agent walks out to buy one. */
export const AGENT_CHANCE = 0.004;
/** At most this many agents walk out a night. */
export const MAX_AGENTS = 2;
/** How long one takes on the grill (ms), from the order to handing it over. */
export const GRILL_MS: readonly [number, number] = [5_000, 8_000];

/**
 * The stand: bottom center (px), on the sidewalk by the curb, east of the tea stall's stacked stools and west of the
 * lamp post at x = 14 tiles. (The west corner by the crosswalk is the bánh bao seller's stop at 20:30, and the lamp post
 * at x = 4 tiles leaves no room for her stool there.)
 */
export const BANHTRANG_STAND = { x: 11 * TILE + 7, y: 32 * TILE + 12 } as const;
/**
 * The stand rides this far right of her feet (more than half its width plus half of her: she sits clear of the brazier,
 * which stays in full view).
 */
const STAND_DX = 24;
const STAND_DY = 3;
/** Her stool, at the stand's west end, facing it (feet of whoever sits, px). */
export const BANHTRANG_SEAT: TeaSeat = { x: BANHTRANG_STAND.x - STAND_DX, y: BANHTRANG_STAND.y - STAND_DY, dir: 'right', color: 0 };

/** She carries the stand in along the curb (street edge), like the carts. */
const CURB_Y = 33 * TILE + 5;
/** Customers walk along the sidewalk just below the lane, then step to their spot. */
const STROLL_Y = LANE_Y + 10;

export interface BuySpot {
  /** Feet of the customer (px). */
  x: number;
  y: number;
  dir: Dir;
}

/** Customer spots: crowding the stand's east end (she's at the west one), staggered so nobody hides anybody. */
export const BANHTRANG_SPOTS: readonly BuySpot[] = [
  { x: BANHTRANG_STAND.x + 18, y: BANHTRANG_STAND.y + 1, dir: 'left' },
  { x: BANHTRANG_STAND.x + 27, y: BANHTRANG_STAND.y - 6, dir: 'left' },
  { x: BANHTRANG_STAND.x + 35, y: BANHTRANG_STAND.y + 3, dir: 'left' },
];

export function banhtrangOpen(hour: number): boolean {
  return hour >= BANHTRANG_OPEN_H && hour < BANHTRANG_CLOSE_H;
}

export function kidsTime(hour: number): boolean {
  return hour >= KIDS_FROM_H && hour < KIDS_TO_H;
}

/** She carries the stand in from the west end of the curb and steps up onto the sidewalk to her stool. */
export function vendorRouteIn(fromX: number): number[] {
  const s = BANHTRANG_SEAT;
  return [fromX, CURB_Y, s.x, CURB_Y, s.x, s.y];
}

/** ...and at closing goes on east. */
export function vendorRouteOut(toX: number): number[] {
  return [BANHTRANG_SEAT.x, CURB_Y, toX, CURB_Y];
}

/** Where the brazier's coals are (px) on the stand at `stand`: the smoke rises and the glow shines from here. */
export function coalsAt(stand: { x: number; y: number }): { x: number; y: number } {
  return { x: stand.x - 7, y: stand.y - 18 };
}

/** Where the stand is drawn (bottom center, px) for her feet: always just ahead of her. */
export function standAt(vendor: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(vendor.x + STAND_DX), y: Math.round(vendor.y + STAND_DY) };
}

/** What shows on the sidewalk: the stand next to her (and her stool once she's set up), or nothing while she's away. */
export function banhtrangProps(stand: { x: number; y: number } | null, up: boolean): readonly ExteriorProp[] {
  if (!stand) return [];
  const props: ExteriorProp[] = [{ kind: 'banhtrang_stand', x: stand.x, y: stand.y, seed: 0 }];
  if (up) props.push({ kind: 'tea_stool', x: BANHTRANG_SEAT.x, y: BANHTRANG_SEAT.y + STOOL_FOOT_DY, seed: BANHTRANG_SEAT.color });
  return props;
}

/** A kid (or any passer-by) walks in from one end along the sidewalk to the spot... */
export function kidRouteIn(fromX: number, s: { x: number; y: number }): number[] {
  return [fromX, STROLL_Y, s.x, STROLL_Y, s.x, s.y];
}

/** ...and walks off, eating, to `toX`. */
export function kidRouteOut(s: { x: number; y: number }, toX: number): number[] {
  return [s.x, STROLL_Y, toX, STROLL_Y];
}

/** School clothes for the kids: white shirt, navy shorts or skirt; a cap or pigtails. */
export function kidLook(i: number, rng: () => number): { look: 'f' | 'm'; patch: Partial<Appearance> } {
  const girl = (i + Math.floor(rng() * 2)) % 2 === 1;
  const caps = ['#d9342b', '#f2b33d', '#3f7fd8'];
  const patch: Partial<Appearance> = { top: '#f6f6f2', topAccent: '#dcdcd4', topStyle: 'shirt_tie', bottom: '#27365f', facialHair: 'none' };
  if (girl) Object.assign(patch, { bottomStyle: 'skirt', hairStyle: rng() < 0.5 ? 'pigtails' : 'ponytail', accessory: 'bow', accessoryColor: '#e05a7a' });
  else Object.assign(patch, { bottomStyle: 'shorts', hairStyle: rng() < 0.5 ? 'buzz' : 'short', accessory: 'cap', accessoryColor: caps[Math.floor(rng() * caps.length)] });
  return { look: girl ? 'f' : 'm', patch };
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** What she calls out to the street. */
export function vendorCall(rng: () => number): string {
  return pick(rng, [tr('Bánh tráng nướng here! 🔥'), tr('Hot grilled rice paper, crispy! 🔥'), tr('Egg, scallions, dried shrimp, come get one! 🔥')]);
}

/** A kid ordering. */
export function kidOrder(rng: () => number): string {
  return pick(rng, [tr('Auntie, one with egg please! 🥚'), tr('Extra chili sauce for me! 🌶️'), tr('One without scallions, auntie!'), tr('Me too, me too! 🙋')]);
}

/** An agent ordering. */
export function agentOrder(rng: () => number): string {
  return pick(rng, [tr('One bánh tráng nướng, extra mayo please 🔥'), tr('Smells great from upstairs! One please 🔥'), tr('A late-night snack before the next deploy 🔥')]);
}

/** Her, handing it over. */
export function vendorHand(rng: () => number): string {
  return pick(rng, [tr('Here, careful, it\x27s hot! 🔥'), tr('Crispy and hot, enjoy! 😋'), tr('Eat it while it crunches! 🔥')]);
}

/** Walking off with it. */
export function eatLine(rng: () => number): string {
  return pick(rng, [tr('So crunchy! 😋'), tr('Thanks, auntie! 👋'), tr('Hot hot hot! 😋')]);
}

/** What the sim lends the stand. */
export interface BanhTrangHost {
  /** The world clock (ms epoch). */
  now(): number;
  /** Hour of day (fractional) at `now`. */
  hourOf(now: number): number;
  /** Nothing goes on (an office visit, a flooded street). */
  blocked(): boolean;
  /** Street characters (the sim's extras): new ones are pushed here. */
  extras(): Character[];
  /** The agents in the office. */
  agents(): Iterable<Character>;
  /** A new street character (not yet in the world), or null if the art fails. */
  npc(id: string, name: string, look: 'f' | 'm', seed: number, patch: Partial<Appearance>): Character | null;
  say(ch: Character, text: string): void;
  /** Debug: drops what an idle agent is doing (if it can be dropped) so they're free to walk out; false if not. */
  free(ch: Character): boolean;
  /** An agent leaves the desk, does `out` (starting at the corridor door) and comes back to eat `held` at the desk. */
  outing(ch: Character, out: Step[], held: HeldItem): void;
  /** Where street characters come from / go to (px): the west and east ends of the sidewalk. */
  westX(): number;
  eastX(): number;
}

export const BANHTRANG_VENDOR_ID = 'npc:banh-trang';
const KID_PREFIX = 'npc:banh-trang-kid:';

const between = (rng: () => number, [a, b]: readonly [number, number]) => Math.round(a + rng() * (b - a));

/** The stand's night: her, the kids, the agents who walk out. The sim calls `tick` once a second. */
export class BanhTrangStand {
  /** She's set up at the spot (stool out, grilling). */
  up = false;
  /** Customer spots (kids, agents). */
  readonly spots = new Stall(BANHTRANG_SPOTS.length);
  /** Debug: the stand is out until then whatever the hour (ms epoch). */
  forcedUntil = 0;
  private kidsDay = '';
  private kidsAt = 0;
  private kidSeq = 0;
  private agentsDay = '';
  private agentsSent = 0;
  private nextCallAt = 0;

  constructor(private readonly host: BanhTrangHost) {}

  /** The stand is out (the hour, or forced by debug). */
  on(now: number): boolean {
    return !this.host.blocked() && (banhtrangOpen(this.host.hourOf(now)) || now < this.forcedUntil);
  }

  vendor(): Character | undefined {
    return this.host.extras().find((e) => e.id === BANHTRANG_VENDOR_ID && !e.gone);
  }

  /** Where the stand is drawn (bottom center, px): ahead of her while she's out, null otherwise. */
  stand(): { x: number; y: number } | null {
    const v = this.vendor();
    return v ? standAt(v) : null;
  }

  tick(now: number): void {
    const open = this.on(now);
    let v = this.vendor();
    if (open && !v && !this.host.extras().some((e) => e.id === BANHTRANG_VENDOR_ID)) v = this.spawnVendor(now) ?? undefined;
    if (!v) {
      this.up = false;
      return;
    }
    if (this.up && !v.step && !v.queue.length) this.planVendor(v, open, now);
    if (!this.up || !open) return;
    // the kids: once a night, at a moment picked in their window
    const day = dayKey(now);
    if (this.kidsDay !== day && kidsTime(this.host.hourOf(now))) {
      if (!this.kidsAt) this.kidsAt = now + Math.random() * 20 * 60_000;
      if (now >= this.kidsAt) {
        this.kidsDay = day;
        this.kidsAt = 0;
        this.kidsNow(now);
      }
    }
    // now and then an idle agent walks out for one
    if (this.agentsDay !== day) {
      this.agentsDay = day;
      this.agentsSent = 0;
    }
    if (this.agentsSent < MAX_AGENTS && this.spots.hasFree() && Math.random() < AGENT_CHANCE) {
      for (const c of this.host.agents()) if (this.agentOut(c)) break;
    }
  }

  /** 2–3 kids walk up from one end of the sidewalk, a little apart. Returns how many came (0: no stand, or no room). */
  kidsNow(now: number): number {
    if (!this.up) return 0;
    const n = Math.min(2 + (Math.random() < 0.5 ? 1 : 0), this.spots.taken.filter((t) => !t).length);
    const fromWest = Math.random() < 0.5;
    let sent = 0;
    for (let i = 0; i < n; i++) if (this.spawnKid(now, i, fromWest)) sent++;
    return sent;
  }

  /** Whoever is idle at the desk walks out to buy one now. Returns how many went. */
  agentsNow(): number {
    if (!this.up) return 0;
    let n = 0;
    for (const c of this.host.agents()) if (this.spots.hasFree() && this.host.free(c) && this.agentOut(c, true)) n++;
    return n;
  }

  /** Frees the spot `id` held (an agent who left, or whose plan was dropped). */
  release(id: string): void {
    this.spots.release(id);
  }

  /** Debug: the stand comes now and stays 5 minutes (whatever the hour). */
  forceNow(now: number): boolean {
    if (this.host.blocked()) return false;
    this.forcedUntil = now + 5 * 60_000;
    return true;
  }

  /** Back from a hidden tab: she's gone (she comes back if it's still the hour), the kids and orders with her. */
  reset(): void {
    this.up = false;
    this.spots.clear();
  }

  /** She carries the stand in along the curb, sets up and sits down to grill. */
  private spawnVendor(now: number): Character | null {
    const ch = this.host.npc(BANHTRANG_VENDOR_ID, tr('Bánh tráng auntie'), 'f', 7457, {
      top: '#b5476a',
      topAccent: '#e8a0b4',
      topStyle: 'blouse',
      bottom: '#3a3348',
      hairStyle: 'bun',
      accessory: 'none',
    });
    if (!ch) return null;
    const pts = vendorRouteIn(this.host.westX());
    ch.x = pts[0];
    ch.y = pts[1];
    ch.dir = 'right';
    const seat = BANHTRANG_SEAT;
    ch.queue.push(
      { t: 'route', pts },
      {
        t: 'do',
        fn: () => {
          this.up = true;
          ch.seated = true;
          ch.sortY = seatDepth(seat);
          ch.dir = seat.dir;
        },
      },
    );
    this.host.extras().push(ch);
    this.nextCallAt = now + 4_000;
    return ch;
  }

  /** Her next stretch at the stand: grilling, fanning the coals, calling out; at closing, packs up and goes. */
  private planVendor(v: Character, open: boolean, now: number): void {
    const rng = v.rng;
    if (!open && this.spots.taken.every((t) => !t)) {
      v.queue.push(
        {
          t: 'do',
          fn: () => {
            this.up = false;
            v.seated = false;
            v.sortY = null;
          },
        },
        { t: 'route', pts: vendorRouteOut(this.host.eastX()) },
        { t: 'remove' },
      );
      return;
    }
    const seated = { dir: BANHTRANG_SEAT.dir } as const;
    if (now >= this.nextCallAt && open) {
      this.nextCallAt = now + between(rng, [25_000, 50_000]);
      v.queue.push({ t: 'do', fn: () => this.host.say(v, vendorCall(rng)) });
    }
    // turning the rice paper over the coals, then now and then a few strokes of the hand fan
    v.queue.push({ t: 'act', pose: 'type', ms: between(rng, [4_000, 9_000]), ...seated });
    if (rng() < 0.45) v.queue.push({ t: 'act', pose: 'play', held: 'paddle', ms: between(rng, [1_800, 3_000]), ...seated });
    else v.queue.push({ t: 'act', pose: 'sit', ms: between(rng, [1_500, 4_000]), ...seated });
  }

  /** The steps of buying at spot `i` for `ch` (who is standing at it): orders, waits for it on the grill, takes it. */
  private buy(ch: Character, i: number, order: string): Step[] {
    const rng = ch.rng;
    const spot = BANHTRANG_SPOTS[i];
    return [
      {
        t: 'do',
        fn: () => {
          this.spots.sit(i, ch.id);
          this.host.say(ch, order);
          const v = this.vendor();
          if (v) {
            v.chatEmoji = '🔥';
            v.chatUntil = this.host.now() + 2_000;
          }
        },
      },
      { t: 'act', pose: 'stand', dir: spot.dir, ms: between(rng, GRILL_MS) },
      {
        t: 'do',
        fn: () => {
          const v = this.vendor();
          if (v) this.host.say(v, vendorHand(v.rng));
        },
      },
      { t: 'act', pose: 'stand', held: 'banhtrang', dir: spot.dir, ms: between(rng, [1_200, 2_000]) },
      {
        t: 'do',
        fn: () => {
          this.spots.release(ch.id);
          if (rng() < 0.5) this.host.say(ch, eatLine(rng));
        },
      },
    ];
  }

  /** A kid walks in from one end, buys one, and walks back the way they came, eating. */
  private spawnKid(now: number, i: number, fromWest: boolean): boolean {
    const n = ++this.kidSeq;
    const id = `${KID_PREFIX}${n}`;
    const at = this.spots.reserve(id, Math.random);
    if (at < 0) return false;
    const seed = 83_000 + n * 131;
    let r = seed;
    const lookRng = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const { look, patch } = kidLook(i, lookRng);
    const ch = this.host.npc(id, tr('Neighborhood kid'), look, seed, patch);
    if (!ch) {
      this.spots.release(id);
      return false;
    }
    ch.crowd = true;
    const end = fromWest ? this.host.westX() : this.host.eastX();
    // a little apart, one after the other
    const from = end + (fromWest ? -1 : 1) * i * 22;
    const spot = BANHTRANG_SPOTS[at];
    const pts = kidRouteIn(from, spot);
    ch.x = pts[0];
    ch.y = pts[1];
    ch.dir = fromWest ? 'right' : 'left';
    ch.queue.push(
      { t: 'route', pts },
      ...this.buy(ch, at, kidOrder(ch.rng)),
      { t: 'route', pts: kidRouteOut(spot, end), held: 'banhtrang' },
      { t: 'remove' },
    );
    void now;
    this.host.extras().push(ch);
    return true;
  }

  /** An idle agent at the desk walks out to buy one (if a spot is free). */
  private agentOut(c: Character, now = false): boolean {
    if (c.leaving || c.mode !== 'idle' || c.outdoors || c.gathering || c.inside || c.step || c.queue.length) return false;
    if (!now && (!c.homeSpot || c.atSpot !== c.homeSpot || c.pose === 'sleep')) return false;
    const i = this.spots.reserve(c.id, c.rng);
    if (i < 0) return false;
    this.agentsSent++;
    this.host.outing(
      c,
      [{ t: 'go', tx: TEA_DOOR.tx, ty: TEA_DOOR.ty }, { t: 'route', pts: routeToSeat(BANHTRANG_SPOTS[i]), trail: 'out' }, ...this.buy(c, i, agentOrder(c.rng))],
      'banhtrang',
    );
    return true;
  }
}

/** Local calendar day of `now` (the kids come once a night). */
function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
