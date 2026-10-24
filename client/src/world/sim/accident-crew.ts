// The people of a traffic accident (sim/accident.ts): the rider who went down (sits by the bike holding a leg), the
// other rider (gets off, argues, asks if they're okay, rides on), the onlookers on the sidewalks, the traffic police
// officer (walks up, puts out cones, directs the traffic past one side at a time, writes it up in the notebook,
// wheels the bike to the curb, picks up the cones and wheels it off) and the two medics in white (hop out of the
// ambulance, bandage the rider and help them in). All street characters (the sim's extras), never the agents.
// Pure (no DOM): the sim lends the crew a few hooks (AccidentHost); the street (sim/traffic.ts) owns the scene.
import { tr } from '../../../../shared/i18n';
import type { Appearance, Dir } from '../../art/api';
import { STREET_H, STREET_Y } from '../layout/exterior';
import {
  ACCIDENT_T,
  conePoints,
  curbSpot,
  medicLine,
  officerLine,
  officerSpot,
  onlookerLine,
  otherLines,
  riderLine,
  riderSpot,
  type AccidentScene,
} from './accident';
import type { Character } from './character';
import { policeGesture } from './police';
import { LANE_Y } from './tea';
import { riderSeed } from './traffic';

export interface AccidentHost {
  now(): number;
  /** Street characters (the sim's extras): new ones are pushed here. */
  extras(): Character[];
  /** Everyone drawn (agents, extras, the visitor), for the onlookers. */
  people(): Iterable<Character>;
  /** Is this one of the office's agents? */
  isAgent(ch: Character): boolean;
  /** A new street character (not yet in the world), or null if the art fails. */
  npc(id: string, name: string, look: 'f' | 'm', seed: number, patch: Partial<Appearance>): Character | null;
  say(ch: Character, text: string): void;
  /** An office visit: nothing of this goes on there. */
  visit(): boolean;
  /** Something else is going on (the siesta, the New Year party, the disco, a power cut, a visit): no new crash. */
  blocked(): boolean;
}

/** The sidewalks' walking lines (feet, px): the near one (the building's side) and the far one. */
const NEAR_WALK = LANE_Y + 14;
const FAR_WALK = STREET_Y + STREET_H + 10;
/** The officer comes from this far up the street, along the sidewalk on the crash's side. */
const OFFICER_FROM = 230;
/** Ambulance half length (px), as the street's cars. */
const AMB_HALF = 29;
const ID = 'npc:accident:';
/** The medics' white uniform with a red accent, white cap. */
const MEDIC: Partial<Appearance> = { top: '#f4f6f8', topAccent: '#d8423c', topStyle: 'jacket', bottom: '#e6eaee', shoes: '#2e3648', accessory: 'cap', accessoryColor: '#f4f6f8', lanyard: null };
/** The officer: the traffic police uniform (with the 'csgt' costume's cap), as the one at the crossing. */
const OFFICER: Partial<Appearance> = { top: '#d9a62e', topAccent: '#a87a18', topStyle: 'shirt_tie', bottom: '#4b5a2e', shoes: '#1d2230', accessory: 'none', lanyard: null };

const face = (sign: number): Dir => (sign > 0 ? 'right' : 'left');

export class AccidentCrew {
  /** The street's accident this frame (the renderer passes it on; null: none). */
  scene: AccidentScene | null = null;
  private id = 0;
  private rider: Character | null = null;
  private other: Character | null = null;
  private officer: Character | null = null;
  private medics: Character[] = [];
  private officerSent = false;
  private medicsSent = false;
  private atRider = 0;
  private riderIn = false;
  private emojiAt = 0;
  private wheeling = false;
  private wheelDx = 0;

  constructor(private readonly host: AccidentHost) {}

  /** No new crash now (the sim's other goings-on); the renderer tells the street. */
  get off(): boolean {
    return this.host.blocked();
  }

