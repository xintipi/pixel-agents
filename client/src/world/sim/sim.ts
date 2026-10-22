// Office simulation: reconciles server snapshots with the world's characters and rooms,
// plans behaviors and runs the step queues every frame.
import { partsKey } from '../../../../shared/appearance';
import type { AgentInfo, OfficeSnapshot, Provider, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, Dir, RoomTheme } from '../../art/api';
import type { SoundCueKind, WorldOptions } from '../api';
import { COL_W, COMPACT_DELAY_MS, DISMANTLE_DELAY_MS, FOOT_DX, FOOT_DY, MISSING_DEBOUNCE_MS, RUN_SPEED, TILE, WALK_SPEED } from '../constants';
import { assembleBuilding, type BuildingLayout } from '../layout/building';
import { RECEPTION_ID } from '../layout/core';
import { columnsFor, inRect } from '../layout/geometry';
import { layoutProjectRoom } from '../layout/room';
import type { SpotDef, SpotKind } from '../layout/types';
import { PathFinder } from '../path/astar';
import { BLOCKED, FREE, SEAT } from '../path/grid';
import { PROGRAM_SEED } from '../social/gathering';
import { hasTrait, personaFor, soloWeights } from '../social/persona';
import { Social } from '../social/social';
import { browserStorage, type StorageLike } from '../social/wallet';
import {
  canDismantle,
  chooseSeat,
  idleSitMs,
  isLastInRoom,
  isLongIdle,
  modeFor,
  pickIdleActivity,
  shouldRun,
  type IdleActivity,
  type Mode,
} from './behavior';
import { Character, dirOf, facing } from './character';
import { Elevator } from './elevator';
import { PARTY_MS } from '../../../../shared/github';
import { RoomFxState } from './github';
import { PetHerd, type PetWorld } from './pets';
import type { WorkTreeStage } from '../../art/worktree';
import { tetDay } from '../api';
import { CAFE_ID, LOUNGE_ID } from '../layout/core';
import { RoomState } from './room-state';
import { countShells, latestShellDone, shellLabel, shellStage, shellWaitSince, spinDir, spinPhase, yawnPhase } from './shell';
import { SpotRegistry } from './spots';
import type { Step } from './steps';
import { PARKING, floodLine } from './traffic';
import {
  LANE_Y,
  TEA_DOOR,
  TEA_SEATS,
  TEA_SELLER_SEAT,
  Stall,
  TeaStall,
  chatLine,
  orderLine,
  routeToSeat,
  seatDepth,
  sellerLine,
  sellerRouteIn,
  sellerRouteOut,
  teaOpen,
  wayBack,
} from './tea';
import { lunchTime, SIESTA_WAKE_SPREAD_MS, siestaLevel, siestaTime } from './siesta';
import { BANHMI_SPOTS, BANHMI_VENDOR_SPOT, banhmiOpen, cartAt, pickOrder, vendorLine, vendorReply, vendorRouteIn, vendorRouteOut } from './banhmi';
import { EXIT_RADIUS, NO_INTENT, stepFree, tileAt, VISITOR_LANYARD, type VisitorIntent } from './visitor';
import { tr } from '../../../../shared/i18n';
import { ALTAR_CHANCE, INCENSE_MS, altarState, cooldownOver, dayKey, morningDue, prayerLine, waitingLong } from './altar';

/**
 * One-off visual effect the simulation asks the renderer for (drained every frame): confetti (shell
 * finished), coins flying from whoever lost the bet to whoever won, and a sparkle (mirror).
 */
export type WorldEffect =
  | { kind: 'confetti'; charId: string; at: number }
  | { kind: 'coins'; charId: string; toId: string; at: number }
  | { kind: 'sparkle'; charId: string; at: number };

export { SHELL_DONE_TOOL } from './shell';

/** How the `Sim` runs (fixed at creation). */
export interface SimMode {
  /**
   * Visit to a building in the world (Visit scene): no timing comes down from the world (the `statusSince` are "now", on entry),
   * so nothing that depends on how long ago (popcorn, spins, cobweb, yawns and nap of whoever waits on a shell, nap
   * of whoever has been idle a long time, balloon timer); plus the visitor and the visit lights.
   */
  visit?: boolean;
}

/** Visit lights: 'away' (paused) turns everything off; 'discreet' lights the empty rooms; 'live' is the usual `Sim`. */
export type VisitLight = 'live' | 'discreet' | 'away';
/** Celebration (shell finished) and lament (failed/killed). */
/** Share of the main agents who come (and go) by motorbike, when the street is drawn. */
const BIKE_SHARE = 0.5;
/** Riding in never takes longer than this (ms): past it, the agent appears at the spot anyway. */
const BIKE_RIDE_MAX_MS = 45_000;
const CHEER_MS = 2_200;
const SULK_MS = 4_000;
/** Three errors within this window: hands on head for FRUSTRATED_MS. */
const FRUSTRATION_WINDOW_MS = 120_000;
const FRUSTRATED_MS = 5_000;
/** Disco: how long it lasts and the lights fade. */
const DISCO_MS = 30_000;
/** Pizza party: how long it lasts after the delivery guy drops off the boxes. */
const PIZZA_MS = 90_000;
/** Napping at the desk this long, nonstop: someone (a coworker or the dog) comes to wake them up. */
const NAP_WAKE_MS = 70_000;
/** Id of the pizza delivery guy (extra). */
const PIZZA_ID = 'npc:pizza';
/** Id of the iced tea seller (extra). */
const TEA_SELLER_ID = 'npc:tra-da';
/** The seller walks in from (and back to) this x (px), off to the west on the sidewalk. */
const TEA_SELLER_FROM_X = -19 * TILE;
/** Id of the bánh mì vendor (extra). He pushes the cart in from the west and off to the east. */
const BANHMI_VENDOR_ID = 'npc:banh-mi';
/** Once awake, doesn't nap for this long. */
const AWAKE_MS = 5 * 60_000;
const DISCO_FADE_MS = 700;
const MAX_EFFECTS = 32;
/** Owner of the seat reservations of a ghost room (old address after a move). */
const GHOST_OWNER = '@mudança';