  /** Every frame, after the extras stepped: who comes in now, the officer's gestures, the wheeled bike. */
  tick(now: number): void {
    const s = this.scene;
    if (s && this.host.visit()) s.done = true;
    if (!s || s.done || s.id !== this.id) {
      if (this.id) this.dismiss();
      if (!s || s.done) return;
      this.start(s, now);
    }
    if (!this.officerSent && now >= s.officerDue) this.sendOfficer(s);
    if (!this.medicsSent && s.ambulance === 'there') this.sendMedics(s);
    // no officer (the art failed, or he's gone): once the ambulance has left, the scene clears by itself
    if (this.officerSent && (!this.officer || this.officer.gone) && (s.ambulance === 'leaving' || s.ambulance === 'gone')) {
      s.directing = false;
      s.cones = 0;
      s.bike = 'gone';
      s.done = true;
      return;
    }
    this.footing(s);
    const o = this.officer;
    if (o && !o.gone) {
      if (s.directing) {
        if (now >= s.holdUntil) {
          s.hold = s.hold === 1 ? -1 : 1;
          s.holdUntil = now + ACCIDENT_T.hold;
          if (o.sayUntil < now && o.rng() < 0.4) this.host.say(o, officerLine(o.rng));
        }
        const g = policeGesture(s.hold, now);
        o.dir = g.dir;
        o.setPose(g.pose, g.pose === 'use' ? 'baton' : 'none');
      }
      if (s.bike === 'wheeled') {
        // the bike goes along at the officer's side, ahead of them when walking along the street
        if (!this.wheeling) {
          this.wheeling = true;
          this.wheelDx = Math.max(-12, Math.min(12, s.bikeX - o.x));
        }
        const want = o.pose !== 'walk' || o.dir === 'up' || o.dir === 'down' ? this.wheelDx : o.dir === 'left' ? -9 : 9;
        this.wheelDx += (want - this.wheelDx) * 0.1;
        s.bikeX = o.x + this.wheelDx;
        s.bikeY = o.y + 1;
      } else this.wheeling = false;
    }
    // the rider holds the leg (now and then a wince)
    const r = this.rider;
    if (r && !r.gone && !s.bandaged && now >= this.emojiAt && r.sayUntil < now) {
      this.emojiAt = now + 4_000;
      r.chatEmoji = '🤕';
      r.chatUntil = now + 2_500;
    }
  }

  /**
   * Where the crew stands out on the road (feet, into the scene's `walkers`) for the street to stop short of them: the
   * riders, the medics and the officer while he walks about (not while he directs, standing beside the traffic).
   */
  private footing(s: AccidentScene): void {
    const w = (s.walkers ??= []);
    w.length = 0;
    const add = (ch: Character | null) => {
      if (!ch || ch.gone || ch.inside || ch.y < STREET_Y || ch.y > STREET_Y + STREET_H) return;
      if (ch === this.officer && s.directing) return;
      w.push(ch.x, ch.y);
    };
    add(this.rider);
    add(this.other);
    add(this.officer);
    for (const m of this.medics) add(m);
  }

  /** Coming back from a hidden tab (the extras are gone already): the accident is over too. */
  reset(): void {
    if (this.scene) this.scene.done = true;
    this.dismiss();
  }

  /** The crash: the rider on the ground, the other rider off the bike, the sidewalks look. */
  private start(s: AccidentScene, now: number): void {
    this.id = s.id;
    this.officerSent = false;
    this.medicsSent = false;
    this.atRider = 0;
    this.riderIn = false;
    this.emojiAt = now + 2_500;
    const r = riderSeed(s.variant);
    const rider = this.host.npc(`${ID}rider`, tr('Passer-by'), r.look, r.seed, { accessory: 'cap', accessoryColor: r.helmet });
    if (rider) {
      const spot = riderSpot(s);
      rider.crowd = true;
      rider.plain = true;
      rider.x = s.x;
      rider.y = s.bikeY + 1;
      rider.dir = face(s.dir);
      rider.chatEmoji = '😵';
      rider.chatUntil = now + 2_000;
      rider.queue.push(
        { t: 'act', pose: 'sit', ms: 1_800, dir: face(s.dir) },
        { t: 'do', fn: () => this.host.say(rider, riderLine(rider.rng)) },
        { t: 'route', pts: [spot.x, spot.y] },
        { t: 'until', cond: () => s.bandaged || s.done, minMs: 500, maxMs: ACCIDENT_T.max, pose: 'sit', dir: face(-s.dir) },
        // patched up: walks with the medics to the ambulance's back doors and gets in
        { t: 'do', fn: () => rider.queue.unshift({ t: 'route', pts: this.rearPts(s, 0) }, { t: 'do', fn: () => (this.riderIn = true) }, { t: 'remove' }) },
      );
      this.host.extras().push(rider);
      this.rider = rider;
    }
    if (s.other !== null && s.otherKind === 'bike') {
      const o = riderSeed(s.other);
      const other = this.host.npc(`${ID}other`, tr('Passer-by'), o.look, o.seed, { accessory: 'cap', accessoryColor: o.helmet });
      if (other) {
        const [angry, worried] = otherLines(other.rng);
        other.crowd = true;
        other.plain = true;
        other.x = s.otherX + s.dir * 4;
        other.y = s.otherY + 4;
        other.dir = face(s.dir);
        other.queue.push(
          { t: 'act', pose: 'stand', ms: 700, dir: face(s.dir) },
          { t: 'do', fn: () => this.host.say(other, angry) },
          { t: 'act', pose: 'talk', ms: 3_500, dir: face(s.dir) },
          { t: 'do', fn: () => this.host.say(other, worried) },
          { t: 'until', cond: () => this.host.now() >= s.otherUntil - 250 || s.done, minMs: 1_000, maxMs: 30_000, pose: 'stand', dir: face(s.dir) },
          { t: 'remove' },
        );
        this.host.extras().push(other);
        this.other = other;
      }
    }
    this.onlookers(s, now);
  }

  /** Whoever is out on a sidewalk close by turns to look; a street character says something; someone films it. */
  private onlookers(s: AccidentScene, now: number): void {
    let spoke = false;
    let filmed = false;
    for (const ch of this.host.people()) {
      if (ch.inside || ch.id.startsWith(ID) || Math.abs(ch.x - s.x) > 180) continue;
      const near = ch.y > STREET_Y - 48 && ch.y < STREET_Y + 4;
      const far = ch.y > STREET_Y + STREET_H - 4 && ch.y < STREET_Y + STREET_H + 48;
      if (!near && !far) continue;
      if (!this.host.isAgent(ch) && !spoke && ch.sayUntil < now) {
        spoke = true;
        this.host.say(ch, onlookerLine(ch.rng));
        continue;
      }
      ch.chatEmoji = !filmed && this.host.isAgent(ch) ? '📱' : '👀';
      filmed ||= ch.chatEmoji === '📱';
      ch.chatUntil = now + 5_000;
    }
  }

  /**
   * The officer: along the sidewalk on the crash's side, out to the cones' spots (one, two, three), to the spot
   * upstream of them to direct the traffic until the ambulance is there; writes it up by the rider until they're in;
   * wheels the bike to the curb, picks up the cones and wheels the bike off along the sidewalk.
   */
  private sendOfficer(s: AccidentScene): void {
    this.officerSent = true;
    const o = this.host.npc(`${ID}police`, tr('Traffic police'), 'm', 9931, OFFICER);
    if (!o) return;
    o.costume = 'csgt';
    o.crowd = true;
    const walk = s.dir > 0 ? NEAR_WALK : FAR_WALK;
    const cones = conePoints(s);
    const spot = officerSpot(s);
    const rider = riderSpot(s);
    const curb = curbSpot(s, STREET_Y, STREET_H);
    // the line just outside the cones, on the free lane's side, to walk from one end of the scene to the other
    const side = spot.y;
    const toScene = -s.dir;
    o.x = s.x - s.dir * OFFICER_FROM;
    o.y = walk;
    o.dir = face(s.dir);
    const now = () => this.host.now();
    const put = (n: number) => () => (s.cones = Math.max(s.cones, n));
    const pick = (n: number) => () => (s.cones = Math.min(s.cones, n));
    o.queue.push(
      { t: 'route', pts: [cones[0].x - s.dir * 6, walk, cones[0].x - s.dir * 6, cones[0].y] },
      { t: 'act', pose: 'use', ms: 700, dir: face(s.dir) },
      { t: 'do', fn: put(1) },
      { t: 'route', pts: [cones[1].x - s.dir * 6, cones[1].y] },
      { t: 'act', pose: 'use', ms: 600, dir: face(s.dir) },
      { t: 'do', fn: put(2) },
      { t: 'route', pts: [cones[1].x, side, cones[2].x + s.dir * 6, side, cones[2].x + s.dir * 6, cones[2].y] },
      { t: 'act', pose: 'use', ms: 600, dir: face(toScene) },
      { t: 'do', fn: put(3) },
      { t: 'route', pts: [cones[2].x + s.dir * 6, side, spot.x, spot.y] },
      {
        t: 'do',
        fn: () => {
          s.officerAt = now();
          s.directing = true;
          // the oncoming side waits first: the queue behind the scene gets going
          s.hold = s.dir > 0 ? -1 : 1;
          s.holdUntil = now() + ACCIDENT_T.hold;
          this.host.say(o, officerLine(o.rng));
        },
      },
      { t: 'until', cond: () => s.ambulance === 'there' || s.loaded || s.done, minMs: 2_000, maxMs: 120_000, pose: 'stand' },
      { t: 'do', fn: () => (s.directing = false) },
      // the notebook, beside the rider (out of the medics' way)
      { t: 'route', pts: [rider.x + s.dir * 24, side, rider.x + s.dir * 24, rider.y + 2] },
      { t: 'until', cond: () => s.loaded || s.done, minMs: 3_000, maxMs: 60_000, pose: 'read', held: 'papers', dir: face(-s.dir) },
      { t: 'until', cond: () => s.ambulance === 'leaving' || s.ambulance === 'gone' || s.done, minMs: 1_500, maxMs: 15_000, pose: 'read', held: 'papers', dir: face(-s.dir) },
      // the bike to the curb
      { t: 'route', pts: [s.x - s.dir * 8, s.bikeY + 2] },
      { t: 'do', fn: () => (s.bike = 'wheeled') },
      { t: 'route', pts: [curb.x, s.bikeY + 2, curb.x, curb.y] },
      {
        t: 'do',
        fn: () => {
          s.bike = 'parked';
        },
      },
      // the cones, the last one first
      { t: 'route', pts: [cones[2].x + s.dir * 6, curb.y, cones[2].x + s.dir * 6, cones[2].y] },
      { t: 'act', pose: 'use', ms: 500, dir: face(toScene) },
      { t: 'do', fn: pick(2) },
      { t: 'route', pts: [cones[1].x - s.dir * 6, cones[1].y] },
      { t: 'act', pose: 'use', ms: 500, dir: face(s.dir) },
      { t: 'do', fn: pick(1) },
      { t: 'route', pts: [cones[0].x - s.dir * 6, cones[0].y] },
      { t: 'act', pose: 'use', ms: 500, dir: face(s.dir) },
      { t: 'do', fn: pick(0) },
      // back for the bike and off along the sidewalk with it
      { t: 'do', fn: () => o.queue.unshift({ t: 'route', pts: [s.bikeX + s.dir * 9, curb.y] }) },
      { t: 'do', fn: () => (s.bike = 'wheeled') },
      { t: 'route', pts: [curb.x - s.dir * 30, walk, s.x - s.dir * OFFICER_FROM, walk] },
      {
        t: 'do',
        fn: () => {
          s.bike = 'gone';
          s.done = true;
        },
      },
      { t: 'remove' },
    );
    this.host.extras().push(o);
    this.officer = o;
  }