const FALLBACK_THEME: RoomTheme = {
  carpet: '#5b7fa6',
  carpet2: '#4f7093',
  wall: { base: '#e7e3db', trim: '#9b9184', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

const LOUNGE_SEATS: SpotKind[] = ['sofa', 'armchair', 'beanbag'];
/** Where you can sit and fiddle with your phone. */
const PHONE_SEATS: SpotKind[] = ['beanbag', 'sofa', 'armchair', 'cafe_seat', 'bench'];
/** Rest seats allowed already at initial load (corridor/bathroom benches are not). */
const INITIAL_LOUNGE_SEATS: SpotKind[] = ['sofa', 'armchair', 'beanbag', 'cafe_seat'];
/** Fraction of eligible idlers that starts away from the desk. */
const INITIAL_LOUNGE_SHARE = 0.15;
/** Only someone idle for at least this long may start out resting (whoever just stopped goes right back). */
const INITIAL_LOUNGE_MIN_IDLE_MS = 90_000;
/** Nobody goes for a stroll in the first seconds after the page opens. */
const INITIAL_OUTING_DELAY_MS = 5_000;
const ENTER_MS = 180;

function between(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a);
}

/** What defines a character's appearance (changes when the character is edited). */
const lookSig = (a: AgentInfo): string => `${a.seed}|${a.look}|${partsKey(a.parts)}`;

export class Sim {
  readonly chars = new Map<string, Character>();
  readonly rooms = new Map<string, RoomState>();
  readonly spots = new SpotRegistry();
  readonly elevators: Elevator[] = [];
  building: BuildingLayout;
  readonly finder: PathFinder;
  /** Increments when the building changes (rooms appear/disappear, width). */
  layoutVersion = 0;
  now = 0;
  initialized = false;
  /** furnitureId -> until when the machine is in use (coffee maker brewing). */
  readonly machineUntil = new Map<string, number>();
  /** Occupied stalls (furnitureId). */
  readonly stallBusy = new Set<string>();
  /** Social life: idlers' circles, personalities and wallets (social/social.ts). */
  readonly social: Social;
  /** Debug: agents forced to end and rooms forced to vanish from the snapshot. */
  readonly forcedOffline = new Set<string>();
  readonly hiddenRooms = new Set<string>();
  /** Snapshot accounts (id -> color/letter/tool) for labels: Codex's gets a hollow chip and the badge. */
  accounts = new Map<string, { short: string; color: string; name: string; provider?: Provider }>();
  /** Debug: extra rooms/agents merged into each snapshot (simulated sessions). */
  injected: { rooms: RoomInfo[]; agents: AgentInfo[] } = { rooms: [], agents: [] };
  /** Debug: fields overlaid on real snapshot agents (e.g. forced shells). */
  readonly agentPatches = new Map<string, Partial<AgentInfo>>();
  /** One-off effects (confetti) for the renderer to draw; the renderer empties the list. */
  readonly effects: WorldEffect[] = [];
  /** Room party and alarm (GitHub events; sim/github.ts). */
  readonly roomFx = new RoomFxState();
  /** The office dog and cat (outside `chars`: they are not agents). */
  readonly pets = new PetHerd();
  /** Sounds suggested at a point of the building (coffee machine, stall, pets...); SoundCues drains the list. */
  readonly sfx: { kind: SoundCueKind; x: number; y: number; at: number }[] = [];
  /** Disco (typing "disco"): until when the party goes and when it started (for the fade). */
  discoUntil = 0;
  /** Work tree in the reception (stage by the week's tasks); null = the normal pot. */
  workTreeStage: WorkTreeStage | null = null;
  /** Fixed hour for meals (debug.setHour); null = the clock's. */
  hourOverride: number | null = null;
  /** Siesta (sim/siesta.ts): forced by debug (true/false); null = the clock's. */
  siestaOverride: boolean | null = null;
  /** Siesta going on (checked once a second) and how dim the office is for it (0–1, smoothed; read by the lighting). */
  siestaOn = false;
  siestaDim = 0;
  private siestaTarget = 0;
  /** End of the siesta: when each sleeper wakes up (staggered, not everyone at once). */
  private readonly siestaWakes = new Map<string, number>();
  /** Pizza party: until when and the table tile (for the dog to beg). */
  pizzaUntil = 0;
  pizzaTile: { tx: number; ty: number } | null = null;
  /** Extras who are not agents (the pizza delivery guy): drawn with the people, without an agent label. */
  readonly extras: Character[] = [];
  /** Iced tea stall on the sidewalk: who holds each stool (sim/tea.ts). */
  readonly tea = new TeaStall();
  /** The stall is set up (the seller is there): the renderer shows the stools out or stacked. */
  teaUp = false;
  /** The street is flooded (rain at rush hour; the renderer's traffic says): no tea or bánh mì, people go and look. */
  flooded = false;
  /** The renderer runs the street: main agents may come and go by motorbike (without it, always the elevator). */
  bikes = false;
  /** Who parked their bike on the sidewalk, and in which spot (PARKING). */
  readonly parkedBikes = new Map<string, number>();
  /** Bike trips for the street to carry out (the renderer drains it): riding in to a spot, riding off from it. */
  readonly bikeTrips: { t: 'arrive' | 'depart'; id: string; slot: number; appearance: Appearance }[] = [];
  /** Riders whose bike has just parked (the renderer fills it): they get off and walk in. */
  readonly bikeParked = new Set<string>();
  /** Thần Tài altar (sim/altar.ts): incense lit until; last prayer for a waiting agent; day of the morning incense. */
  altarLitUntil = 0;
  private altarPrayedAt = 0;
  private altarMorningDay = '';
  /** Morning bánh mì cart: who holds each spot at the glass case (sim/banhmi.ts). */
  readonly banhmi = new Stall(BANHMI_SPOTS.length);
  /** The cart is parked and selling. */
  banhmiUp = false;
  /** New Year (Dec 31 and Tết eve): current phase and the one forced by debug. */
  newYearOverride: 'countdown' | 'party' | null = null;
  newYear: { phase: 'countdown' | 'party' | null; secondsLeft: number; lunar: boolean } = { phase: null, secondsLeft: 0, lunar: false };
  private celebratedYear = '';
  discoStart = 0;
  /** What the building offers the pets (paths and who is parked at a desk). */
  private readonly petWorld: PetWorld = {
    grid: () => this.building.grid,
    findPath: (sx, sy, gx, gy, out) => this.finder.find(sx, sy, gx, gy, out),
    restingPeople: () => {
      const out: { id: string; tx: number; ty: number; asleep: boolean }[] = [];
      for (const ch of this.chars.values()) {
        if (ch.leaving || ch.mode !== 'idle' || !ch.homeSpot || ch.atSpot !== ch.homeSpot) continue;
        const spot = this.spots.get(ch.homeSpot);
        if (spot) out.push({ id: ch.id, tx: spot.tx, ty: spot.ty, asleep: ch.pose === 'sleep' });
      }
      return out;
    },
    personTile: (id) => {
      const ch = this.chars.get(id);
      return ch && !ch.leaving ? { tx: ch.tx, ty: ch.ty } : null;
    },
    cozySpot: (by, rng) => {
      const free = [...this.spots.ofKind('sofa'), ...this.spots.ofKind('armchair'), ...this.spots.ofKind('beanbag')].filter((s) => this.spots.isFree(s.id));
      if (!free.length) return null;
      const s = free[Math.floor(rng() * free.length)];
      if (!this.spots.reserve(s.id, by)) return null;
      return { id: s.id, tx: s.tx, ty: s.ty, x: s.x, y: s.y, sortY: s.sortY };
    },
    releaseSpot: (id, by) => this.spots.release(id, by),
    robotDock: () => this.coreTile(LOUNGE_ID, 8, 10),
    wake: (id) => this.wakeUp(id, this.now),
  };

  /** Free tile closest to local (lx,ly) in a core area (reception, pantry, lounge). */
  private coreTile(areaId: string, lx: number, ly: number): { tx: number; ty: number } | null {
    const area = this.building.core.find((a) => a.id === areaId);
    if (!area) return null;
    // the closest free tile (not a seat), in rings
    const grid = this.building.grid;
    const cx = area.rect.x + lx;
    const cy = area.rect.y + ly;
    for (let r = 0; r <= 4; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && grid.get(cx + dx, cy + dy) === 1) return { tx: cx + dx, ty: cy + dy };
    return null;
  }

  /** "Fetch!": throws the ball to tile (tx,ty) for the dog to retrieve. */
  throwBall(tx: number, ty: number): boolean {
    return this.pets.throwBall(this.petWorld, tx, ty, this.now);
  }
  private lastSnapshot: OfficeSnapshot | null = null;
  /** Since when there is a free slot before the last room (0 = there is none). */
  private gapSince = 0;
  private moveSeq = 0;
  private shrinkPending = false;
  private nextHousekeeping = 0;
  /** Visit to a building in the world (SimMode.visit). */
  readonly visit: boolean;
  /** Visit: my character (outside `chars`: no snapshot, no social life, no reserved seat). */
  visitor: Character | null = null;
  /** Visit: where the keyboard sends the visitor. */
  visitorIntent: VisitorIntent = { ...NO_INTENT };
  /** Visit: the building lights (applied on every snapshot and every second). */
  visitLight: VisitLight = 'live';

  /** Wallets `storage`: null = in memory only (the timelapse doesn't touch the real coins). */
  constructor(
    private readonly art: ArtModule,
    private readonly options: () => WorldOptions,
    storage: StorageLike | null = browserStorage(),
    mode: SimMode = {},
  ) {
    this.visit = !!mode.visit;
    this.social = new Social(this, storage);
    this.building = assembleBuilding(columnsFor([]), [], 0);
    this.finder = new PathFinder(this.building.grid);
    this.spots.setSpots(this.building.spots);
    for (const s of this.spots.ofKind('elevator')) this.elevators.push(new Elevator(this.elevators.length, s.id));
    this.pets.sfx = (kind, x, y) => this.sound(kind, x, y);
    this.pets.place(this.petWorld);
  }

  // =================================================================== snapshot

  applySnapshot(input: OfficeSnapshot, now: number): void {
    let snap = this.injected.rooms.length || this.injected.agents.length ? { ...input, rooms: [...input.rooms, ...this.injected.rooms], agents: [...input.agents, ...this.injected.agents] } : input;
    if (this.agentPatches.size) {
      const patches = this.agentPatches;
      snap = { ...snap, agents: snap.agents.map((a) => (patches.has(a.id) ? { ...a, ...patches.get(a.id) } : a)) };
    }
    this.lastSnapshot = input;
    this.now = now;
    const first = !this.initialized;
    this.initialized = true;
    this.accounts = new Map(snap.accounts.map((a) => [a.id, { short: a.short, color: a.color, name: a.name, ...(a.provider === 'codex' ? { provider: a.provider } : {}) }]));

    // ---- rooms
    let layoutDirty = false;
    const listed = new Set<string>();
    // in arrival order (server slot): at initial load the rooms take slots 0, 1, 2... in that order
    for (const r of [...snap.rooms].sort((a, b) => a.slot - b.slot)) {
      if (this.hiddenRooms.has(r.id)) continue;
      listed.add(r.id);
      const rs = this.rooms.get(r.id);
      if (!rs) {
        this.createRoom(r, first, now);
        layoutDirty = true;
        continue;
      }
      if (rs.info.name !== r.name || rs.info.seed !== r.seed) rs.version++;
      rs.info = r;
      if (!rs.listed) {
        rs.listed = true;
        rs.readyToDismantleAt = 0;
        if (rs.phase === 'dismantling') rs.rebuild(now);
      }
    }
    for (const rs of this.rooms.values()) {
      if (!listed.has(rs.id) && rs.listed) {
        rs.listed = false;
        rs.unlistedAt = now;
      }
    }
    if (layoutDirty) this.relayout();
    this.roomFx.sync(snap.rooms, input.serverTime, now);

    // ---- agents
    const seen = new Set<string>();
    const fresh: Character[] = [];
    for (const a of snap.agents) {
      seen.add(a.id);
      const ch = this.chars.get(a.id);
      if (ch) {
        this.updateAgent(ch, a, now);
        this.social.syncAgent(ch, a, now, true);
        continue;
      }
      if (a.status === 'offline' || this.forcedOffline.has(a.id) || this.hiddenRooms.has(a.roomId)) continue;
      // subagent we never saw working and already finished, or whose parent is leaving: doesn't come in
      if (a.status === 'done') continue;
      if (a.kind === 'sub' && a.parentId) {
        const parent = this.chars.get(a.parentId);
        if (parent && (parent.leaving || parent.gone)) continue;
      }
      const nc = this.spawn(a, first, now);
      if (nc) {
        fresh.push(nc);
        // arrived at the office: wallet with the starting balance (tasks already completed paid silently)
        this.social.syncAgent(nc, a, now, false);
      }
    }
    for (const ch of this.chars.values()) {
      if (!seen.has(ch.id) && !ch.leaving && ch.missingSince === null) ch.missingSince = now;
    }
    // modes (after everyone exists, so subagents can find their parent)
    for (const ch of fresh) {
      ch.mode = this.modeOf(ch);
      this.refreshShell(ch, now);
    }
    if (first) {
      // those working/waiting sit first; idlers afterwards (so no room is left empty)
      const seated = new Set<string>();
      const order = [...fresh].sort((a, b) => Number(a.mode === 'idle') - Number(b.mode === 'idle'));
      for (const ch of order) this.placeInitial(ch, now, seated);
    }
    this.refreshRoomInfo();
    // visit: on entry, the lights already as the building is (dark enters dark, without the light going out)
    if (this.visit) this.applyVisitLight(now, first);
  }

  /** Reapplies the last snapshot (debug). */
  reapply(now: number): void {
    if (this.lastSnapshot) this.applySnapshot(this.lastSnapshot, now);
  }

  private createRoom(r: RoomInfo, first: boolean, now: number): RoomState {
    let theme = FALLBACK_THEME;
    try {
      theme = this.art.roomTheme(r.seed) ?? FALLBACK_THEME;
    } catch {
      theme = FALLBACK_THEME;
    }
    // the building's first free slot (the server slot only gives the arrival order)
    const slot = this.freeSlot();
    const layout = layoutProjectRoom({ id: r.id, slot, seed: r.seed }, theme);
    const rs = new RoomState(r, theme, layout, first ? 'ready' : 'building', now, first, slot);
    this.rooms.set(r.id, rs);
    return rs;
  }

  /** Lowest slot without a room (counting those still being torn down). */
  private freeSlot(): number {
    const used = new Set<number>();
    for (const r of this.rooms.values()) if (r.phase !== 'gone') used.add(r.slot);
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }

  private updateAgent(ch: Character, a: AgentInfo, now: number): void {
    const prevStatus = ch.info.status;
    const hadShells = !!ch.info.shells?.length;
    const prevLook = lookSig(ch.info);
    ch.info = a;
    if (lookSig(a) !== prevLook) {
      try {
        ch.appearance = this.art.appearanceFromSeed(a.seed, { look: a.look, sub: a.kind === 'sub', parts: a.parts });
      } catch {
        // Broken art: keep the appearance it already had.
      }
    }
    ch.missingSince = null;
    if (a.roomId !== ch.roomId && !ch.leaving) {
      if (ch.homeSpot) this.spots.release(ch.homeSpot, ch.id);
      ch.homeSpot = null;
      ch.roomId = a.roomId;
      this.interrupt(ch);
    }
    const act = a.activity;
    if (act && act.id !== ch.lastActivityId) {
      const firstSeen = ch.lastActivityId === null;
      ch.lastActivityId = act.id;
      if (!firstSeen) {
        ch.activityChangedAt = now;
        if (act.kind === 'done') ch.setIcon('check', 2600, now);
        if (act.kind === 'error') this.reactError(ch, now);
        if (act.kind === 'delegate' && ch.info.kind === 'main' && a.status === 'working') this.planDelegate(ch, now);
        // request fulfilled: coins for the work
        if (act.kind === 'done' && ch.info.kind === 'main') {
          this.social.turnDone(ch, now);
          // the dog goes to celebrate with whoever delivered
          this.pets.celebrate(this.petWorld, ch.id, now);
        }
      }
    }
    // end of a shell: celebrate or lament (once per notification)
    const sd = latestShellDone(a);
    if (sd && sd.at > ch.shellDoneAt) {
      ch.shellDoneAt = sd.at;
      this.reactShellDone(ch, !sd.error, now);
    }
    // shells change without the status changing (e.g. foreground command started/finished)
    if (prevStatus !== a.status || hadShells || !!a.shells?.length || ch.mode === 'shell' || this.forcedOffline.has(ch.id)) this.refreshMode(ch);
    this.refreshShell(ch, now);
  }

  /** Recomputes the mode and interrupts the plan if it changed. */
  private refreshMode(ch: Character): void {
    if (ch.leaving) return;
    const mode = this.modeOf(ch);
    if (mode === ch.mode) return;
    const prev = ch.mode;
    ch.mode = mode;
    if (prev === 'idle' && mode !== 'idle') ch.nextOutingAt = 0;
    if (ch.icon === 'zzz') ch.setIcon(null, 0, this.now);
    this.refreshShell(ch, this.now);
    // in a circle, idle <-> waiting on shell changes nothing (stays in the circle)
    if (ch.gathering && (mode === 'idle' || mode === 'shell') && (prev === 'idle' || prev === 'shell')) return;
    // work called in the middle of a circle: tell the group before leaving
    if (ch.gathering) this.social.calledAway(ch, prev, this.now);
    // celebration/lament for the end of a running shell: finish it (short, back to the desk) and the
    // planner follows the new mode; leaving doesn't wait
    if (this.now < ch.reactUntil && mode !== 'leave' && mode !== 'deliver') return;
    ch.reactUntil = 0;
    this.interrupt(ch);
  }

  private modeOf(ch: Character): Mode {
    const a = ch.info;
    if (ch.leaving) return 'leave';
    const parent = a.parentId ? this.chars.get(a.parentId) : undefined;
    const parentGone = !!parent && (parent.leaving || parent.gone);
    const missing = ch.missingSince !== null && this.now - ch.missingSince >= MISSING_DEBOUNCE_MS;
    const offline = this.forcedOffline.has(ch.id);
    if (a.kind === 'sub' && a.status === 'done' && !ch.delivered && !offline && !parentGone) return 'deliver';
    const m = modeFor(offline ? 'offline' : a.status, { kind: a.kind, missing, parentGone, shells: a.shells, now: this.now });
    if (m === 'deliver' && ch.delivered) return 'leave';
    return m;
  }

  // =================================================================== shell wait

  /** Updates start/count/label of the shell wait (on snapshot and when the mode changes). */
  private refreshShell(ch: Character, now: number): void {
    if (ch.mode !== 'shell') {
      ch.shellSince = 0;
      ch.shellCount = 0;
      ch.shellStage = null;
      ch.shellEnteredAt = 0;
      return;
    }
    const a = ch.info;
    if (!ch.shellEnteredAt) ch.shellEnteredAt = now;
    // server and browser clocks may drift a bit: never "in the future"
    ch.shellSince = Math.min(now, shellWaitSince(a));
    ch.shellCount = Math.max(1, countShells(a.shells, a.status !== 'shell'));
    const label = shellLabel(a);
    if (label !== ch.shellLabel) {
      ch.shellLabel = label;
      ch.shellTextKey = -1;
    }
    // visit: no timing came from the world, so the gag doesn't escalate (no popcorn, spin, cobweb or nap)
    ch.shellStage = this.visit ? null : shellStage(now - ch.shellSince);
  }

  /**
   * A shell finished (Activity 'ShellDone'): success -> stands up and celebrates with confetti and ⭐;
   * failure/killed -> little rain cloud ('storm') and slumped shoulders. Then follows the current status.
   */
  private reactShellDone(ch: Character, ok: boolean, now: number): void {
    if (ch.leaving || ch.mode === 'leave' || ch.mode === 'deliver') return;
    ch.setIcon(ok ? 'star' : 'storm', ok ? CHEER_MS : SULK_MS, now);
    if (ok) this.pushEffect({ kind: 'confetti', charId: ch.id, at: now });
    // only acts it out at their own desk and standing still; walking/strolling gets just the icon (and the confetti)
    const home = this.spots.get(ch.homeSpot);
    if (!home || ch.atSpot !== home.id || ch.step || ch.queue.length || ch.gathering) return;
    if (ok) {
      ch.reactUntil = now + CHEER_MS + 2 * ENTER_MS + 200;
      if (home.seated) ch.queue.push({ t: 'exit' });
      ch.queue.push({ t: 'act', pose: 'stretch', ms: CHEER_MS * 0.55 }, { t: 'act', pose: 'raise_hand', ms: CHEER_MS * 0.45 });
      if (home.seated) ch.queue.push({ t: 'enter', spot: home.id });
    } else {
      // head down, dejected, without leaving the chair
      ch.reactUntil = now + SULK_MS;
      ch.queue.push({ t: 'act', pose: home.seated ? 'sleep' : 'stand', ms: SULK_MS });
    }
  }

  /**
   * An error: sweat drop. Three errors within FRUSTRATION_WINDOW_MS and they put their hands on their head for FRUSTRATED_MS
   * (at the desk, without leaving their spot; see restPose), with the little rain cloud.
   */
  private reactError(ch: Character, now: number): void {
    ch.errorTimes = ch.errorTimes.filter((t) => now - t < FRUSTRATION_WINDOW_MS);
    ch.errorTimes.push(now);
    if (ch.errorTimes.length < 3 || now < ch.frustratedUntil) {
      ch.setIcon('sweat', 2200, now);
      return;
    }
    ch.errorTimes = [];
    ch.frustratedUntil = now + FRUSTRATED_MS;
    ch.setIcon('storm', FRUSTRATED_MS, now);
  }

  /**
   * Room party (the same as a merged PR: confetti, banner and the group celebrating) requested by the UI, by an
   * achievement or a big piece of work delivered. `sticky`: the next snapshot doesn't clear it; it ends by itself.
   */
  celebrate(roomId: string, text: string, agentId?: string): void {
    if (!this.rooms.has(roomId) || this.visit) return;
    const now = this.now;
    const cur = this.roomFx.active.get(roomId);
    if (cur && cur.kind === 'alarm') return;
    this.roomFx.active.set(roomId, { roomId, kind: 'party', text, agentId, key: now, start: now, end: now + PARTY_MS, cheered: new Set(), sticky: true });
  }

  /** Suggests a sound at (x, y) (world px); outside a visit, and only a few at a time. */
  sound(kind: SoundCueKind, x: number, y: number): void {
    if (this.visit || this.sfx.length >= 24) return;
    this.sfx.push({ kind, x, y, at: this.now });
  }

  /** Turns the disco on for `ms` (or off, if it's already playing). Returns whether it stayed on. */
  toggleDisco(now: number, ms = DISCO_MS): boolean {
    if (now < this.discoUntil) {
      this.discoUntil = now;
      return false;
    }
    this.discoStart = now;
    this.discoUntil = now + ms;
    return true;
  }

  /** Disco intensity right now (0–1, with fade in and out). */
  discoLevel(now: number): number {
    if (now >= this.discoUntil + DISCO_FADE_MS || now < this.discoStart) return 0;
    const fadeIn = Math.min(1, (now - this.discoStart) / DISCO_FADE_MS);
    const fadeOut = now > this.discoUntil ? 1 - (now - this.discoUntil) / DISCO_FADE_MS : 1;
    return Math.max(0, Math.min(fadeIn, fadeOut));
  }

  /**
   * Pizza party: the delivery guy steps out of the elevator, leaves the boxes on the pantry table and leaves; then whoever is idle
   * goes to eat and the dog sits nearby begging. Returns whether the delivery guy came.
   */
  pizzaParty(now: number): boolean {
    if (this.visit || this.extras.some((e) => e.id === PIZZA_ID) || now < this.pizzaUntil) return false;
    const el = this.elevators[0];
    const spot = el ? this.spots.get(el.spotId) : undefined;
    const table = this.coreTile(CAFE_ID, 6, 6);
    if (!el || !spot || !table) return false;
    let appearance;
    try {
      const base = this.art.appearanceFromSeed(4242, { look: 'm', sub: false });
      appearance = { ...base, top: '#c9363b', topAccent: '#f2c94c', accessory: 'cap' as const, accessoryColor: '#c9363b', lanyard: null };
    } catch {
      return false;
    }
    const info: AgentInfo = {
      id: PIZZA_ID,
      kind: 'main',
      provider: 'claude',
      roomId: CAFE_ID,
      name: tr('Pizza delivery'),
      look: 'm',
      role: tr('Pizza delivery'),
      sessionId: PIZZA_ID,
      account: '',
      status: 'working',
      recent: [],
      tasks: [],
      startedAt: now,
      lastEventAt: now,
      statusSince: now,
      stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
      seed: 4242,
    };
    const ch = new Character(info, appearance);
    ch.placeAtTile(spot.tx, spot.ty);
    ch.x = spot.x;
    ch.y = spot.y - 6;
    ch.dir = 'down';
    ch.alpha = 0;
    ch.inside = true;
    ch.arriving = true;
    ch.hiddenUntil = el.reserveAppear(now);
    ch.queue.push(
      { t: 'elevOut', elev: el.index, phase: 0 },
      { t: 'go', tx: table.tx, ty: table.ty, held: 'box' },
      { t: 'act', pose: 'use', ms: 1500, icon: 'box', sound: 'pizza' },
      { t: 'do', fn: () => this.startPizza(table) },
      { t: 'go', tx: spot.tx, ty: spot.ty, fx: spot.tx * TILE + FOOT_DX, fy: spot.ty * TILE + FOOT_DY - 2, dir: 'up' },
      { t: 'elevIn', elev: el.index, phase: 0 },
      { t: 'remove' },
    );
    this.extras.push(ch);
    return true;
  }

  private startPizza(table: { tx: number; ty: number }): void {
    this.pizzaUntil = this.now + PIZZA_MS;
    this.pizzaTile = table;
    // whoever is idle decides right away what to do (and the party pulls them to the pantry)
    for (const c of this.chars.values()) if (c.mode === 'idle') c.nextOutingAt = 0;
    this.pets.beg(this.petWorld, table, this.now);
  }

  /** Extra: only the step queue (no planning of its own). */
  private runExtra(e: Character, dt: number, now: number): void {
    e.animT += dt * 1000;
    if (e.icon && now >= e.iconUntil) e.icon = null;
    if (!e.step) {
      e.step = e.queue.shift() ?? null;
      e.stepT = 0;
      e.stepStarted = false;
    }
    if (e.step) {
      const done = this.runStep(e, e.step, dt, now);
      e.stepT += dt * 1000;
      if (done) e.step = null;
      if (e.arriving && !e.step && !e.queue.length) e.arriving = false;
      return;
    }
    e.setPose('stand');
  }

  /**
   * Someone has been napping at the desk for a long time: half the time the dog goes to give a lick; otherwise an idle
   * coworker goes over to tap them on the shoulder. Whoever wakes up stretches and stays awake for a while.
   */
  private sendWaker(sleeper: Character, now: number): void {
    const home = this.spots.get(sleeper.homeSpot);
    if (!home) return;
    const viaDog = () => this.pets.wakeUp(this.petWorld, sleeper.id, { tx: home.tx, ty: home.ty }, now);
    if (sleeper.rng() < 0.5 && viaDog()) return;
    for (const c of this.chars.values()) {
      if (c === sleeper || c.leaving || c.mode !== 'idle' || c.step || c.queue.length || c.gathering || c.pose === 'sleep' || c.atSpot !== c.homeSpot) continue;
      const at = this.besideTile(sleeper, c);
      const steps: Step[] = [];
      this.pushLeave(c, steps);
      steps.push(
        { t: 'go', tx: at.x, ty: at.y },
        { t: 'act', pose: 'talk', ms: 1600, icon: 'chat' },
        { t: 'do', fn: () => this.wakeUp(sleeper.id, this.now) },
      );
      c.queue.push(...steps);
      this.pushHome(c, 'none');
      return;
    }
    viaDog();
  }

  /**
   * Wakes up whoever was napping: startle, a stretch at the desk and a while without napping. `gentle` (end of the
   * siesta): no startle, a yawn instead. During the siesta, only the gentle wake-up works (a lick doesn't do it).
   */
  wakeUp(id: string, now: number, gentle = false): void {
    const ch = this.chars.get(id);
    if (!ch || ch.pose !== 'sleep' || (this.siestaOn && !gentle)) return;
    ch.awakeUntil = now + AWAKE_MS;
    ch.sleepSince = 0;
    if (gentle) {
      if (ch.icon === 'zzz') ch.setIcon(null, 0, now);
      ch.nextOutingAt = now + idleSitMs(ch.rng, this.options().liveliness);
      ch.chatEmoji = '🥱';
      ch.chatUntil = now + 1_600;
    } else ch.setIcon('alert', 1500, now);
    this.sound('yawn', ch.x, ch.y);
    const home = this.spots.get(ch.homeSpot);
    if (!home || ch.atSpot !== home.id || ch.step || ch.queue.length) return;
    ch.reactUntil = now + 2_400;
    if (home.seated) ch.queue.push({ t: 'exit' });
    ch.queue.push({ t: 'act', pose: 'stretch', ms: 1800 });
    if (home.seated) ch.queue.push({ t: 'enter', spot: home.id });
  }

  /**
   * Siesta (ngủ trưa, sim/siesta.ts): after lunch, whoever is idle naps at the desk (the desk pose) and the lights dim;
   * whoever works, waits for the user or watches a shell carries on. Not in visits (the timing didn't come from the
   * world) nor during a party. At the end, the sleepers wake up one by one with a stretch. Runs once a second.
   */
  private updateSiesta(now: number): void {
    const hour = this.hourOf(now);
    const blocked = this.visit || now < this.pizzaUntil || now < this.discoUntil || this.newYear.phase === 'party';
    const on = !blocked && (this.siestaOverride ?? siestaTime(hour));
    this.siestaTarget = !on ? 0 : this.siestaOverride !== null ? 1 : siestaLevel(hour);
    for (const [id, at] of this.siestaWakes) {
      if (now < at) continue;
      this.siestaWakes.delete(id);
      this.wakeUp(id, now, true);
    }
    if (on === this.siestaOn) return;
    this.siestaOn = on;
    if (on) {
      this.siestaWakes.clear();
      // someone still awake at their desk announces it
      for (const ch of this.chars.values()) {
        if (ch.leaving || ch.mode !== 'idle' || ch.atSpot !== ch.homeSpot || ch.step || ch.queue.length || ch.pose === 'sleep') continue;
        this.social.say(ch, tr('Nap time 😴'), now);
        break;
      }
      return;
    }
    for (const ch of this.chars.values()) if (ch.mode === 'idle' && ch.pose === 'sleep') this.siestaWakes.set(ch.id, now + 600 + ch.rng() * SIESTA_WAKE_SPREAD_MS);
  }

  /** Napping for the siesta (or about to wake up from it, at the end)? */
  private siestaNap(ch: Character): boolean {
    return this.siestaOn || this.siestaWakes.has(ch.id);
  }

  /**
   * New Year: in the last 5 min of Dec 31 (and of Tết eve) the countdown; in the 10 min after
   * midnight, a party in every room (banner, confetti, everyone celebrating) and fireworks outside.
   */
  private updateNewYear(now: number): void {
    const d = new Date(now);
    let phase: 'countdown' | 'party' | null = this.newYearOverride;
    let lunar = false;
    let secondsLeft = 0;
    if (!phase && !this.visit) {
      const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const tet = tetDay(d.getFullYear());
      const isNew = (day: Date) => (day.getMonth() === 0 && day.getDate() === 1) || (!!tet && day.getTime() === tet.getTime());
      const toMidnight = (tomorrow.getTime() - now) / 1000;
      if (isNew(tomorrow) && toMidnight <= 300) {
        phase = 'countdown';
        secondsLeft = Math.ceil(toMidnight);
        lunar = !!tet && tomorrow.getTime() === tet.getTime();
      } else if (isNew(today) && now - today.getTime() < 10 * 60_000) {
        phase = 'party';
        lunar = !!tet && today.getTime() === tet.getTime();
      }
    } else if (phase === 'countdown') secondsLeft = 300 - (Math.floor(now / 1000) % 300);
    this.newYear = { phase, secondsLeft, lunar };
    if (phase === 'party') {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${this.newYearOverride ?? ''}`;
      if (this.celebratedYear !== key) {
        this.celebratedYear = key;
        const text = lunar ? tr('🧧 Happy Lunar New Year!') : tr('🎆 Happy New Year!');
        for (const room of this.rooms.values()) if (room.present && !room.ghost) this.celebrate(room.id, text);
        for (const area of this.building.core) if (area.kind !== 'restroom') this.celebrate(area.id, text);
      }
    }
  }

  /** Current play of the TV football match (so the crowd celebrates along with the on-screen "GOAL"). */
  footballLance(t: number): { lance: number; progress: number; right: boolean; period: number; goalAt: number } | null {
    try {
      return this.art.footballLance?.(t, PROGRAM_SEED.futebol) ?? null;
    } catch {
      return null;
    }
  }

  /** Asks the renderer for a visual effect (confetti, coins, sparkle). */
  pushEffect(e: WorldEffect): void {
    if (this.effects.length >= MAX_EFFECTS) this.effects.shift();
    this.effects.push(e);
  }

  // =================================================================== Thần Tài altar (sim/altar.ts)

  /**
   * Runs once a second. In the morning, the first one free lights the day's incense; when an agent has been waiting on
   * the user for a long time, now and then (office-wide cooldown) an idle coworker goes to light incense and bow for
   * luck. Not in visits: nothing there has real timing.
   */
  private updateAltar(now: number): void {
    if (this.visit) return;
    if (morningDue(this.hourOf(now), now, this.altarMorningDay)) {
      if (this.sendToAltar('morning')) this.altarMorningDay = dayKey(now);
      return;
    }
    if (!cooldownOver(this.altarPrayedAt, now)) return;
    let waiter: Character | undefined;
    for (const c of this.chars.values()) if (!c.leaving && waitingLong(c.mode, c.info.status, c.info.statusSince, now)) waiter = c;
    if (!waiter || waiter.rng() >= ALTAR_CHANCE) return;
    if (this.sendToAltar('wait', waiter.roomId)) this.altarPrayedAt = now;
  }

  /** Idle at the desk with nothing planned: free to go to the altar. `force` (debug) also takes whoever is strolling. */
  private altarFree(c: Character, force: boolean): boolean {
    if (c.leaving || c.mode !== 'idle' || c.gathering || c.inside || c.outdoors || c.pose === 'sleep' || !c.homeSpot) return false;
    if (force) return !c.step || this.interruptible(c.step);
    return !c.step && !c.queue.length && c.atSpot === c.homeSpot;
  }

  /**
   * Sends an idle coworker (from room `prefer`, if there is one) to the altar: walks over, lights the incense (the
   * smoke starts), says a little prayer, bows three times and goes back. Returns whether someone went.
   */
  private sendToAltar(why: 'wait' | 'morning', prefer?: string, force = false): boolean {
    const spot = this.spots.ofKind('altar').find((s) => this.spots.isFree(s.id));
    if (!spot) return false;
    let who: Character | undefined;
    for (const c of this.chars.values()) {
      if (!this.altarFree(c, force)) continue;
      if (!who || (prefer && c.roomId === prefer && who.roomId !== prefer)) who = c;
    }
    if (!who) return false;
    const ch = who;
    if (force) this.clearPlan(ch);
    if (!this.reserveTemp(ch, spot)) return false;
    const rng = ch.rng;
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    steps.push(
      { t: 'go', tx: spot.tx, ty: spot.ty, fx: spot.x, fy: spot.y, dir: spot.dir },
      { t: 'act', pose: 'use', ms: 1500, dir: spot.dir },
      {
        t: 'do',
        fn: () => {
          this.altarLitUntil = this.now + INCENSE_MS;
          this.social.say(ch, prayerLine(rng, why), this.now);
        },
      },
    );
    // three bows: head down, back up
    for (let i = 0; i < 3; i++) steps.push({ t: 'act', pose: 'sulk', ms: 700, dir: spot.dir }, { t: 'act', pose: 'stand', ms: 500, dir: spot.dir });
    steps.push({ t: 'do', fn: () => this.spots.release(spot.id, ch.id) });
    ch.queue.push(...steps);
    this.pushHome(ch, 'none');
    return true;
  }

  /** Debug: someone idle goes to light incense at the altar right now (ignores the wait and the cooldown). */
  altarNow(): boolean {
    if (this.visit) return false;
    return this.sendToAltar('wait', undefined, true);
  }

  /** Altar sprite state for the renderer: incense lit and Vía Thần Tài decorations. */
  altarState(now: number): number {
    return altarState(this.altarLitUntil, now);
  }

  // =================================================================== spawning and placement

  private spawn(a: AgentInfo, first: boolean, now: number): Character | null {
    let appearance;
    try {
      appearance = this.art.appearanceFromSeed(a.seed, { look: a.look, sub: a.kind === 'sub', parts: a.parts });
    } catch {
      return null;
    }
    const ch = new Character(a, appearance);
    ch.lastActivityId = a.activity?.id ?? null;
    ch.shellDoneAt = latestShellDone(a)?.at ?? 0;
    this.chars.set(a.id, ch);
    if (first) return ch;
    if (a.kind === 'main' && this.arriveByBike(ch)) return ch;
    // arrival via the elevator
    const el = this.pickElevator(ch);
    const spot = this.spots.get(el.spotId)!;
    ch.placeAtTile(spot.tx, spot.ty);
    ch.x = spot.x;
    ch.y = spot.y - 6;
    ch.dir = 'down';
    ch.alpha = 0;
    ch.inside = true;
    ch.arriving = true;
    ch.hiddenUntil = el.reserveAppear(now);
    // subagents launched together don't step out of the elevator at the same instant
    if (a.kind === 'sub') ch.hiddenUntil += Math.floor(ch.rng() * 600);
    ch.queue.push({ t: 'elevOut', elev: el.index, phase: 0 });
    return ch;
  }

  /**
   * Initial load: everyone starts in their natural place (their own desk), with nobody "standing in the
   * corridor". Only a minority of truly idle ones (stopped for a while, not napping) shows up
   * on a sofa/armchair/pouf/coffee spot — never on a corridor or bathroom bench, and never emptying the room.
   */
  private placeInitial(ch: Character, now: number, roomsSeated: Set<string>): void {
    this.assignHome(ch);
    const home = this.spots.get(ch.homeSpot);
    // first stroll only after a few seconds: the initial load shows everyone in place
    ch.nextOutingAt = now + INITIAL_OUTING_DELAY_MS + idleSitMs(ch.rng, this.options().liveliness) * ch.rng();
    const relaxing =
      ch.mode === 'idle' &&
      !!home &&
      roomsSeated.has(ch.roomId) &&
      now - ch.info.statusSince >= INITIAL_LOUNGE_MIN_IDLE_MS &&
      !isLongIdle(ch.info.status, ch.info.statusSince, now) &&
      ch.rng() < INITIAL_LOUNGE_SHARE;
    if (relaxing) {
      const seat = this.randomFree(INITIAL_LOUNGE_SEATS, ch);
      if (seat && this.spots.reserve(seat.id, ch.id)) {
        ch.tempSpots.push(seat.id);
        this.snapTo(ch, seat);
        const held = seat.kind === 'cafe_seat' ? 'coffee' : 'none';
        ch.queue.push({ t: 'act', pose: 'sit', held, ms: between(ch.rng, 4000, 14000) }, { t: 'exit' }, { t: 'do', fn: () => this.releaseTemp(ch) });
        return;
      }
    }
    if (home) {
      this.snapTo(ch, home);
      roomsSeated.add(ch.roomId);
    } else this.placeOverflow(ch);
  }

  /** No reserved seat: standing inside their own room (if it exists) or in the reception. */
  private placeOverflow(ch: Character): void {
    const room = this.rooms.get(ch.roomId);
    const t = room && room.present ? this.overflowTile(ch, room) : null;
    ch.standTile = t;
    const p = t ?? this.lobbyTile(ch);
    ch.placeAtTile(p.x, p.y);
  }

  private snapTo(ch: Character, s: SpotDef): void {
    ch.tx = s.tx;
    ch.ty = s.ty;
    ch.x = s.x;
    ch.y = s.y;
    ch.dir = s.dir;
    ch.atSpot = s.id;
    ch.seated = !!s.seated;
    ch.sortY = s.sortY ?? null;
  }

  /** Reserves a desk (or stool/standing spot) in the character's room. */
  private assignHome(ch: Character): void {
    if (ch.homeSpot && this.spots.get(ch.homeSpot) && this.spots.ownerOf(ch.homeSpot) === ch.id) return;
    ch.homeSpot = null;
    const room = this.rooms.get(ch.roomId);
    if (!room || !room.present) return;
    const seat = chooseSeat(room.layout.spots, (id) => this.spots.isFree(id, ch.id), ch.info.kind);
    if (seat && this.spots.reserve(seat.id, ch.id)) ch.homeSpot = seat.id;
  }

  /**
   * Half the main agents come to work by motorbike (when the street is drawn and a spot is free): hidden while the
   * bike rides in and parks, then they get off and walk in along the sidewalk and up the stone path.
   */
  private arriveByBike(ch: Character): boolean {
    if (!this.bikes || this.visit || ch.rng() >= BIKE_SHARE) return false;
    const taken = new Set<number>();
    for (const [id, slot] of this.parkedBikes) if (this.chars.has(id)) taken.add(slot);
    const slot = PARKING.findIndex((_, i) => !taken.has(i));
    if (slot < 0) return false;
    const p = PARKING[slot];
    const spot = { x: p.x - 9, y: p.y - 3 };
    this.parkedBikes.set(ch.id, slot);
    this.bikeTrips.push({ t: 'arrive', id: ch.id, slot, appearance: ch.appearance });
    ch.placeAtTile(TEA_DOOR.tx, TEA_DOOR.ty);
    ch.x = spot.x;
    ch.y = spot.y;
    ch.dir = 'up';
    ch.alpha = 0;
    ch.inside = true;
    ch.arriving = true;
    ch.outdoors = [];
    ch.queue.push({ t: 'bike' }, { t: 'route', pts: wayBack(routeToSeat(spot).slice(0, -2)), trail: 'back' });
    return true;
  }

  private pickElevator(ch: Character): Elevator {
    let best = this.elevators[0];
    for (const e of this.elevators) if (e.load < best.load || (e.load === best.load && ch.rng() < 0.5)) best = e;
    return best;
  }

  // =================================================================== layout

  /** Recomputes the building (width, grid, spots) from the rooms present. */
  relayout(force = false): void {
    const present = [...this.rooms.values()].filter((r) => r.present);
    let cols = columnsFor(present.map((r) => r.slot));
    const cur = this.building.cols;
    if (cols < cur && !force) {
      // only shrinks when nobody is in the strip that's going away
      const limit = cols * COL_W * TILE;
      if ([...this.chars.values()].some((c) => !c.gone && c.x >= limit - TILE)) {
        cols = cur;
        this.shrinkPending = true;
      } else this.shrinkPending = false;
    } else this.shrinkPending = false;
    const building = assembleBuilding(
      cols,
      present.map((r) => r.layout),
      this.layoutVersion + 1,
    );
    this.building = building;
    this.layoutVersion++;
    this.finder.setGrid(building.grid);
    this.pets.relayout(this.petWorld);
    const lost = this.spots.setSpots(building.spots);
    for (const { owner } of lost) {
      const ch = this.chars.get(owner);
      if (!ch) continue;
      if (ch.homeSpot && !this.spots.get(ch.homeSpot)) ch.homeSpot = null;
      ch.tempSpots = ch.tempSpots.filter((s) => this.spots.get(s));
    }
    for (const ch of this.chars.values()) {
      if (ch.atSpot && !this.spots.get(ch.atSpot)) {
        ch.atSpot = null;
        ch.seated = false;
        ch.sortY = null;
      }
      // in-progress paths are recomputed from the current tile; a destination that no longer exists (the
      // building shrank and took the corridor water cooler, the room was torn down) invalidates the plan: without this the
      // step would find no path and would teleport the character out of the building
      let stale = false;
      for (const s of ch.step ? [ch.step, ...ch.queue] : ch.queue) {
        if (s.t !== 'go') continue;
        s.path = undefined;
        if (!this.building.grid.nearestWalkable(s.tx, s.ty, 4)) stale = true;
      }
      if (stale) this.interrupt(ch);
      if (!this.building.grid.walkable(ch.tx, ch.ty) && !ch.atSpot && !ch.inside) {
        const n = this.building.grid.nearestWalkable(ch.tx, ch.ty);
        if (n) {
          ch.tx = n.x;
          ch.ty = n.y;
        }
      }
    }
  }

  // =================================================================== per-frame update

  update(dt: number, now: number): void {
    this.now = now;
    for (const e of this.elevators) e.update(dt, now);
    this.updateRooms(now);
    this.social.update(now);
    if (this.roomFx.active.size) this.roomFx.update(this, now);
    for (const ch of this.chars.values()) {
      if (ch.missingSince !== null && !ch.leaving && now - ch.missingSince >= MISSING_DEBOUNCE_MS) this.refreshMode(ch);
      this.runCharacter(ch, dt, now);
    }
    if (this.visitor) this.runVisitor(this.visitor, dt, now);
    this.updateNewYear(now);
    this.pets.update(this.petWorld, dt, now, now < this.discoUntil || this.newYear.phase === 'party');
    for (const e of this.extras) this.runExtra(e, dt, now);
    for (let i = this.extras.length - 1; i >= 0; i--) if (this.extras[i].gone) this.extras.splice(i, 1);
    for (const [id, ch] of this.chars) {
      if (ch.gone) {
        this.spots.releaseAll(id);
        this.tea.release(id);
        this.banhmi.release(id);
        this.chars.delete(id);
      }
    }
    if (this.siestaDim !== this.siestaTarget) this.siestaDim = Math.abs(this.siestaTarget - this.siestaDim) < 0.01 ? this.siestaTarget : this.siestaDim + (this.siestaTarget - this.siestaDim) * Math.min(1, dt * 2);
    if (now >= this.nextHousekeeping) {
      this.nextHousekeeping = now + 1000;
      this.housekeeping(now);
      this.updateTea(now);
      this.updateAltar(now);
      this.updateBanhMi(now);
    }
  }

  /** Low-frequency checks (parent leaving, ownerless rooms, shrink building). */
  private housekeeping(now: number): void {
    this.updateSiesta(now);
    for (const ch of this.chars.values()) {
      if (ch.info.kind === 'sub' && !ch.leaving) this.refreshMode(ch);
      // foreground command went past 10 s (or the wait ended): switches mode without a new snapshot
      else if (!ch.leaving && (ch.mode === 'shell' || (ch.info.status === 'working' && ch.info.shells?.length))) this.refreshMode(ch);
      if (ch.mode === 'idle' && (this.longIdle(ch, now) || this.siestaOn) && ch.atSpot === ch.homeSpot && ch.pose === 'sleep' && ch.icon !== 'zzz') {
        ch.setIcon('zzz', 1e12, now);
      }
      if (ch.pose !== 'sleep') ch.sleepSince = 0;
      // siesta: everyone naps, nobody comes to wake them (they wake up on their own at the end)
      else if (ch.sleepSince && now - ch.sleepSince >= NAP_WAKE_MS && now >= ch.wakeTryAt && !this.visit && !this.siestaOn && !this.siestaWakes.size) {
        ch.wakeTryAt = now + 60_000;
        this.sendWaker(ch, now);
      }
    }
    if (this.shrinkPending) this.relayout();
    this.social.housekeeping(now);
    for (const [id, until] of this.machineUntil) if (until < now) this.machineUntil.delete(id);
    this.refreshRoomInfo();
    if (this.visit) this.applyVisitLight(now);
  }

  private updateRooms(now: number): void {
    let dirty = false;
    for (const room of this.rooms.values()) {
      if (room.phase === 'building' && room.progress(now) >= 1) room.setPhase('ready', now);
      if (room.phase === 'dismantling' && room.progress(now) >= 1) {
        room.setPhase('gone', now);
        dirty = true;
      }
      if (!room.listed && (room.phase === 'ready' || room.phase === 'building')) {
        const occupants = this.occupants(room);
        // safety: room with nobody in it and the light on with nobody to turn it off
        if (occupants === 0 && room.lightOn && !this.switchClaimValid(room) && now - room.unlistedAt > 2500) room.setLight(false, now);
        const ok = canDismantle({ listed: room.listed, occupants, lightOn: room.lightOn, dark: room.light(now) <= 0.01, unlistedForMs: now - room.unlistedAt }, 0);
        if (!ok) room.readyToDismantleAt = 0;
        else if (!room.readyToDismantleAt) room.readyToDismantleAt = now;
        else if (now - room.readyToDismantleAt >= DISMANTLE_DELAY_MS) room.setPhase('dismantling', now);
      }
    }
    for (const [id, room] of this.rooms) {
      if (room.phase === 'gone') {
        this.rooms.delete(id);
        dirty = true;
      }
    }
    if (dirty) this.relayout();
    this.compact(now);
  }

  // =================================================================== room move

  /**
   * No gaps between rooms: when a slot frees up before the last room (a terminal closed and the
   * room was torn down), the farthest room moves into it after COMPACT_DELAY_MS. One room at a
   * time, only a ready room with its session open; the building shrinks when the old address is torn down.
   */
  private compact(now: number): void {
    const free = this.freeSlot();
    let far: RoomState | null = null;
    for (const r of this.rooms.values()) {
      if (r.slot > free && !r.ghost && r.listed && r.phase === 'ready' && (!far || r.slot > far.slot)) far = r;
    }
    if (!far) {
      this.gapSince = 0;
      return;
    }
    if (!this.gapSince) this.gapSince = now;
    if (now - this.gapSince < COMPACT_DELAY_MS) return;
    this.gapSince = 0;
    this.moveRoom(far, free, now);
  }

  /**
   * Moves the room to another slot: it is built again there (dark; the first to arrive turns on the light)
   * and the old address becomes a ghost room that waits to empty, goes dark and is torn down. Seats
   * keep their ids (each one keeps its desk, now in the new room); whoever is seated or on the way
   * to a seat in the room switches to the equivalent ghost seat, gets up from there and walks over.
   */
  moveRoom(room: RoomState, slot: number, now: number): void {
    const before = room.layout;
    const ghostId = `${room.id}#mudança${++this.moveSeq}`;
    const ghostLayout = layoutProjectRoom({ id: ghostId, slot: room.slot, seed: room.seed }, room.theme);
    const ghost = new RoomState({ ...room.info, id: ghostId, seed: room.seed }, room.theme, ghostLayout, 'ready', now, false, room.slot);
    ghost.ghost = true;
    ghost.listed = false;
    ghost.unlistedAt = now;
    ghost.lightOn = room.lightOn;
    ghost.lightAt = room.lightAt;
    this.rooms.set(ghostId, ghost);
    // the layout is deterministic from the seed: the ghost's i-th seat is the old room's i-th
    const alias = new Map<string, string>();
    before.spots.forEach((s, i) => {
      const g = ghostLayout.spots[i];
      if (g && g.kind === s.kind) alias.set(s.id, g.id);
    });

    room.slot = slot;
    room.layout = layoutProjectRoom({ id: room.id, slot, seed: room.seed }, room.theme);
    room.setPhase('building', now);
    room.lightOn = false;
    room.lightAt = -1e9;
    room.switchClaim = null;
    room.readyToDismantleAt = 0;
    room.version++;
    this.relayout();
    // the ghost's seats belong to nobody (no stroll or circle will end up there)
    for (const s of ghostLayout.spots) this.spots.reserve(s.id, GHOST_OWNER);

    for (const ch of this.chars.values()) {
      if (ch.gone) continue;
      let touched = false;
      if (ch.atSpot && alias.has(ch.atSpot)) {
        ch.atSpot = alias.get(ch.atSpot)!;
        touched = true;
      }
      // on the way to a seat, the switch or a corner of the old room: the plan goes stale (the step that can't
      // be interrupted finishes at the old address: sits in the ghost, flips the ghost's light)
      for (const step of ch.step ? [ch.step, ...ch.queue] : ch.queue) {
        if (step.t === 'enter' && alias.has(step.spot)) {
          step.spot = alias.get(step.spot)!;
          touched = true;
        } else if (step.t === 'switch' && step.room === room.id) {
          step.room = ghostId;
          touched = true;
        } else if (step.t === 'go' && inRect(before.rect, step.tx, step.ty)) touched = true;
      }
      if (ch.tempSpots.some((id) => alias.has(id))) touched = true;
      if (touched || (ch.roomId === room.id && ch.standTile) || inRect(before.rect, ch.tx, ch.ty)) {
        ch.standTile = null;
        this.interrupt(ch);
      }
    }
  }

  private switchClaimValid(room: RoomState): boolean {
    if (!room.switchClaim) return false;
    const c = this.chars.get(room.switchClaim);
    if (!c || c.gone) {
      room.switchClaim = null;
      return false;
    }
    return true;
  }

  /** Characters associated with the room (not leaving) + anyone physically inside it. */
  occupants(room: RoomState, except?: string): number {
    let n = 0;
    for (const c of this.chars.values()) {
      if (c.gone || c.id === except) continue;
      if ((c.roomId === room.id && !c.leaving) || inRect(room.layout.rect, c.tx, c.ty)) n++;
    }
    return n;
  }

  /** How many are physically inside the room's rectangle. */
  private physicallyInside(room: RoomState, except?: string): number {
    let n = 0;
    for (const c of this.chars.values()) if (!c.gone && c.id !== except && inRect(room.layout.rect, c.tx, c.ty)) n++;
    return n;
  }

  /** Accounts present and kanban board of each room. */
  private refreshRoomInfo(): void {
    for (const room of this.rooms.values()) {
      const accs = new Set<string>();
      const board: RoomState['board'] = [];
      for (const c of this.chars.values()) {
        if (c.roomId !== room.id || c.leaving) continue;
        accs.add(c.info.account);
        if (c.info.kind === 'main') for (const t of c.info.tasks) if (board.length < 15) board.push({ status: t.status });
      }
      room.accounts = [...accs].sort();
      room.board = board;
    }
  }

  // =================================================================== step execution

  private runCharacter(ch: Character, dt: number, now: number): void {
    // animation
    ch.animT += dt * 1000;
    ch.updateLane(dt);
    if (ch.icon && now >= ch.iconUntil) ch.icon = null;
    // "zzz" only while asleep: whoever gets up (a circle called, room party, a stroll) is awake, and the icon doesn't go
    // along. The desk nap of someone idle for a long time doesn't change the mode, so nobody else would clear it.
    if (ch.icon === 'zzz' && ch.pose !== 'sleep') ch.icon = null;
    if (ch.mode === 'shell' && ch.shellSince && !this.visit) ch.shellStage = shellStage(now - ch.shellSince);
    if (!ch.step) {
      if (ch.replan) {
        ch.replan = false;
        this.clearPlan(ch);
      }
      ch.step = ch.queue.shift() ?? null;
      ch.stepT = 0;
      ch.stepStarted = false;
    }
    if (ch.step) {
      const done = this.runStep(ch, ch.step, dt, now);
      ch.stepT += dt * 1000;
      if (done) {
        ch.step = null;
        if (ch.replan) {
          ch.replan = false;
          this.clearPlan(ch);
        }
      }
      return;
    }
    // empty queue: decides the next plan or rests
    if (now >= ch.thinkAt) {
      const planned = this.think(ch, now);
      if (!planned) ch.thinkAt = now + 400;
    }
    if (!ch.step && !ch.queue.length) this.restPose(ch, now);
  }

  private runStep(ch: Character, s: Step, dt: number, now: number): boolean {
    const first = !ch.stepStarted;
    ch.stepStarted = true;
    switch (s.t) {
      case 'go':
        return this.stepGo(ch, s, dt);
      case 'route':
        return this.stepRoute(ch, s, dt);
      case 'enter': {
        const spot = this.spots.get(s.spot);
        if (!spot) return true;
        if (first) {
          ch.enterFrom = { x: ch.x, y: ch.y };
          if (spot.seated) ch.sortY = spot.sortY ?? null;
        }
        const k = Math.min(1, (ch.stepT + dt * 1000) / ENTER_MS);
        const from = ch.enterFrom ?? { x: ch.x, y: ch.y };
        ch.x = from.x + (spot.x - from.x) * k;
        ch.y = from.y + (spot.y - from.y) * k;
        if (k >= 1) {
          this.snapTo(ch, spot);
          ch.setPose(spot.seated ? 'sit' : 'stand', ch.held);
          return true;
        }
        return false;
      }
      case 'exit': {
        if (!ch.atSpot) return true;
        const spot = this.spots.get(ch.atSpot);
        if (!spot) {
          ch.atSpot = null;
          ch.seated = false;
          ch.sortY = null;
          return true;
        }
        const tx = spot.tx * TILE + FOOT_DX;
        const ty = spot.ty * TILE + FOOT_DY;
        if (first) ch.enterFrom = { x: ch.x, y: ch.y };
        const k = Math.min(1, (ch.stepT + dt * 1000) / ENTER_MS);
        const from = ch.enterFrom ?? { x: ch.x, y: ch.y };
        ch.x = from.x + (tx - from.x) * k;
        ch.y = from.y + (ty - from.y) * k;
        ch.seated = false;
        ch.setPose('stand', ch.held);
        if (k >= 1) {
          ch.atSpot = null;
          ch.sortY = null;
          ch.tx = spot.tx;
          ch.ty = spot.ty;
          return true;
        }
        return false;
      }
      case 'act': {
        if (first) {
          if (s.dir) ch.dir = s.dir;
          if (s.icon) ch.setIcon(s.icon, s.ms, now);
          if (s.machine) this.machineUntil.set(s.machine, now + s.ms);
          if (s.sound) this.sound(s.sound, ch.x, ch.y);
        }
        ch.setPose(s.pose, s.held ?? 'none');
        return ch.stepT >= s.ms;
      }
      case 'until': {
        if (first && s.dir) ch.dir = s.dir;
        ch.setPose(s.pose ?? (ch.seated ? 'sit' : 'stand'), s.held ?? ch.held);
        if (ch.stepT >= s.maxMs) return true;
        return ch.stepT >= s.minMs && s.cond();
      }
      case 'elevOut':
        return this.stepElevOut(ch, s, dt, now);
      case 'elevIn':
        return this.stepElevIn(ch, s, dt, now);
      case 'stall':
        return this.stepStall(ch, s, dt, now);
      case 'switch':
        return this.stepSwitch(ch, s, now);
      case 'gather':
        return this.social.stepGather(ch, s.g, now);
      case 'do':
        s.fn();
        return true;
      case 'bike':
        if (!this.bikeParked.has(ch.id) && ch.stepT < BIKE_RIDE_MAX_MS) return false;
        this.bikeParked.delete(ch.id);
        ch.alpha = 1;
        ch.inside = false;
        ch.setPose('stand');
        return true;
      case 'remove':
        ch.gone = true;
        return true;
    }
  }

  private findPath(sx: number, sy: number, gx: number, gy: number, out: number[]): boolean {
    const grid = this.building.grid;
    if (!grid.walkable(gx, gy)) {
      const n = grid.nearestWalkable(gx, gy, 4);
      if (!n) return false;
      gx = n.x;
      gy = n.y;
    }
    if (this.finder.find(sx, sy, gx, gy, out)) return true;
    const s = grid.nearestWalkable(sx, sy, 6);
    if (s && (s.x !== sx || s.y !== sy) && this.finder.find(s.x, s.y, gx, gy, out)) {
      out.unshift(s.x, s.y);
      return true;
    }
    return false;
  }

  private stepGo(ch: Character, s: Extract<Step, { t: 'go' }>, dt: number): boolean {
    if (!s.path) {
      s.path = [];
      s.i = 0;
      if (!this.findPath(ch.tx, ch.ty, s.tx, s.ty, s.path)) {
        // no path (shouldn't happen): teleports so it doesn't get stuck
        ch.placeAtTile(s.tx, s.ty);
        s.path.length = 0;
      }
    }
    const path = s.path;
    let budget = (s.run ? RUN_SPEED : WALK_SPEED) * ch.speedK * dt;
    let moved = false;
    while (budget > 0.0001) {
      let gx: number;
      let gy: number;
      const i = s.i ?? 0;
      if (i < path.length) {
        ch.tx = path[i];
        ch.ty = path[i + 1];
        gx = ch.tx * TILE + FOOT_DX;
        gy = ch.ty * TILE + FOOT_DY;
      } else if (s.fx !== undefined && s.fy !== undefined && !s.fine) {
        gx = s.fx;
        gy = s.fy;
      } else break;
      const dx = gx - ch.x;
      const dy = gy - ch.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) ch.dir = dirOf(dx, dy, ch.dir);
      if (d <= budget) {
        ch.x = gx;
        ch.y = gy;
        budget -= d;
        if (i < path.length) s.i = i + 2;
        else s.fine = true;
      } else {
        ch.x += (dx / d) * budget;
        ch.y += (dy / d) * budget;
        budget = 0;
      }
      moved = true;
    }
    const arrived = (s.i ?? 0) >= path.length && (s.fx === undefined || s.fine);
    if (arrived) {
      if (s.dir) ch.dir = s.dir;
      ch.setPose('stand', s.held ?? 'none');
      return true;
    }
    if (moved) ch.setPose(s.run ? 'run' : 'walk', s.held ?? 'none');
    return false;
  }

  /** Straight walk through px points (outside the building: no grid). The logical tile stays at the door. */
  private stepRoute(ch: Character, s: Extract<Step, { t: 'route' }>, dt: number): boolean {
    if (s.trail === 'out') ch.outdoors ??= [];
    let budget = (s.run ? RUN_SPEED : WALK_SPEED) * ch.speedK * dt;
    let i = s.i ?? 0;
    while (budget > 0.0001 && i < s.pts.length) {
      const dx = s.pts[i] - ch.x;
      const dy = s.pts[i + 1] - ch.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) ch.dir = dirOf(dx, dy, ch.dir);
      if (d <= budget) {
        ch.x = s.pts[i];
        ch.y = s.pts[i + 1];
        budget -= d;
        if (s.trail === 'out') ch.outdoors?.push(ch.x, ch.y);
        i += 2;
      } else {
        ch.x += (dx / d) * budget;
        ch.y += (dy / d) * budget;
        budget = 0;
      }
    }
    s.i = i;
    if (i >= s.pts.length) {
      if (s.trail === 'back') this.backIndoors(ch);
      ch.setPose('stand', s.held ?? 'none');
      return true;
    }
    ch.setPose(s.run ? 'run' : 'walk', s.held ?? 'none');
    return false;
  }

  private stepElevOut(ch: Character, s: Extract<Step, { t: 'elevOut' }>, dt: number, now: number): boolean {
    const el = this.elevators[s.elev] ?? this.elevators[0];
    const spot = this.spots.get(el.spotId)!;
    ch.dir = 'down';
    if (s.phase === 0) {
      ch.alpha = 0;
      ch.setPose('stand');
      if (now >= ch.hiddenUntil) {
        el.request(ch.id);
        s.phase = 1;
      }
      return false;
    }
    if (s.phase === 1) {
      ch.x = spot.x;
      ch.y = spot.y - 6;
      if (el.door >= 2.5) {
        ch.inside = false;
        ch.alpha = Math.min(1, ch.alpha + dt * 5);
        if (ch.alpha >= 1 && el.isOpen) s.phase = 2;
      }
      return false;
    }
    // steps out of the elevator to the tile in front
    const gx = spot.tx * TILE + FOOT_DX;
    const gy = spot.ty * TILE + FOOT_DY;
    const dx = gx - ch.x;
    const dy = gy - ch.y;
    const d = Math.hypot(dx, dy);
    const step = WALK_SPEED * dt;
    ch.alpha = 1;
    if (d <= step) {
      ch.x = gx;
      ch.y = gy;
      ch.tx = spot.tx;
      ch.ty = spot.ty;
      el.release(ch.id, now);
      ch.setPose('stand');
      return true;
    }
    ch.x += (dx / d) * step;
    ch.y += (dy / d) * step;
    ch.setPose('walk');
    return false;
  }

  private stepElevIn(ch: Character, s: Extract<Step, { t: 'elevIn' }>, dt: number, now: number): boolean {
    const el = this.elevators[s.elev] ?? this.elevators[0];
    const spot = this.spots.get(el.spotId)!;
    if (s.phase === 0) {
      ch.dir = 'up';
      ch.setPose('stand');
      el.request(ch.id);
      if (el.isOpen) s.phase = 1;
      return false;
    }
    if (s.phase === 1) {
      const gx = spot.x;
      const gy = spot.y - 6;
      const dx = gx - ch.x;
      const dy = gy - ch.y;
      const d = Math.hypot(dx, dy);
      const step = WALK_SPEED * dt;
      ch.dir = 'up';
      if (d <= step) {
        ch.x = gx;
        ch.y = gy;
        s.phase = 2;
        ch.dir = 'down';
        ch.setPose('stand');
      } else {
        ch.x += (dx / d) * step;
        ch.y += (dy / d) * step;
        ch.setPose('walk');
      }
      return false;
    }
    ch.alpha = Math.max(0, ch.alpha - dt * 3.5);
    if (ch.alpha <= 0) {
      ch.inside = true;
      el.release(ch.id, now);
      return true;
    }
    return false;
  }

  private stepStall(ch: Character, s: Extract<Step, { t: 'stall' }>, dt: number, now: number): boolean {
    const spot = this.spots.get(s.spot);
    if (!spot) return true;
    const furn = spot.furnitureId ?? spot.id;
    const ax = spot.tx * TILE + FOOT_DX;
    const ay = spot.ty * TILE + FOOT_DY;
    if (s.phase === 0) {
      // goes in through the door (moves up a bit) and disappears
      const dx = spot.x - ch.x;
      const dy = spot.y - ch.y;
      const d = Math.hypot(dx, dy);
      const step = WALK_SPEED * 0.8 * dt;
      ch.dir = 'up';
      ch.setPose('walk');
      if (d > step) {
        ch.x += (dx / d) * step;
        ch.y += (dy / d) * step;
      } else {
        ch.x = spot.x;
        ch.y = spot.y;
      }
      ch.alpha = Math.max(0, ch.alpha - dt * 4);
      if (d <= step && ch.alpha <= 0) {
        ch.inside = true;
        this.stallBusy.add(furn);
        this.sound('door', ch.x, ch.y);
        s.phase = 1;
        ch.stallUntil = now + s.ms;
      }
      return false;
    }
    if (s.phase === 1) {
      if (now >= (ch.stallUntil ?? 0)) {
        s.phase = 2;
        this.stallBusy.delete(furn);
        ch.inside = false;
        this.sound('flush', ch.x, ch.y);
        ch.dir = 'down';
      }
      return false;
    }
    // leaves the stall
    const dx = ax - ch.x;
    const dy = ay - ch.y;
    const d = Math.hypot(dx, dy);
    const step = WALK_SPEED * 0.8 * dt;
    ch.alpha = Math.min(1, ch.alpha + dt * 4);
    ch.dir = 'down';
    ch.setPose('walk');
    if (d > step) {
      ch.x += (dx / d) * step;
      ch.y += (dy / d) * step;
      return false;
    }
    ch.x = ax;
    ch.y = ay;
    ch.alpha = 1;
    ch.tx = spot.tx;
    ch.ty = spot.ty;
    ch.setPose('stand');
    return true;
  }

  private stepSwitch(ch: Character, s: Extract<Step, { t: 'switch' }>, now: number): boolean {
    const room = this.rooms.get(s.room);
    if (!room) return true;
    const spot = room.layout.spots.find((p) => p.kind === 'switch');
    if (spot) ch.dir = spot.dir;
    if (s.phase === 0) {
      ch.setPose('use');
      if (ch.stepT >= 420) {
        s.phase = 1;
        const stillLast = !s.onlyIfLast || isLastInRoom(room.id, ch.id, this.chars.values());
        if (stillLast && (s.on ? room.present : true)) room.setLight(s.on, now);
      }
      return false;
    }
    ch.setPose('use');
    if (ch.stepT >= 700) {
      ch.setPose('stand');
      return true;
    }
    return false;
  }

  // =================================================================== planning

  /** Interrupts the current plan (respecting steps that must finish). */
  interrupt(ch: Character): void {
    if (ch.step && !this.interruptible(ch.step)) {
      ch.replan = true;
      if (ch.step.t === 'stall' && ch.step.phase <= 1) ch.stallUntil = Math.min(ch.stallUntil ?? 0, this.now + 2000);
      return;
    }
    this.clearPlan(ch);
  }

  interruptible(s: Step): boolean {
    return s.t === 'go' || s.t === 'act' || s.t === 'until' || s.t === 'gather' || s.t === 'do';
  }

  /** Discards the queue (and leaves the circle, if in one). */
  clearPlan(ch: Character): void {
    ch.queue.length = 0;
    ch.step = null;
    ch.thinkAt = 0;
    this.releaseTemp(ch);
    // the 'do' step that would release the switch was discarded along with the queue: without this the reservation
    // leaks and nobody turns the room light on (or off) again while this character exists
    const room = this.rooms.get(ch.roomId);
    if (room && room.switchClaim === ch.id) room.switchClaim = null;
    if (ch.gathering) this.social.leave(ch, this.now);
    ch.chatUntil = 0;
    // the 'do' that frees the spot at the bánh mì cart may have gone with the queue (even before walking out)
    this.banhmi.release(ch.id);
    // out at the tea stall: whatever comes next starts by walking back in through the corridor door
    if (ch.outdoors) {
      this.tea.release(ch.id);
      ch.seated = false;
      ch.sortY = null;
      ch.queue.push({ t: 'route', pts: wayBack(ch.outdoors), run: ch.mode === 'wait' || ch.mode === 'work', trail: 'back' });
    }
  }

  /** End of the way back: indoors again, on the corridor door tile (where the walk grid picks up). */
  private backIndoors(ch: Character): void {
    ch.outdoors = null;
    const x = ch.x;
    const y = ch.y;
    ch.placeAtTile(TEA_DOOR.tx, TEA_DOOR.ty);
    ch.x = x;
    ch.y = y;
  }

  releaseTemp(ch: Character): void {
    for (const id of ch.tempSpots) if (id !== ch.homeSpot) this.spots.release(id, ch.id);
    ch.tempSpots.length = 0;
  }

  reserveTemp(ch: Character, spot: SpotDef): boolean {
    if (!this.spots.reserve(spot.id, ch.id)) return false;
    ch.tempSpots.push(spot.id);
    return true;
  }

  /** Decides the next plan. Returns true if it planned something. */
  private think(ch: Character, now: number): boolean {
    if (ch.gone) return false;
    if (ch.mode === 'leave') return this.planLeave(ch, now);
    if (ch.mode === 'deliver') return this.planDeliver(ch, now);
    const room = this.rooms.get(ch.roomId);
    if (!room || !room.present) return this.planLobby(ch, room);
    this.assignHome(ch);
    if (!ch.homeSpot) return this.planOverflow(ch, room);
    ch.standTile = null;
    // dark room: the first to arrive turns on the light
    if (!room.lightOn && room.phase !== 'dismantling' && !this.switchClaimValid(room)) {
      room.switchClaim = ch.id;
      const sw = room.layout.spots.find((p) => p.kind === 'switch');
      if (sw) {
        const steps: Step[] = [];
        this.pushLeave(ch, steps);
        steps.push(
          { t: 'go', tx: sw.tx, ty: sw.ty, fx: sw.x, fy: sw.y, dir: sw.dir, run: ch.mode === 'wait' },
          { t: 'until', cond: () => room.phase === 'ready', minMs: 0, maxMs: 6000, dir: sw.dir },
          { t: 'switch', room: room.id, on: true, phase: 0 },
          { t: 'do', fn: () => room.switchClaim === ch.id && (room.switchClaim = null) },
        );
        ch.queue.push(...steps);
        return true;
      }
    }
    if (ch.atSpot !== ch.homeSpot) return this.planGoHome(ch, now);
    ch.arriving = false;
    if (ch.mode === 'idle' && !this.longIdle(ch, now) && !this.siestaNap(ch)) {
      if (!ch.nextOutingAt) ch.nextOutingAt = now + idleSitMs(ch.rng, this.options().liveliness);
      if (now >= ch.nextOutingAt) {
        if (this.planOuting(ch, now)) return true;
        ch.nextOutingAt = now + idleSitMs(ch.rng, this.options().liveliness);
      }
    }
    // waiting on a shell: only leaves the desk for a circle (alone, stays with the popcorn)
    if (ch.mode === 'shell') {
      if (!ch.nextSocialAt) ch.nextSocialAt = now + idleSitMs(ch.rng, this.options().liveliness) * 1.3;
      if (now >= ch.nextSocialAt) {
        ch.nextSocialAt = now + idleSitMs(ch.rng, this.options().liveliness) * 1.3;
        const p = personaFor(ch.info.seed);
        if (this.social.hasCompany(ch, now) && ch.rng() < 0.5 + p.sociability * 0.4 && this.social.tryInitiate(ch, now, true)) return true;
      }
    }
    return false;
  }

  /** Get up/leave the current spot before walking. */
  private pushLeave(ch: Character, steps: Step[]): void {
    if (ch.atSpot) steps.push({ t: 'exit' });
  }

  private planGoHome(ch: Character, now: number, held: 'none' | 'coffee' | 'water' = 'none'): boolean {
    const home = this.spots.get(ch.homeSpot);
    if (!home) return false;
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    const dist = Math.abs(home.tx - ch.tx) + Math.abs(home.ty - ch.ty);
    // whoever just arrived walks (unless they need the user); afterwards runs if far away
    const run = shouldRun(dist, ch.mode) && (!ch.arriving || ch.mode === 'wait');
    steps.push({ t: 'go', tx: home.tx, ty: home.ty, run, held }, { t: 'enter', spot: home.id });
    if (ch.mode === 'idle') steps.push({ t: 'do', fn: () => (ch.nextOutingAt = this.now + idleSitMs(ch.rng, this.options().liveliness)) });
    void now;
    ch.queue.push(...steps);
    return true;
  }

  /** No room yet (waiting for a slot): waits in the reception. */
  private planLobby(ch: Character, room: RoomState | undefined): boolean {
    const t = this.lobbyTile(ch);
    ch.queue.push(
      { t: 'go', tx: t.x, ty: t.y },
      { t: 'until', cond: () => !!room && room.present, minMs: 800, maxMs: 4000, dir: 'down' },
    );
    return true;
  }

  /**
   * Full room (all seats reserved): works standing inside their own room, in a free
   * corner, until a seat frees up. Never wanders around the reception.
   */
  private planOverflow(ch: Character, room: RoomState): boolean {
    const stay = ch.standTile && !ch.atSpot && ch.tx === ch.standTile.x && ch.ty === ch.standTile.y && this.overflowFree(ch.tx, ch.ty, ch);
    const t = stay ? ch.standTile : this.overflowTile(ch, room);
    if (!t) return this.planLobby(ch, room);
    ch.standTile = t;
    ch.arriving = false;
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    const r = room.layout.rect;
    // facing the middle of the room (where the desks are)
    const dir: Dir = facing(t.x * TILE, t.y * TILE, (r.x + 5) * TILE, (r.y + 6) * TILE);
    if (t.x !== ch.tx || t.y !== ch.ty || ch.atSpot) {
      const dist = Math.abs(t.x - ch.tx) + Math.abs(t.y - ch.ty);
      steps.push({ t: 'go', tx: t.x, ty: t.y, dir, run: shouldRun(dist, ch.mode) });
    }
    // waiting on a shell standing: only the hourglass (the waiting pose is seated)
    const pose = ch.mode === 'wait' ? 'raise_hand' : ch.mode === 'work' ? 'read' : 'stand';
    const held = ch.mode === 'work' ? 'laptop' : 'none';
    steps.push({ t: 'until', cond: () => this.hasFreeSeat(room, ch), minMs: 1500, maxMs: 12_000, pose, held, dir });
    ch.queue.push(...steps);
    return true;
  }

  private hasFreeSeat(room: RoomState, ch: Character): boolean {
    return !!chooseSeat(room.layout.spots, (id) => this.spots.isFree(id, ch.id), ch.info.kind);
  }

  /** Free tile for someone to stand on (no seat, no spot and no other person). */
  private overflowFree(x: number, y: number, ch: Character, busy = this.busyTiles(ch.id)): boolean {
    const grid = this.building.grid;
    if (grid.get(x, y) !== FREE || busy.has(y * grid.w + x)) return false;
    for (const s of this.spots.all()) if (s.tx === x && s.ty === y) return false;
    return true;
  }

  /** Best free tile in the room to work standing: next to walls/furniture, away from the door. */
  private overflowTile(ch: Character, room: RoomState): { x: number; y: number } | null {
    const grid = this.building.grid;
    const r = room.layout.rect;
    const door = room.layout.door;
    const busy = this.busyTiles(ch.id);
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let y = r.y + 2; y <= r.y + 10; y++) {
      for (let x = r.x + 1; x <= r.x + 14; x++) {
        if (!this.overflowFree(x, y, ch, busy)) continue;
        if (door && Math.abs(x - (door.x + door.w / 2 - 0.5)) <= 1.5 && Math.abs(y - (door.y + door.h / 2 - 0.5)) <= 2) continue;
        // back against a wall/furniture looks natural; squeezed between two pieces of furniture or right up against
        // another person, not
        const solidAt = (dx: number, dy: number) => grid.get(x + dx, y + dy) === BLOCKED;
        let crowd = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) if (busy.has((y + dy) * grid.w + x + dx)) crowd++;
        const backed = solidAt(0, -1) || solidAt(0, 1) ? 2 : solidAt(1, 0) || solidAt(-1, 0) ? 1 : 0;
        const squeezed = (solidAt(1, 0) && solidAt(-1, 0)) || (solidAt(0, 1) && solidAt(0, -1)) ? 3 : 0;
        const score = backed - squeezed - crowd * 3 - (Math.abs(x - ch.tx) + Math.abs(y - ch.ty)) * 0.05 + ch.rng() * 0.8;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    return best;
  }

  private lobbyTile(ch: Character): { x: number; y: number } {
    const reception = this.building.core.find((a) => a.id === RECEPTION_ID)!;
    const r = reception.rect;
    for (let k = 0; k < 20; k++) {
      const x = r.x + 2 + Math.floor(ch.rng() * 12);
      const y = r.y + 3 + Math.floor(ch.rng() * 7);
      if (this.building.grid.get(x, y) === 1) return { x, y };
    }
    return { x: r.x + 6, y: r.y + 9 };
  }

  private planDelegate(ch: Character, now: number): void {
    if (ch.step || ch.queue.length || ch.atSpot !== ch.homeSpot || !ch.homeSpot) return;
    const room = this.rooms.get(ch.roomId);
    const door = room?.layout.door;
    const dir: Dir = door ? facing(ch.x, ch.y, (door.x + door.w / 2) * TILE, (door.y + door.h / 2) * TILE) : 'down';
    const home = ch.homeSpot;
    ch.queue.push(
      { t: 'exit' },
      {
        // standing, facing the door, "explaining" the task to whoever arrives ('raise_hand' and ✋ are
        // reserved for when the agent needs the user)
        t: 'until',
        cond: () => ![...this.chars.values()].some((c) => c.info.parentId === ch.id && c.arriving),
        minMs: 2600,
        maxMs: 7500,
        pose: 'talk',
        held: 'none',
        dir,
      },
      { t: 'go', tx: ch.tx, ty: ch.ty },
      { t: 'enter', spot: home },
    );
    ch.setIcon('chat', 2600, now);
  }

  private planLeave(ch: Character, now: number): boolean {
    ch.leaving = true;
    ch.arriving = false;
    this.spots.releaseAll(ch.id);
    ch.homeSpot = null;
    ch.tempSpots.length = 0;
    if (ch.gathering) this.social.leave(ch, now);
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    const room = this.rooms.get(ch.roomId);
    if (room && room.present && room.lightOn && !this.switchClaimValid(room) && isLastInRoom(room.id, ch.id, this.chars.values())) {
      const sw = room.layout.spots.find((p) => p.kind === 'switch');
      if (sw) {
        room.switchClaim = ch.id;
        steps.push(
          { t: 'go', tx: sw.tx, ty: sw.ty, fx: sw.x, fy: sw.y, dir: sw.dir },
          { t: 'until', cond: () => this.physicallyInside(room, ch.id) === 0, minMs: 250, maxMs: 9000, dir: sw.dir },
          { t: 'switch', room: room.id, on: false, phase: 0, onlyIfLast: true },
          { t: 'do', fn: () => room.switchClaim === ch.id && (room.switchClaim = null) },
        );
      }
    }
    // came by motorbike: back out to it, on, and off into the traffic
    const slot = this.parkedBikes.get(ch.id);
    if (slot !== undefined && this.bikes && !this.visit) {
      const p = PARKING[slot];
      steps.push(
        { t: 'go', tx: TEA_DOOR.tx, ty: TEA_DOOR.ty },
        { t: 'route', pts: routeToSeat({ x: p.x - 9, y: p.y - 3 }), trail: 'out' },
        {
          t: 'do',
          fn: () => {
            this.parkedBikes.delete(ch.id);
            this.bikeTrips.push({ t: 'depart', id: ch.id, slot, appearance: ch.appearance });
            ch.alpha = 0;
          },
        },
        { t: 'remove' },
      );
      ch.queue.push(...steps);
      return true;
    }
    const el = this.pickElevator(ch);
    const es = this.spots.get(el.spotId)!;
    steps.push({ t: 'go', tx: es.tx, ty: es.ty, fx: es.tx * TILE + FOOT_DX + (es.x - (es.tx * TILE + FOOT_DX)) * 0.5, fy: es.ty * TILE + FOOT_DY - 2, dir: 'up' });
    steps.push({ t: 'elevIn', elev: el.index, phase: 0 }, { t: 'remove' });
    ch.queue.push(...steps);
    void now;
    return true;
  }

  private planDeliver(ch: Character, now: number): boolean {
    const parent = ch.info.parentId ? this.chars.get(ch.info.parentId) : undefined;
    if (!parent || parent.leaving || parent.gone) {
      ch.delivered = true;
      ch.mode = 'leave';
      return this.planLeave(ch, now);
    }
    const target = this.besideTile(parent, ch);
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    const held = ch.rng() < 0.5 ? 'papers' : 'box';
    const title = ch.info.title ?? tr('result');
    steps.push(
      { t: 'go', tx: target.x, ty: target.y, held },
      {
        t: 'do',
        fn: () => {
          ch.dir = facing(ch.x, ch.y, parent.x, parent.y);
          ch.showBubble('📦', tr('Delivering: {0}', [title]), 3000, this.now);
          ch.setIcon('box', 2800, this.now);
          parent.setIcon(parent.rng() < 0.5 ? 'heart' : 'check', 2800, this.now);
        },
      },
      { t: 'act', pose: 'talk', held, ms: 2700 },
      {
        t: 'do',
        fn: () => {
          ch.delivered = true;
          ch.mode = 'leave';
          this.social.delivered(ch, this.now);
        },
      },
    );
    ch.queue.push(...steps);
    return true;
  }

  /** Walkable tile next to someone (avoiding seats and occupied tiles), closest to whoever is coming. */
  private besideTile(target: Character, from: Character): { x: number; y: number } {
    const grid = this.building.grid;
    const busy = this.busyTiles(from.id, target.id);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, 1],
      [0, -1],
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ] as const) {
      const x = target.tx + dx;
      const y = target.ty + dy;
      const cell = grid.get(x, y);
      if (cell === 0) continue;
      const d = Math.abs(x - from.tx) + Math.abs(y - from.ty) + (cell === SEAT ? 20 : 0) + (busy.has(y * grid.w + x) ? 40 : 0) + (dx && dy ? 3 : 0);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best ?? grid.nearestWalkable(target.tx, target.ty) ?? { x: target.tx, y: target.ty };
  }

  /** Tiles (index y*w+x) where someone is standing or about to stand, except `a` and `b`. */
  busyTiles(a: string, b?: string): Set<number> {
    const w = this.building.grid.w;
    const out = new Set<number>();
    for (const c of this.chars.values()) {
      if (c.gone || c.id === a || c.id === b) continue;
      out.add(c.ty * w + c.tx);
      const go = c.step?.t === 'go' ? c.step : c.queue.find((s): s is Extract<Step, { t: 'go' }> => s.t === 'go');
      if (go) out.add(go.ty * w + go.tx);
      if (c.standTile) out.add(c.standTile.y * w + c.standTile.x);
    }
    return out;
  }

  private randomFree(kinds: SpotKind[], ch: Character): SpotDef | null {
    const cands: SpotDef[] = [];
    for (const k of kinds) for (const s of this.spots.ofKind(k)) if (this.spots.isFree(s.id, ch.id)) cands.push(s);
    if (!cands.length) return null;
    return cands[Math.floor(ch.rng() * cands.length)];
  }

  /** Local hour (0–24, fractional) on the simulation clock; `hourOverride` pins it (debug). */
  hourOf(now: number): number {
    if (this.hourOverride !== null) return this.hourOverride;
    const d = new Date(now);
    return d.getHours() + d.getMinutes() / 60;
  }

  /**
   * Mealtime: at lunch (11:30–12:30, then the siesta) whoever is idle goes to eat a phở in the pantry or on a sofa; in the afternoon
   * (14:30–16:00), grabs a trà sữa from the fridge or the machine and sits down to drink it. Returns whether it planned.
   */
  private planMeal(ch: Character, now: number): boolean {
    const h = this.hourOf(now);
    const party = now < this.pizzaUntil;
    const lunch = !party && lunchTime(h);
    const tea = !party && h >= 14.5 && h < 16;
    if (!party && !lunch && !tea) return false;
    const rng = ch.rng;
    if (rng() > (party ? 0.9 : lunch ? 0.7 : 0.45)) return false;
    const item = party ? 'pizza' : lunch ? 'noodles' : 'bubbletea';
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    if (tea) {
      const s = this.spots.findFree(rng() < 0.5 ? 'fridge' : 'snack', { by: ch.id, rng }) ?? this.spots.findFree('snack', { by: ch.id, rng });
      if (s && this.reserveTemp(ch, s)) {
        steps.push({ t: 'go', tx: s.tx, ty: s.ty, fx: s.x, fy: s.y, dir: s.dir }, { t: 'act', pose: 'use', ms: 1400 });
        steps.push({ t: 'do', fn: () => this.spots.release(s.id, ch.id) });
      }
    }
    const seat = this.spots.findFree('cafe_seat', { by: ch.id, rng }) ?? this.randomFree(LOUNGE_SEATS, ch);
    if (!seat || !this.reserveTemp(ch, seat)) {
      // no seat: eats standing right there
      if (!steps.length) return false;
      steps.push({ t: 'act', pose: 'drink', held: item, ms: between(rng, 5000, 9000) });
    } else {
      steps.push(
        { t: 'go', tx: seat.tx, ty: seat.ty, held: item },
        { t: 'enter', spot: seat.id },
        { t: 'act', pose: 'sit', held: item, ms: lunch || party ? between(rng, 20_000, 40_000) : between(rng, 10_000, 18_000) },
        { t: 'exit' },
        { t: 'do', fn: () => this.spots.release(seat.id, ch.id) },
      );
    }
    ch.queue.push(...steps);
    this.pushHome(ch, 'none');
    return true;
  }

  private planOuting(ch: Character, now: number): boolean {
    const near = { tx: ch.tx, ty: ch.ty };
    const rng = ch.rng;
    if (this.planMeal(ch, now)) return true;
    const persona = personaFor(ch.info.seed);
    // idle coworkers: the urge is for company (personality sets the dose) — TV, game, chat, bet...
    if (this.social.hasCompany(ch, now) && rng() < 0.45 + persona.sociability * 0.4 && this.social.tryInitiate(ch, now, false)) return true;
    const avail: Partial<Record<IdleActivity, boolean>> = {
      coffee: !!this.spots.findFree('coffee', { by: ch.id }),
      water: !!this.spots.findFree('water', { by: ch.id }),
      bathroom: !!this.spots.findFree('stall', { by: ch.id }),
      lounge: LOUNGE_SEATS.some((k) => !!this.spots.findFree(k, { by: ch.id })),
      // games and chats are circles (social/): here only what you do alone
      pingpong: false,
      talk: false,
      window: !!this.spots.findFree('window', { by: ch.id }),
      shelf: !!this.spots.findFree('shelf', { by: ch.id }),
      arcade: !!this.spots.findFree('arcade', { by: ch.id }),
      snack: !!this.spots.findFree('snack', { by: ch.id }),
      stretch: true,
      mirror: !!this.social.plan('mirror', 1, ch),
      phone: !!this.randomFree(PHONE_SEATS, ch),
      tea: !this.flooded && this.teaUp && this.tea.hasFree(),
      banhmi: !this.flooded && this.banhmiUp && this.banhmi.hasFree(),
      flood: this.flooded && !this.visit,
    };
    const what = pickIdleActivity(rng, avail, soloWeights(persona));
    if (!what) return false;
    const steps: Step[] = [];
    const goUse = (s: SpotDef, held: 'none' | 'coffee' = 'none'): void => {
      steps.push({ t: 'go', tx: s.tx, ty: s.ty, fx: s.x, fy: s.y, dir: s.dir, held });
    };
    const release = (s: SpotDef) => steps.push({ t: 'do', fn: () => this.spots.release(s.id, ch.id) });
    let carry: 'none' | 'coffee' | 'water' = 'none';

    switch (what) {
      case 'coffee': {
        const s = this.spots.findFree('coffee', { near, by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'use', ms: 1900, machine: s.furnitureId, icon: 'coffee', sound: 'coffee' }, { t: 'act', pose: 'drink', held: 'coffee', ms: 2600 });
        release(s);
        carry = 'coffee';
        if (rng() < 0.45) {
          const seat = this.spots.findFree('cafe_seat', { by: ch.id, rng, near: { tx: s.tx, ty: s.ty } });
          if (seat && this.reserveTemp(ch, seat)) {
            steps.push(
              { t: 'go', tx: seat.tx, ty: seat.ty, held: 'coffee' },
              { t: 'enter', spot: seat.id },
              { t: 'act', pose: 'sit', held: 'coffee', ms: between(rng, 6000, 15000) },
              { t: 'exit' },
            );
            release(seat);
          }
        }
        break;
      }
      case 'water': {
        const s = this.spots.findFree('water', { near, by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'use', ms: 1000 }, { t: 'act', pose: 'drink', held: 'water', ms: 2500 });
        release(s);
        carry = rng() < 0.4 ? 'water' : 'none';
        break;
      }
      case 'bathroom': {
        const s = this.spots.findFree('stall', { by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        steps.push({ t: 'go', tx: s.tx, ty: s.ty }, { t: 'stall', spot: s.id, ms: between(rng, 5000, 12000), phase: 0 });
        release(s);
        const sink = this.spots.findFree('sink', { near: { tx: s.tx, ty: s.ty }, by: ch.id });
        if (sink && this.reserveTemp(ch, sink)) {
          goUse(sink);
          steps.push({ t: 'act', pose: 'use', ms: 2200, sound: 'tap' });
          release(sink);
        }
        break;
      }
      case 'lounge': {
        const s = this.randomFree(LOUNGE_SEATS, ch);
        if (!s || !this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        steps.push({ t: 'go', tx: s.tx, ty: s.ty }, { t: 'enter', spot: s.id });
        if (rng() < (hasTrait(persona, 'sonecas') ? 0.7 : 0.25)) steps.push({ t: 'act', pose: 'sit', ms: between(rng, 3000, 6000) }, { t: 'act', pose: 'sleep', ms: between(rng, 8000, 16000), icon: 'zzz' });
        else steps.push({ t: 'act', pose: 'sit', ms: between(rng, 9000, 22000), icon: rng() < 0.3 ? 'music' : undefined });
        steps.push({ t: 'exit' });
        release(s);
        break;
      }
      case 'pingpong':
      case 'talk':
        return this.social.tryInitiate(ch, now, false);
      case 'mirror':
        return this.social.startSolo('mirror', ch, now);
      case 'phone': {
        // sits on a pouf/sofa/bench and scrolls the phone
        const s = this.randomFree(PHONE_SEATS, ch);
        if (!s || !this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        steps.push({ t: 'go', tx: s.tx, ty: s.ty }, { t: 'enter', spot: s.id }, { t: 'act', pose: 'read', held: 'phone', ms: between(rng, 8000, 18000) }, { t: 'exit' });
        release(s);
        break;
      }
      case 'window': {
        // look out the window or check the kanban board of their own room
        const board = rng() < 0.35 ? this.spots.findFree('whiteboard', { by: ch.id, filter: (p) => p.areaId === ch.roomId }) : null;
        const s = board ?? this.spots.findFree('window', { by: ch.id, rng });
        if (!s || !this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: board ? 'read' : 'stand', held: board ? 'papers' : 'none', ms: between(rng, 5000, 10000), icon: rng() < 0.3 ? 'idea' : undefined });
        release(s);
        break;
      }
      case 'shelf': {
        const s = this.spots.findFree('shelf', { by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'read', held: 'book', ms: between(rng, 5000, 9000) });
        release(s);
        break;
      }
      case 'arcade': {
        const s = this.spots.findFree('arcade', { by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'use', ms: between(rng, 6000, 12000), icon: rng() < 0.4 ? 'star' : undefined });
        release(s);
        break;
      }
      case 'snack': {
        // snack machine or pantry fridge
        const s = this.spots.findFree(rng() < 0.6 ? 'snack' : 'fridge', { by: ch.id, rng }) ?? this.spots.findFree('snack', { by: ch.id, rng });
        if (!s || !this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'use', ms: 1600 }, { t: 'act', pose: 'stand', ms: 900 });
        release(s);
        break;
      }
      case 'tea':
        return this.planTea(ch);
      case 'banhmi':
        return this.planBanhMi(ch);
      case 'flood':
        return this.planFloodWatch(ch);
      case 'stretch': {
        const home = ch.homeSpot;
        if (!home) return false;
        steps.push({ t: 'exit' }, { t: 'act', pose: 'stretch', ms: 2600 }, { t: 'enter', spot: home });
        steps.push({ t: 'do', fn: () => (ch.nextOutingAt = this.now + idleSitMs(ch.rng, this.options().liveliness)) });
        ch.queue.push(...steps);
        return true;
      }
    }
    ch.queue.push(...steps);
    this.pushHome(ch, carry);
    void now;
    return true;
  }

  /**
   * Iced tea on the sidewalk: out through the corridor's west glass, down the stone path, a glass on a plastic stool
   * (ordering out loud, chatting if there's company) and back in the same way.
   */
  private planTea(ch: Character): boolean {
    const i = this.tea.reserve(ch.id, ch.rng);
    if (i < 0) return false;
    const seat = TEA_SEATS[i];
    const rng = ch.rng;
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    steps.push(
      { t: 'go', tx: TEA_DOOR.tx, ty: TEA_DOOR.ty },
      { t: 'route', pts: routeToSeat(seat), trail: 'out' },
      {
        t: 'do',
        fn: () => {
          this.tea.sit(i, ch.id);
          ch.seated = true;
          ch.sortY = seatDepth(seat);
          ch.dir = seat.dir;
          this.social.say(ch, orderLine(rng), this.now);
          const seller = this.extras.find((e) => e.id === TEA_SELLER_ID);
          if (seller) seller.chatEmoji = '😊';
          if (seller) seller.chatUntil = this.now + 1_500;
        },
      },
      { t: 'act', pose: 'sit', dir: seat.dir, ms: between(rng, 3000, 5000) },
      { t: 'act', pose: 'sit', held: 'water', dir: seat.dir, ms: between(rng, 14_000, 30_000) },
      {
        t: 'do',
        fn: () => {
          this.tea.release(ch.id);
          ch.seated = false;
          ch.sortY = null;
          ch.queue.unshift({ t: 'route', pts: wayBack(ch.outdoors ?? []), trail: 'back' });
        },
      },
    );
    ch.queue.push(...steps);
    this.pushHome(ch, 'none');
    return true;
  }

  /** Flooded street: out the same way as for the tea, a look at the water from the curb, a sigh, a facepalm, back in. */
  private planFloodWatch(ch: Character): boolean {
    const rng = ch.rng;
    const spot = { x: Math.round(between(rng, 0, 5 * TILE)), y: LANE_Y + 4 };
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    steps.push(
      { t: 'go', tx: TEA_DOOR.tx, ty: TEA_DOOR.ty },
      { t: 'route', pts: routeToSeat(spot), trail: 'out' },
      { t: 'act', pose: 'stand', dir: 'down', ms: between(rng, 4000, 7000) },
      { t: 'do', fn: () => this.social.say(ch, floodLine(rng), this.now) },
      { t: 'act', pose: 'facepalm', dir: 'down', ms: between(rng, 2500, 3500) },
      { t: 'act', pose: 'stand', dir: 'down', ms: between(rng, 2000, 4000) },
      { t: 'do', fn: () => ch.queue.unshift({ t: 'route', pts: wayBack(ch.outdoors ?? []), trail: 'back' }) },
    );
    ch.queue.push(...steps);
    this.pushHome(ch, 'none');
    return true;
  }

  /** Debug: up to three of the idle ones go out to look at the flooded street now. Returns how many went. */
  floodWatchNow(): number {
    let n = 0;
    for (const c of this.chars.values()) {
      if (n >= 3) break;
      if (c.leaving || c.mode !== 'idle' || c.outdoors || c.gathering || c.inside || (c.step && !this.interruptible(c.step))) continue;
      this.clearPlan(c);
      if (this.planFloodWatch(c)) n++;
    }
    return n;
  }

  /** Debug: whoever is idle (and not already outside or in a circle) goes for iced tea now. Returns how many went. */
  teaNow(): number {
    if (!this.teaUp) return 0;
    let n = 0;
    for (const c of this.chars.values()) {
      if (c.leaving || c.mode !== 'idle' || c.outdoors || c.gathering || c.inside || (c.step && !this.interruptible(c.step))) continue;
      if (!this.tea.hasFree()) break;
      this.clearPlan(c);
      if (this.planTea(c)) n++;
    }
    return n;
  }

  /**
   * The stall's day: the seller walks in at opening and sets up, calls out now and then, the customers chat; at
   * closing she walks off and the stools get stacked. Runs once a second (housekeeping).
   */
  private updateTea(now: number): void {
    const open = !this.visit && teaOpen(this.hourOf(now));
    let seller = this.extras.find((e) => e.id === TEA_SELLER_ID);
    if (open && !seller) seller = this.spawnTeaSeller(now) ?? undefined;
    if (!seller) {
      this.teaUp = false;
      return;
    }
    const sitting = this.tea.sitting();
    if (!seller.seated || seller.sayUntil > now) return;
    const rng = seller.rng;
    if (sitting.length >= 2 && rng() < 0.12) {
      const who = this.chars.get(sitting[Math.floor(rng() * sitting.length)]);
      if (who && who.sayUntil <= now) this.social.say(who, chatLine(rng), now);
    } else if (sitting.length && rng() < 0.08) {
      const who = this.chars.get(sitting[Math.floor(rng() * sitting.length)]);
      if (who) {
        who.chatEmoji = rng() < 0.5 ? '😂' : '🧊';
        who.chatUntil = now + 1_400;
      }
    } else if (rng() < 0.015) this.social.say(seller, sellerLine(rng), now);
  }

  /** The seller: conical hat, brown blouse; walks in along the sidewalk, sits by the jug until closing, walks off. */
  private spawnTeaSeller(now: number): Character | null {
    let appearance;
    try {
      const base = this.art.appearanceFromSeed(7319, { look: 'f', sub: false });
      appearance = { ...base, top: '#8a5a3c', topAccent: '#d9b48a', bottom: '#2e2a33', accessory: 'none' as const, lanyard: null };
    } catch {
      return null;
    }
    const info: AgentInfo = {
      id: TEA_SELLER_ID,
      kind: 'main',
      provider: 'claude',
      roomId: RECEPTION_ID,
      name: tr('Iced tea seller'),
      look: 'f',
      role: tr('Iced tea seller'),
      sessionId: TEA_SELLER_ID,
      account: '',
      status: 'working',
      recent: [],
      tasks: [],
      startedAt: now,
      lastEventAt: now,
      statusSince: now,
      stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
      seed: 7319,
    };
    const ch = new Character(info, appearance);
    ch.costume = 'nonla';
    const pts = sellerRouteIn(TEA_SELLER_FROM_X);
    ch.x = pts[0];
    ch.y = pts[1];
    ch.dir = 'right';
    const seat = TEA_SELLER_SEAT;
    ch.queue.push(
      { t: 'route', pts, held: 'box' },
      {
        t: 'do',
        fn: () => {
          this.teaUp = true;
          ch.seated = true;
          ch.sortY = seatDepth(seat);
          ch.dir = seat.dir;
        },
      },
      { t: 'until', cond: () => this.visit || !teaOpen(this.hourOf(this.now)), minMs: 0, maxMs: Number.MAX_SAFE_INTEGER, pose: 'sit', dir: seat.dir },
      {
        t: 'do',
        fn: () => {
          this.teaUp = false;
          ch.seated = false;
          ch.sortY = null;
          // whoever is still sitting there drinks up and goes back in
          for (const id of this.tea.sitting()) {
            const c = this.chars.get(id);
            if (c) this.interrupt(c);
          }
        },
      },
      { t: 'route', pts: sellerRouteOut(TEA_SELLER_FROM_X), held: 'box' },
      { t: 'remove' },
    );
    this.extras.push(ch);
    return ch;
  }

  /**
   * Breakfast from the bánh mì cart: out the same way as for the tea, order at the glass case (the vendor hands it
   * over), back in carrying it and eat it seated at the desk.
   */
  private planBanhMi(ch: Character): boolean {
    const i = this.banhmi.reserve(ch.id, ch.rng);
    if (i < 0) return false;
    const spot = BANHMI_SPOTS[i];
    const rng = ch.rng;
    const order = pickOrder(rng);
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    steps.push(
      { t: 'go', tx: TEA_DOOR.tx, ty: TEA_DOOR.ty },
      { t: 'route', pts: routeToSeat(spot), trail: 'out' },
      {
        t: 'do',
        fn: () => {
          this.banhmi.sit(i, ch.id);
          ch.dir = spot.dir;
          this.social.say(ch, order.line, this.now);
          const vendor = this.extras.find((e) => e.id === BANHMI_VENDOR_ID);
          if (vendor) vendor.chatEmoji = '🥖';
          if (vendor) vendor.chatUntil = this.now + 2_500;
        },
      },
      { t: 'act', pose: 'stand', dir: spot.dir, ms: between(rng, 2500, 4000) },
      {
        t: 'do',
        fn: () => {
          const vendor = this.extras.find((e) => e.id === BANHMI_VENDOR_ID);
          if (vendor && vendor.sayUntil <= this.now) this.social.say(vendor, vendorReply(rng), this.now);
        },
      },
      { t: 'act', pose: 'stand', held: order.held, dir: spot.dir, ms: between(rng, 1200, 2200) },
      {
        t: 'do',
        fn: () => {
          this.banhmi.release(ch.id);
          ch.queue.unshift({ t: 'route', pts: wayBack(ch.outdoors ?? []), held: order.held, trail: 'back' });
        },
      },
    );
    ch.queue.push(...steps);
    // back at the desk with it: breakfast seated, then the usual rest before the next stroll
    const home = this.spots.get(ch.homeSpot);
    ch.queue.push({ t: 'do', fn: () => this.releaseTemp(ch) });
    if (!home) return true;
    ch.queue.push(
      { t: 'go', tx: home.tx, ty: home.ty, held: order.held },
      { t: 'enter', spot: home.id },
      { t: 'act', pose: 'sit', held: order.held, ms: between(rng, 20_000, 40_000) },
      { t: 'do', fn: () => (ch.nextOutingAt = this.now + idleSitMs(ch.rng, this.options().liveliness)) },
    );
    return true;
  }

  /** Debug: whoever is idle (and not already outside or in a circle) goes to the bánh mì cart now. Returns how many went. */
  banhmiNow(): number {
    if (!this.banhmiUp) return 0;
    let n = 0;
    for (const c of this.chars.values()) {
      if (c.leaving || c.mode !== 'idle' || c.outdoors || c.gathering || c.inside || (c.step && !this.interruptible(c.step))) continue;
      if (!this.banhmi.hasFree()) break;
      this.clearPlan(c);
      if (this.planBanhMi(c)) n++;
    }
    return n;
  }

  /** Where the cart is drawn (bottom center, px): next to the vendor while he's around, null otherwise. */
  banhmiCart(): { x: number; y: number } | null {
    const vendor = this.extras.find((e) => e.id === BANHMI_VENDOR_ID && !e.gone);
    return vendor ? cartAt(vendor) : null;
  }

  /** The cart's morning: the vendor pushes it in at opening, calls out now and then, pushes it off at closing. Once a second. */
  private updateBanhMi(now: number): void {
    const open = !this.visit && banhmiOpen(this.hourOf(now));
    let vendor = this.extras.find((e) => e.id === BANHMI_VENDOR_ID);
    if (open && !vendor) vendor = this.spawnBanhMiVendor(now) ?? undefined;
    if (!vendor) {
      this.banhmiUp = false;
      return;
    }
    if (!this.banhmiUp || vendor.sayUntil > now) return;
    if (vendor.rng() < 0.015) this.social.say(vendor, vendorLine(vendor.rng), now);
  }

  /** The vendor: cap and white shirt; pushes the cart along the curb, stands at its handle until closing, pushes on east. */
  private spawnBanhMiVendor(now: number): Character | null {
    let appearance;
    try {
      const base = this.art.appearanceFromSeed(5021, { look: 'm', sub: false });
      appearance = { ...base, top: '#eeeae0', topAccent: '#c9c2b0', bottom: '#3a4a5c', accessory: 'cap' as const, lanyard: null };
    } catch {
      return null;
    }
    const info: AgentInfo = {
      id: BANHMI_VENDOR_ID,
      kind: 'main',
      provider: 'claude',
      roomId: RECEPTION_ID,
      name: tr('Bánh mì vendor'),
      look: 'm',
      role: tr('Bánh mì vendor'),
      sessionId: BANHMI_VENDOR_ID,
      account: '',
      status: 'working',
      recent: [],
      tasks: [],
      startedAt: now,
      lastEventAt: now,
      statusSince: now,
      stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
      seed: 5021,
    };
    const ch = new Character(info, appearance);
    const pts = vendorRouteIn(TEA_SELLER_FROM_X);
    ch.x = pts[0];
    ch.y = pts[1];
    ch.dir = 'right';
    const spot = BANHMI_VENDOR_SPOT;
    ch.queue.push(
      { t: 'route', pts },
      { t: 'do', fn: () => (this.banhmiUp = true) },
      { t: 'until', cond: () => this.visit || !banhmiOpen(this.hourOf(this.now)), minMs: 0, maxMs: Number.MAX_SAFE_INTEGER, pose: 'stand', dir: spot.dir },
      {
        t: 'do',
        fn: () => {
          this.banhmiUp = false;
          // whoever is still on the way or at the cart goes back in
          for (const id of [...this.banhmi.taken]) {
            const c = id ? this.chars.get(id) : undefined;
            if (c) this.interrupt(c);
          }
          this.banhmi.clear();
        },
      },
      { t: 'route', pts: vendorRouteOut((this.building.cols * COL_W + 19) * TILE) },
      { t: 'remove' },
    );
    this.extras.push(ch);
    return ch;
  }

  /** Goes back to the desk at the end of a stroll. */
  pushHome(ch: Character, held: 'none' | 'coffee' | 'water'): void {
    const home = this.spots.get(ch.homeSpot);
    ch.queue.push({ t: 'do', fn: () => this.releaseTemp(ch) });
    if (!home) return;
    ch.queue.push({ t: 'go', tx: home.tx, ty: home.ty, held }, { t: 'enter', spot: home.id });
    ch.queue.push({ t: 'do', fn: () => (ch.nextOutingAt = this.now + idleSitMs(ch.rng, this.options().liveliness)) });
  }

  /** Rest pose when there are no steps (at the desk: typing, asking for attention, seated or napping). */
  private restPose(ch: Character, now: number): void {
    const spot = ch.atSpot ? this.spots.get(ch.atSpot) : undefined;
    const atHome = !!spot && ch.atSpot === ch.homeSpot;
    // disco: everyone standing still dances in place (arms up and laughing, to the beat)
    if (now < this.discoUntil || this.newYear.phase === 'party') {
      if (spot) ch.dir = spot.dir;
      ch.setPose(Math.floor((now + (ch.lane + 1) * 397) / 1600) % 2 ? 'cheer' : 'laugh');
      return;
    }
    // error after error: hands on head, right there (seated or standing)
    if (now < ch.frustratedUntil && (atHome || !spot) && ch.mode === 'work') {
      if (spot) ch.dir = spot.dir;
      ch.setPose('facepalm');
      return;
    }
    if (!spot) {
      // no seat (full room): works standing with the laptop
      if (ch.mode === 'wait') ch.setPose('raise_hand');
      else if (ch.mode === 'work' && ch.standTile) ch.setPose('read', 'laptop');
      else ch.setPose('stand');
      return;
    }
    if (spot.kind === 'stand') {
      ch.dir = spot.dir;
      if (ch.mode === 'work') ch.setPose('read', 'laptop');
      else if (ch.mode === 'wait') ch.setPose('raise_hand');
      else ch.setPose('stand');
      return;
    }
    if (!spot.seated) {
      ch.setPose('stand');
      return;
    }
    ch.dir = spot.dir;
    // no desk (stool, armchair, pouf): works on the laptop
    const laptop = spot.kind === 'stool' || spot.kind === 'nook';
    if (atHome && ch.mode === 'work') ch.setPose('type', laptop ? 'laptop' : 'none');
    else if (atHome && ch.mode === 'wait') ch.setPose('raise_hand');
    else if (atHome && ch.mode === 'shell') this.shellPose(ch, spot, now);
    else if (ch.mode === 'idle' && ((this.longIdle(ch, now) && now >= ch.awakeUntil) || this.siestaNap(ch))) {
      ch.setPose('sleep');
      if (!ch.sleepSince) ch.sleepSince = now;
    }
    else ch.setPose('sit');
  }

  /**
   * Shell-wait pose seated at the desk, by escalation (sim/shell.ts): popcorn, arms crossed
   * with chair spins, yawns under the cobweb and, finally, the nap. No allocation (runs per frame).
   */
  private shellPose(ch: Character, spot: SpotDef, now: number): void {
    // visit: arms crossed looking at the terminal, always (the escalation depends on timing that didn't come from the world)
    if (this.visit) {
      ch.setPose('wait');
      return;
    }
    const age = now - ch.shellSince;
    switch (ch.shellStage ?? shellStage(age)) {
      case 'popcorn':
        ch.setPose('wait', 'popcorn');
        return;
      case 'restless': {
        // full spin in the chair (directions in quick sequence), arms crossed
        ch.dir = spinDir(spinPhase(age, ch.info.seed), spot.dir);
        ch.setPose('wait');
        return;
      }
      case 'cobweb': {
        const yawn = yawnPhase(age, ch.info.seed);
        if (yawn >= 0) {
          // yawn: the head droops and a 🥱 slips out
          if (now > ch.chatUntil) {
            ch.chatEmoji = '🥱';
            ch.chatUntil = now + 1300;
          }
          ch.setPose('sleep');
        } else ch.setPose('wait');
        return;
      }
      case 'nap':
        ch.setPose('sleep');
        return;
    }
  }

  // =================================================================== visit

  /** Idle for a long time (naps at the desk, doesn't always accept invites)? In a visit, never: the timing didn't come from the world. */
  longIdle(ch: Character, now: number): boolean {
    return !this.visit && isLongIdle(ch.info.status, ch.info.statusSince, now);
  }

  /** The drawn characters: the agents and, in a visit, the visitor (last). */
  *people(): IterableIterator<Character> {
    yield* this.chars.values();
    for (const e of this.extras) if (!e.gone) yield e;
    if (this.visitor && !this.visitor.gone) yield this.visitor;
  }

  /** A drawn character by id (agent or the visitor). */
  person(id: string): Character | undefined {
    return this.chars.get(id) ?? (this.visitor?.id === id ? this.visitor : undefined) ?? this.extras.find((e) => e.id === id);
  }

  /** Visit: the visitor appears in the reception elevator and steps out into the hall (null = removes the visitor). */
  setVisitor(info: AgentInfo | null, now: number): Character | null {
    const old = this.visitor;
    if (old) for (const e of this.elevators) e.release(old.id, now);
    this.visitor = null;
    this.visitorIntent = { ...NO_INTENT };
    if (!info) return null;
    let appearance;
    try {
      appearance = { ...this.art.appearanceFromSeed(info.seed, { look: info.look, sub: false, parts: info.parts }), lanyard: VISITOR_LANYARD };
    } catch {
      return null;
    }
    const ch = new Character(info, appearance);
    const el = this.elevators[0];
    const spot = el ? this.spots.get(el.spotId) : undefined;
    if (!el || !spot) return null;
    ch.placeAtTile(spot.tx, spot.ty);
    ch.x = spot.x;
    ch.y = spot.y - 6;
    ch.dir = 'down';
    ch.alpha = 0;
    ch.inside = true;
    ch.arriving = true;
    ch.hiddenUntil = el.reserveAppear(now);
    ch.queue.push({ t: 'elevOut', elev: el.index, phase: 0 });
    this.visitor = ch;
    return ch;
  }

  /** The visitor is in the elevator (arriving or leaving): doesn't walk or leave again. */
  get visitorBusy(): boolean {
    const v = this.visitor;
    if (!v || v.gone) return true;
    return v.leaving || [v.step, ...v.queue].some((s) => s?.t === 'elevOut' || s?.t === 'elevIn');
  }

  /** Visit: the visitor walks to the tile (click; the keyboard cancels). */
  visitorWalkTo(tx: number, ty: number, run = false): boolean {
    const v = this.visitor;
    if (!v || this.visitorBusy) return false;
    v.queue.length = 0;
    v.step = null;
    v.queue.push({ t: 'go', tx, ty, run });
    return true;
  }

  /** The elevator near the visitor (within EXIT_RADIUS tiles of its front), or null: from there they leave the building. */
  visitorElevator(): Elevator | null {
    const v = this.visitor;
    if (!v || this.visitorBusy) return null;
    const t = tileAt(v.x, v.y);
    for (const e of this.elevators) {
      const spot = this.spots.get(e.spotId);
      if (spot && Math.hypot(spot.tx - t.x, spot.ty - t.y) <= EXIT_RADIUS) return e;
    }
    return null;
  }

  /** Visit: the visitor enters the closest elevator and disappears; `done` when the door closes (the scene sends the `leave`). */
  visitorExit(done: () => void): boolean {
    const v = this.visitor;
    if (!v || this.visitorBusy) return false;
    const t = tileAt(v.x, v.y);
    let best: { e: Elevator; d: number; tx: number; ty: number } | null = null;
    for (const e of this.elevators) {
      const spot = this.spots.get(e.spotId);
      if (!spot) continue;
      const d = Math.hypot(spot.tx - t.x, spot.ty - t.y);
      if (!best || d < best.d) best = { e, d, tx: spot.tx, ty: spot.ty };
    }
    if (!best) return false;
    v.queue.length = 0;
    v.step = null;
    v.leaving = true;
    this.visitorIntent = { ...NO_INTENT };
    v.queue.push({ t: 'go', tx: best.tx, ty: best.ty }, { t: 'elevIn', elev: best.e.index, phase: 0 }, { t: 'do', fn: done });
    return true;
  }

  /**
   * Visit lights (see VisitLight): dark, the rooms with nobody in them dark; discreet, the ready rooms lit. Live,
   * nothing (whoever arrives turns it on, the last one out turns it off). `instant`: no transition (entering the building).
   */
  applyVisitLight(now: number, instant = false): void {
    if (!this.visit || this.visitLight === 'live') return;
    const at = instant ? now - 10_000 : now;
    for (const room of this.rooms.values()) {
      if (!room.present || room.ghost) continue;
      if (this.visitLight === 'away') {
        if (room.lightOn && this.occupants(room) === 0 && !this.switchClaimValid(room)) room.setLight(false, at);
      } else if (!room.lightOn && room.phase === 'ready') room.setLight(true, at);
    }
  }

  /** Visit: the keyboard walks freely (with collision); otherwise, the queue step (elevator, click path). */
  private runVisitor(v: Character, dt: number, now: number): void {
    v.animT += dt * 1000;
    if (v.icon && now >= v.iconUntil) v.icon = null;
    const intent = this.visitorIntent;
    const busy = this.visitorBusy;
    if (!busy && (intent.dx || intent.dy)) {
      // the keyboard is in charge: forget the click path
      v.queue.length = 0;
      v.step = null;
      const r = stepFree(this.building.grid, { x: v.x, y: v.y, dir: v.dir }, intent, (intent.run ? RUN_SPEED : WALK_SPEED) * dt);
      v.x = r.x;
      v.y = r.y;
      v.dir = r.dir;
      const t = tileAt(v.x, v.y);
      v.tx = t.x;
      v.ty = t.y;
      v.setPose(r.moved ? (intent.run ? 'run' : 'walk') : 'stand');
      return;
    }
    if (!v.step) {
      v.step = v.queue.shift() ?? null;
      v.stepT = 0;
      v.stepStarted = false;
    }
    if (v.step) {
      const done = this.runStep(v, v.step, dt, now);
      v.stepT += dt * 1000;
      if (done) v.step = null;
      if (v.arriving && !v.step && !v.queue.length) v.arriving = false;
      return;
    }
    v.setPose('stand');
  }

  // =================================================================== hidden tab

  /** Advances everything instantly to the destinations (used when coming back from a hidden tab). */
  fastForward(now: number): void {
    this.now = now;
    this.pets.fastForward(now);
    // extras: what they were going to do happens (the pizza stays on the table) and they're already gone
    for (const e of this.extras) {
      for (const s of [e.step, ...e.queue]) if (s?.t === 'do') s.fn();
      e.gone = true;
    }
    // the tea stall starts over (the seller walks in again, if it's open)
    this.teaUp = false;
    this.tea.clear();
    // so does the bánh mì cart (pushed in again, if it's still breakfast time)
    this.banhmiUp = false;
    this.banhmi.clear();
    for (const room of this.rooms.values()) {
      if (room.phase === 'building') room.setPhase('ready', now - 10_000);
      if (room.phase === 'dismantling') room.setPhase('gone', now);
      room.lightAt = now - 10_000;
    }
    this.updateRooms(now);
    for (const e of this.elevators) e.reset();
    this.machineUntil.clear();
    this.social.reset(now);
    for (const ch of [...this.chars.values()]) {
      for (let guard = 0; guard < 60 && !ch.gone; guard++) {
        if (!ch.step) ch.step = ch.queue.shift() ?? null;
        if (!ch.step) break;
        this.finishStep(ch, ch.step, now);
        ch.step = null;
      }
      ch.gathering = null;
      ch.outdoors = null;
      if (ch.leaving && !ch.gone) ch.gone = true;
      if (ch.gone) {
        this.spots.releaseAll(ch.id);
        this.chars.delete(ch.id);
        continue;
      }
      ch.alpha = 1;
      ch.inside = false;
      ch.arriving = false;
      ch.hiddenUntil = 0;
      ch.stepT = 0;
      if (ch.mode === 'work' || ch.mode === 'wait' || ch.mode === 'idle' || ch.mode === 'shell') {
        ch.reactUntil = 0;
        this.assignHome(ch);
        const home = this.spots.get(ch.homeSpot);
        if (home) {
          this.snapTo(ch, home);
          ch.standTile = null;
        } else {
          ch.atSpot = null;
          ch.seated = false;
          ch.sortY = null;
          this.placeOverflow(ch);
        }
        this.releaseTemp(ch);
        ch.nextOutingAt = now + idleSitMs(ch.rng, this.options().liveliness);
      }
    }
    for (const room of this.rooms.values()) {
      if (room.present && this.occupants(room) > 0) room.setLight(true, now - 10_000);
      room.switchClaim = null;
    }
    this.stallBusy.clear();
    // the visitor finishes what they were doing: reaches the hall or, if leaving, enters the elevator (and the exit happens)
    const v = this.visitor;
    if (v) {
      for (let guard = 0; guard < 10; guard++) {
        if (!v.step) v.step = v.queue.shift() ?? null;
        if (!v.step) break;
        const s = v.step;
        v.step = null;
        if (s.t === 'elevIn') {
          v.inside = true;
          v.alpha = 0;
        } else this.finishStep(v, s, now);
      }
      if (!v.leaving) {
        v.alpha = 1;
        v.inside = false;
        v.arriving = false;
        v.hiddenUntil = 0;
        v.setPose('stand');
      }
    }
    if (this.visit) this.applyVisitLight(now);
  }

  private finishStep(ch: Character, s: Step, now: number): void {
    switch (s.t) {
      case 'go':
        ch.placeAtTile(s.tx, s.ty);
        if (s.fx !== undefined && s.fy !== undefined) {
          ch.x = s.fx;
          ch.y = s.fy;
        }
        if (s.dir) ch.dir = s.dir;
        break;
      case 'route':
        if (s.pts.length >= 2) {
          ch.x = s.pts[s.pts.length - 2];
          ch.y = s.pts[s.pts.length - 1];
        }
        if (s.trail === 'back') this.backIndoors(ch);
        break;
      case 'enter': {
        const spot = this.spots.get(s.spot);
        if (spot) this.snapTo(ch, spot);
        break;
      }
      case 'exit':
        if (ch.atSpot) {
          const spot = this.spots.get(ch.atSpot);
          if (spot) ch.placeAtTile(spot.tx, spot.ty);
        }
        ch.atSpot = null;
        ch.seated = false;
        ch.sortY = null;
        break;
      case 'switch': {
        const room = this.rooms.get(s.room);
        if (room && (!s.onlyIfLast || isLastInRoom(room.id, ch.id, this.chars.values()))) room.setLight(s.on, now - 10_000);
        break;
      }
      case 'stall': {
        const spot = this.spots.get(s.spot);
        if (spot) ch.placeAtTile(spot.tx, spot.ty);
        break;
      }
      case 'elevOut': {
        const el = this.elevators[s.elev] ?? this.elevators[0];
        const spot = this.spots.get(el.spotId);
        if (spot) ch.placeAtTile(spot.tx, spot.ty);
        break;
      }
      case 'do':
        s.fn();
        break;
      case 'bike':
        this.bikeParked.delete(ch.id);
        ch.alpha = 1;
        ch.inside = false;
        break;
      case 'remove':
      case 'elevIn':
        ch.gone = true;
        break;
      default:
        break;
    }
  }
}