  /**
   * The medics: out of the back doors, to either side of the rider, bandage them, walk them to the ambulance; the last
   * one in closes the doors and it may go.
   */
  private sendMedics(s: AccidentScene): void {
    this.medicsSent = true;
    s.doors = true;
    const rider = riderSpot(s);
    for (let i = 0; i < 2; i++) {
      const m = this.host.npc(`${ID}medic:${i}`, tr('Paramedic'), i ? 'f' : 'm', 5511 + i * 17, MEDIC);
      if (!m) continue;
      m.crowd = true;
      m.plain = true;
      const [x, y] = this.rearPts(s, i);
      m.x = x;
      m.y = y;
      const sideSign = i ? 1 : -1;
      const last = i === 1;
      m.queue.push(
        { t: 'act', pose: 'stand', ms: 400 + i * 300 },
        { t: 'route', pts: [rider.x + sideSign * 10, rider.y + 2] },
        { t: 'do', fn: () => (this.atRider++, i === 0 && this.host.say(m, medicLine(m.rng))) },
        { t: 'act', pose: 'use', ms: ACCIDENT_T.treat, dir: face(-sideSign) },
        { t: 'do', fn: () => (s.bandaged = true) },
        { t: 'act', pose: 'stand', ms: 400, dir: face(-sideSign) },
        { t: 'route', pts: this.rearPts(s, i) },
        ...(last
          ? ([
              { t: 'until', cond: () => this.riderIn || !this.rider || this.rider.gone || s.done, minMs: 300, maxMs: 10_000, pose: 'stand' },
              {
                t: 'do',
                fn: () => {
                  s.doors = false;
                  s.loaded = true;
                },
              },
            ] as const)
          : []),
        { t: 'remove' },
      );
      this.host.extras().push(m);
      this.medics.push(m);
    }
    // nobody could come out (the art failed): the ambulance goes anyway
    if (!this.medics.length) {
      s.bandaged = true;
      s.loaded = true;
      s.doors = false;
    }
  }

  /** Just behind the ambulance's back doors (feet, px), a little apart for each (0, 1). */
  private rearPts(s: AccidentScene, i: number): number[] {
    return [s.ambX - s.ambDir * (AMB_HALF + 4 + i * 6), s.ambY + 2 + i * 3];
  }

  /** The scene is gone (over, dropped, a hidden tab): whoever is still around vanishes. */
  private dismiss(): void {
    for (const ch of [this.rider, this.other, this.officer, ...this.medics]) if (ch && !ch.gone) ch.gone = true;
    this.rider = this.other = this.officer = null;
    this.medics = [];
    this.id = 0;
  }
}
