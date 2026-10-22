// Per-frame world drawing: outdoor layer -> floors -> walls/wall items -> entities
// sorted by depth -> light/darkness -> icons. The screen-space pass (crisp
// text) lives in overlay.ts.
import { TILE, type Appearance, type ArtModule, type CharacterFrameRequest, type IconName, type ScreenMode, type Sprite } from '../../art/api';
import { tetDay, type SeasonalTheme, type WorldOptions } from '../api';
import type { WorldAssets } from '../assets';
import type { Camera } from '../camera';
import { BUILDING_H, COL_W, CORE_COLS, CORRIDOR_Y } from '../constants';
import { layoutExterior, slotShell, type ExteriorLayout, type SlotShell } from '../layout/exterior';
import { slotAt } from '../layout/geometry';
import type { ExteriorProp } from '../layout/types';
import { screenModeFor } from '../sim/behavior';
import type { Character } from '../sim/character';
import type { RoomState } from '../sim/room-state';
import { cobwebScale, hourglassIcon, HOURGLASS_FLIP_MS, STORM_LIFT } from '../sim/shell';
import type { Sim } from '../sim/sim';
import { banhmiCartProps } from '../sim/banhmi';
import { teaStallProps } from '../sim/tea';
import { buildAnim, furnitureScale, NO_ANIM, sweepDelay, type BuildAnim } from './anim';
import { daylightModeOf, parseHourParam } from './daylight';
import { RoomFxRenderer } from './github-fx';
import { Lighting } from './lighting';
import { Particles } from './particles';
import { BIKE_RACK, BIKE_SEATS, carSprite, cargoSprite, motorbikeSprites, propSprite, shadowSprite } from './props';
import { petSprite, workTreeSprite } from './pets';
import { drawDisco } from './disco';
import { dockSprite, drawCountdown, drawFireworks, pizzaBoxSprite, robotSprite } from './fun';
import { tr } from '../../../../shared/i18n';
import { ALTAR_INCENSE, ALTAR_LAMPS } from '../../art/furniture/common';
import { drawWeather, drawWeatherWindow, weatherFor, type Weather } from './weather';
import { reducedMotion } from './github-fx';
import type { Pet } from '../sim/pets';
import { SIESTA_DIM } from '../sim/siesta';
import { FLOODED, PARKING, Traffic, type StreetDay, type TrafficEnv, type Vehicle } from '../sim/traffic';
import { countBadge, fallbackIcon } from './shell-sprites';
import { decorateElevator, drawSeasonalLights, drawSeasonalWindow, seasonalCostume, seasonalFurniture } from './seasonal';
import { buildAreaVis, furnitureSprites, opaqueBounds, paintShell, toWallVis, WALL_MARGIN, wallItemOrigin, wallSprites, type AreaVis, type FurnVis, type WallVis } from './scene';

const enum K {
  FurnBase,
  FurnFront,
  Char,
  Prop,
  Car,
  Pet,
  Ball,
  Robot,
}

interface Ent {
  k: K;
  y: number;
  ref: FurnVis | Character | ExteriorProp | Vehicle | Pet | null;
  area: AreaVis | null;
  scale: number;
}


/** Head position (world px) of each character drawn this frame. */
export interface HeadInfo {
  x: number;
  y: number;
  feetY: number;
  visible: boolean;
  /** Sprite rectangle (world px) for hit-testing. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  depth: number;
}

const TV_MODES: ScreenMode[] = ['browser', 'idle', 'chat', 'code'];
/**
 * Popcorn bucket mouth (px relative to the feet) in the seated 'wait' pose, per direction — follows the art's
 * rig: hugged to the chest from the front, beside the hip from behind, on the lap in profile.
 */
const POPCORN_DX: Readonly<Record<string, number>> = { down: 0, up: -9, left: -5, right: 5 };
const POPCORN_DY: Readonly<Record<string, number>> = { down: 11, up: 8, left: 9, right: 9 };
/** Web next to a neighbor: at most this many px outside the body. */
const WEB_MAX_OUT = 9;
const NO_VEHICLES: readonly Vehicle[] = [];
/** Motorbike helmets (the art's cap, recolored). */
const HELMETS = ['#e8454a', '#f2c94c', '#3d7ce0', '#f4f4f0', '#e98ad0', '#4cbf7a', '#2e3648', '#f08a3c'];
/** Raincoat plastics: the colors you see on any rainy street. */
const PONCHOS: readonly [string, string, string][] = [
  ['#3d7ce0', '#2a589f', '#8fbdf2'],
  ['#e8454a', '#a83136', '#f59a9d'],
  ['#f2c94c', '#b8922a', '#fae49a'],
  ['#4cbf7a', '#348a56', '#9ae0b6'],
  ['#e98ad0', '#b05e9a', '#f6c4e9'],
  ['#9b6bd1', '#6f4b9b', '#c8aaec'],
  ['#5bc8d6', '#3a929e', '#a8e6ee'],
];
/** A standing character's neck, this far above the feet (px): where the poncho of someone walking starts. */
const PONCHO_STANDING = 19;
/** A seated character's anchor sits this far above where the bike's wheels touch the ground (px). */
const RIDER_LIFT = 9;
/** Tone of the outdoor area edges (vignette) and of the lawn beyond it. */
const VIGNETTE_ALPHA = 0.2;
const VIGNETTE_EDGE = `rgba(18,40,26,${VIGNETTE_ALPHA})`;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly areas = new Map<string, AreaVis>();
  readonly heads = new Map<string, HeadInfo>();
  /** Rectangle (world px) of each pet drawn this frame, for the petting click. */
  readonly petBoxes = new Map<string, { x: number; y: number; w: number; h: number; feetY: number }>();
  exterior: ExteriorLayout;
  shells: SlotShell[] = [];
  shellWindows: WallVis[] = [];
  private base: HTMLCanvasElement | null = null;
  private baseX = 0;
  private baseY = 0;
  private baseCols = -1;
  private layoutVersion = -1;
  private assetsVersion = 0;
  private builtAssetsVersion = 0;
  /** Street traffic: cars, and the motorbikes of rush hour. */
  readonly traffic = new Traffic();
  /** Motorbike riders' looks, by vehicle variant. */
  private riders = new Map<number, Appearance[]>();
  /** Looks of the agents riding (or owning a parked) bike, by character id. */
  private owners = new Map<string, Appearance>();
  private xeOmFor: ExteriorLayout | null = null;
  private xeOmList: Vehicle[] = [];
  private ents: Ent[] = [];
  private pool: Ent[] = [];
  private date = new Date();
  private icons: { x: number; y: number; name: IconName; bounce: number; alpha: number; badge: number }[] = [];
  /** Popcorn, confetti and rain (fixed pool). */
  readonly particles = new Particles();
  /** Room party and alarm (GitHub events). */
  private readonly roomFx = new RoomFxRenderer();
  /** Current frame dt (s), for particles emitted during drawing. */
  private dt = 0;
  private iconCount = 0;
  private elevatorVis: WallVis[] = [];
  private occupiedSlots = new Set<number>();
  /** Forced hour (?hora=21:30 in the URL or debug) or null for local time. */
  hourOverride: number | null = parseHourParam(typeof location === 'undefined' ? '' : location.search);
  /** Weather outside: null = the day's (weatherFor); debug.setWeather pins it. */
  weatherOverride: Weather | null = null;
  /** Weather outside right now (the day's or the pinned one); also read by the sound cues. */
  weather: Weather = 'clear';
  private hourNow = 12;
  /** Time-of-day clock (sky, lighting, wall clock); the timelapse swaps it for the replayed instant. */
  clock: () => number = () => Date.now();
  /** Day/night cycle: light map and glows. */
  readonly lighting: Lighting;
  assets: WorldAssets | null = null;
  /** Last applied night factor (used by the overlay). */
  night = 0;
  private clearColor = '#7fae62';
  private grass: CanvasPattern | null = null;
  private theme: SeasonalTheme = 'none';

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly art: ArtModule,
    private readonly sim: Sim,
    private readonly camera: Camera,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.exterior = layoutExterior(sim.building.cols);
    this.lighting = new Lighting(art, sim);
    // the street is drawn: agents may come and go by motorbike
    sim.bikes = true;
  }

  setAssets(a: WorldAssets | null): void {
    this.assets = a;
    this.assetsVersion++;
  }

  // =================================================================== sync with the simulation

  /** Keeps caches and visuals consistent with the current building. */
  sync(theme: SeasonalTheme = 'none'): void {
    const sim = this.sim;
    const themeChanged = theme !== this.theme;
    this.theme = theme;
    const assetsChanged = this.builtAssetsVersion !== this.assetsVersion || themeChanged;
    if (this.baseCols !== sim.building.cols || assetsChanged) this.buildBase();
    if (this.layoutVersion !== sim.layoutVersion || assetsChanged) {
      this.layoutVersion = sim.layoutVersion;
      const want = new Set<string>();
      for (const a of [...sim.building.core, sim.building.corridor]) {
        want.add(a.id);
        const cur = this.areas.get(a.id);
        if (!cur || cur.layout !== a || assetsChanged) this.areas.set(a.id, buildAreaVis(this.art, a, undefined, this.assets, theme));
      }
      for (const room of sim.rooms.values()) {
        if (!room.present) continue;
        want.add(room.id);
      }
      for (const id of [...this.areas.keys()]) if (!want.has(id)) this.areas.delete(id);
      this.elevatorVis = this.areas.get('core:recepcao')?.wallItems.filter((w) => w.kind === 'elevator') ?? [];
    }
    // rooms: (re)builds when they appear, change layout or version (name/theme)
    this.occupiedSlots.clear();
    for (const room of sim.rooms.values()) {
      if (!room.present) continue;
      this.occupiedSlots.add(room.slot);
      const cur = this.areas.get(room.id);
      if (!cur || cur.layout !== room.layout || cur.version !== room.version || assetsChanged) {
        this.areas.set(room.id, buildAreaVis(this.art, room.layout, room, this.assets, theme));
      } else cur.room = room;
    }
    for (const [id, vis] of this.areas) if (vis.room && !vis.room.present) this.areas.delete(id);
    this.builtAssetsVersion = this.assetsVersion;
  }

  /** Base layer: outdoor area, slot patios and corridor closures. */
  private buildBase(): void {
    const cols = this.sim.building.cols;
    this.baseCols = cols;
    this.exterior = layoutExterior(cols);
    const b = this.exterior.bounds;
    this.baseX = b.x * TILE;
    this.baseY = b.y * TILE;
    const c = document.createElement('canvas');
    c.width = b.w * TILE;
    c.height = b.h * TILE;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-this.baseX, -this.baseY);
    paintShell(this.art, ctx, this.exterior.floors, []);
    // street lanes
    const ly = this.exterior.streetY + Math.round(this.exterior.streetH / 2) - 1;
    ctx.fillStyle = 'rgba(255,236,170,0.75)';
    for (let x = this.baseX + 4; x < this.baseX + c.width; x += 24) ctx.fillRect(x, ly, 12, 2);
    this.shells = [];
    this.shellWindows = [];
    for (let col = CORE_COLS; col < cols; col++) {
      for (const side of ['north', 'south'] as const) {
        const sh = slotShell(slotAt(col, side), col === cols - 1);
        this.shells.push(sh);
        paintShell(this.art, ctx, sh.floors, sh.walls);
        for (const w of sh.windows) this.shellWindows.push(toWallVis(w, `shell:${sh.slot}`));
      }
    }
    this.desaturate(ctx);
    // background beyond the drawn area: the grass itself (2x2 mirrored sample, seamless), already in the
    // vignette edge tone
    const s = 4 * TILE;
    try {
      const tile = document.createElement('canvas');
      tile.width = 2 * s;
      tile.height = 2 * s;
      const tctx = tile.getContext('2d')!;
      tctx.imageSmoothingEnabled = false;
      for (const [mx, my] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        tctx.setTransform(mx ? -1 : 1, 0, 0, my ? -1 : 1, mx ? 2 * s : 0, my ? 2 * s : 0);
        tctx.drawImage(c, 0, 0, s, s, 0, 0, s, s);
      }
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      // sample average: smooths the big patches (which turn into stripes when repeated), keeps the grass blades
      const d = tctx.getImageData(0, 0, 2 * s, 2 * s).data;
      let r = 0;
      let g = 0;
      let bl = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        bl += d[i + 2];
      }
      const n = d.length / 4;
      const avg = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(bl / n)})`;
      tctx.globalAlpha = 0.6;
      tctx.fillStyle = avg;
      tctx.fillRect(0, 0, 2 * s, 2 * s);
      tctx.globalAlpha = 1;
      tctx.fillStyle = VIGNETTE_EDGE;
      tctx.fillRect(0, 0, 2 * s, 2 * s);
      this.grass = this.ctx.createPattern(tile, 'repeat');
      // background color (before the pattern loads): the average already with the vignette tone
      const k = VIGNETTE_ALPHA;
      this.clearColor = `rgb(${Math.round((r / n) * (1 - k) + 18 * k)},${Math.round((g / n) * (1 - k) + 40 * k)},${Math.round((bl / n) * (1 - k) + 26 * k)})`;
    } catch {
      this.grass = null;
      this.clearColor = '#6f9a5a';
    }
    this.finishBase(ctx, cols);
    this.base = c;
  }

  /** Grass ~15% less saturated: the lawn doesn't compete with the office. */
  private desaturate(ctx: CanvasRenderingContext2D): void {
    const b = this.exterior.bounds;
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,0.16)';
      ctx.fillRect(b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE);
    } catch {
      // browser without the blend mode: proceeds without desaturating
    }
    ctx.restore();
  }

  /** Outdoor layer finishing: slightly darker edges (vignette) and the entrance doormat. */
  private finishBase(ctx: CanvasRenderingContext2D, cols: number): void {
    const b = this.exterior.bounds;
    const x0 = b.x * TILE;
    const y0 = b.y * TILE;
    const w = b.w * TILE;
    const h = b.h * TILE;
    ctx.save();
    // vignette: darkens with distance from the building and reaches the "outside" grass tone exactly at the
    // edge of the drawn area (1 px per tile mask, scaled up with smoothing)
    const bwT = cols * COL_W;
    const smooth = (a: number, z: number, v: number) => {
      const t = Math.max(0, Math.min(1, (v - a) / Math.max(1e-6, z - a)));
      return t * t * (3 - 2 * t);
    };
    try {
      const m = document.createElement('canvas');
      m.width = b.w;
      m.height = b.h;
      const mctx = m.getContext('2d')!;
      const img = mctx.createImageData(b.w, b.h);
      for (let ty = 0; ty < b.h; ty++) {
        for (let tx = 0; tx < b.w; tx++) {
          const wx = b.x + tx + 0.5;
          const wy = b.y + ty + 0.5;
          const fx = wx < 0 ? smooth(6, -b.x, -wx) : wx > bwT ? smooth(6, b.x + b.w - bwT, wx - bwT) : 0;
          const fy = wy < 0 ? smooth(5, -b.y, -wy) : wy > BUILDING_H ? smooth(12, b.y + b.h - BUILDING_H, wy - BUILDING_H) : 0;
          const i = (ty * b.w + tx) * 4;
          img.data[i] = 18;
          img.data[i + 1] = 40;
          img.data[i + 2] = 26;
          img.data[i + 3] = Math.round(Math.max(fx, fy) * VIGNETTE_ALPHA * 255);
        }
      }
      mctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(m, x0, y0, w, h);
      ctx.imageSmoothingEnabled = false;
    } catch {
      // no vignette
    }
    // doormat in front of the entrance glass facade (west of the corridor)
    const my = (CORRIDOR_Y + 1.25) * TILE;
    ctx.fillStyle = '#3f4652';
    ctx.fillRect(-1.75 * TILE, my, 1.5 * TILE, 2.5 * TILE);
    ctx.fillStyle = '#596170';
    ctx.fillRect(-1.75 * TILE + 2, my + 2, 1.5 * TILE - 4, 2.5 * TILE - 4);
    ctx.fillStyle = '#4b525f';
    for (let y = my + 4; y < my + 2.5 * TILE - 4; y += 3) ctx.fillRect(-1.75 * TILE + 3, y, 1.5 * TILE - 6, 1);
    ctx.restore();
  }

  // =================================================================== frame

  frame(now: number, dt: number, opts: WorldOptions, sel: { agent: string | null; room: string | null; hover: string | null }): void {
    const { ctx, camera } = this;
    this.date.setTime(this.clock());
    this.dt = dt;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.clearColor;
    ctx.fillRect(0, 0, W, H);
    const { scale, ox, oy } = camera.transform();
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    const vx0 = -ox / scale;
    const vy0 = -oy / scale;
    const vx1 = vx0 + W / scale;
    const vy1 = vy0 + H / scale;
    if (this.grass && this.base) {
      const bx1 = this.baseX + this.base.width;
      const by1 = this.baseY + this.base.height;
      if (vx0 < this.baseX || vy0 < this.baseY || vx1 > bx1 || vy1 > by1) {
        // pattern anchored at the world origin (multiple of the tile), aligned with the base layer
        ctx.fillStyle = this.grass;
        ctx.save();
        ctx.translate(this.baseX, this.baseY);
        ctx.fillRect(vx0 - this.baseX - 1, vy0 - this.baseY - 1, vx1 - vx0 + 2, vy1 - vy0 + 2);
        ctx.restore();
      }
    }
    const visible = (x: number, y: number, w: number, h: number) => x < vx1 && x + w > vx0 && y < vy1 && y + h > vy0;

    // ---- base layer (visible part only)
    if (this.base) {
      const sx = Math.max(0, Math.floor(vx0 - this.baseX) - 1);
      const sy = Math.max(0, Math.floor(vy0 - this.baseY) - 1);
      const sw = Math.min(this.base.width - sx, Math.ceil(vx1 - vx0) + 3);
      const sh = Math.min(this.base.height - sy, Math.ceil(vy1 - vy0) + 3);
      if (sw > 0 && sh > 0) ctx.drawImage(this.base, sx, sy, sw, sh, this.baseX + sx, this.baseY + sy, sw, sh);
    }
    // day/night cycle hour (preference or forced hour; the wall clock follows the forced one)
    if (this.hourOverride !== null) {
      const min = Math.round(this.hourOverride * 60);
      this.date.setHours(Math.floor(min / 60) % 24, min % 60);
    }
    this.updateCars(now, dt);
    if (this.traffic.flood > 0.02) this.drawFlood(now, vx0, vy0, vx1, vy1);
    const hour = this.lighting.update(now, daylightModeOf(opts), this.hourOverride, this.date);
    this.weather = this.weatherOverride ?? weatherFor(this.date);
    this.hourNow = hour;
    const t = now;

    // facade windows in empty slots
    for (const w of this.shellWindows) {
      const slot = Number(w.areaId.slice(6));
      const room = this.roomInSlot(slot);
      if (room && room.phase === 'ready') continue;
      if (!visible(w.cx - 24, w.baseY - 40, 48, 44)) continue;
      this.drawWindow(w, hour, t, 1);
    }

    // ---- areas: floor, walls and wall items
    for (const vis of this.areas.values()) {
      const p = vis.px;
      if (!visible(p.x, p.y - WALL_MARGIN, p.w, p.h + WALL_MARGIN)) continue;
      const anim = vis.room ? buildAnim(vis.room.phase, vis.room.progress(now)) : NO_ANIM;
      this.drawFloor(vis, anim);
    }
    for (const vis of this.areas.values()) {
      const p = vis.px;
      if (!visible(p.x, p.y - WALL_MARGIN, p.w, p.h + WALL_MARGIN)) continue;
      const anim = vis.room ? buildAnim(vis.room.phase, vis.room.progress(now)) : NO_ANIM;
      this.drawWalls(vis, anim, now, hour);
    }
    const view = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
    // CI alarm: red tone on the floor (under furniture and characters)
    this.roomFx.drawFloor(ctx, this.sim, now, view);

    // ---- entities sorted by depth
    const ents = this.ents;
    ents.length = 0;
    let used = 0;
    const push = (k: K, y: number, ref: Ent['ref'], area: AreaVis | null, scale: number) => {
      let e = this.pool[used];
      if (!e) this.pool[used] = e = { k, y, ref, area, scale };
      else {
        e.k = k;
        e.y = y;
        e.ref = ref;
        e.area = area;
        e.scale = scale;
      }
      used++;
      ents.push(e);
    };
    for (const vis of this.areas.values()) {
      const p = vis.px;
      if (!visible(p.x - TILE, p.y - 3 * TILE, p.w + 2 * TILE, p.h + 4 * TILE)) continue;
      const anim = vis.room ? buildAnim(vis.room.phase, vis.room.progress(now)) : NO_ANIM;
      for (const f of vis.furniture) {
        const s = anim.mode === 'none' ? 1 : furnitureScale(anim, f.order);
        if (s <= 0.01) continue;
        if (!visible(f.ax - 3 * TILE, f.ay - 4 * TILE, 6 * TILE, 4 * TILE + 4)) continue;
        push(K.FurnBase, f.ay, f, vis, s);
        const fs = furnitureSprites(this.art, f, this.furnState(f, now));
        if (fs?.front) push(K.FurnFront, f.ay + 0.5, f, vis, s);
      }
    }
    // the agents and, in the visit, the visitor
    for (const ch of this.sim.people()) {
      const head = this.headOf(ch);
      head.visible = false;
      if (ch.inside || ch.alpha <= 0.01 || now < ch.hiddenUntil) continue;
      if (!visible(ch.x - 24, ch.y - 48, 48, 56)) {
        head.x = ch.x;
        head.y = ch.y - 26;
        head.feetY = ch.y;
        continue;
      }
      push(K.Char, ch.depth(), ch, null, 1);
    }
    for (const prop of this.exterior.props) {
      if (!visible(prop.x - 24, prop.y - 56, 48, 60)) continue;
      let alpha = 1;
      if (prop.whenRoom !== undefined) {
        // e.g. hedge in front of the garden path — appears together with the room
        const room = this.roomInSlot(prop.whenRoom);
        if (!room) continue;
        if (room.phase === 'building' || room.phase === 'dismantling') {
          const pr = room.progress(now);
          alpha = room.phase === 'building' ? Math.min(1, pr * 3) : 1 - Math.min(1, Math.max(0, (pr - 0.75) * 4));
          if (alpha <= 0.02) continue;
        }
      }
      push(K.Prop, prop.y, prop, null, alpha);
    }
    for (const sh of this.shells) {
      const room = this.roomInSlot(sh.slot);
      let alpha = 1;
      if (room) {
        if (room.phase !== 'building' && room.phase !== 'dismantling') continue;
        const pr = room.progress(now);
        alpha = room.phase === 'building' ? 1 - Math.min(1, pr * 3) : Math.min(1, Math.max(0, (pr - 0.75) * 4));
        if (alpha <= 0.02) continue;
      }
      for (const prop of sh.props) {
        if (!visible(prop.x - 24, prop.y - 56, 48, 60)) continue;
        push(K.Prop, prop.y, prop, null, alpha);
      }
    }
    // iced tea stall on the sidewalk: set up while the seller is there, stools stacked otherwise
    for (const prop of teaStallProps(this.sim.teaUp)) if (visible(prop.x - 24, prop.y - 32, 48, 36)) push(K.Prop, prop.y, prop, null, 1);
    // morning bánh mì cart: rides along with the vendor, parked east of the tea stall
    for (const prop of banhmiCartProps(this.sim.banhmiCart())) if (visible(prop.x - 24, prop.y - 36, 48, 40)) push(K.Prop, prop.y, prop, null, 1);
    for (const car of this.traffic.vehicles) if (visible(car.x - 32, car.y - 36, 64, 40)) push(K.Car, car.y, car, null, 1);
    for (const car of this.xeOm()) if (visible(car.x - 24, car.y - 28, 48, 32)) push(K.Car, car.y, car, null, 1);
    this.petBoxes.clear();
    for (const pet of this.sim.pets.pets) if (visible(pet.x - 16, pet.y - 20, 32, 24)) push(K.Pet, pet.depth(), pet, null, 1);
    const robot = this.sim.pets.robot;
    if (robot.dockTile && visible(robot.x - 16, robot.y - 16, 32, 24)) push(K.Robot, robot.y, null, null, 1);
    const ball = this.sim.pets.ball;
    // the ball in the dog's mouth goes with it (drawn right after); on the ground, by its own height
    if (ball) push(K.Ball, ball.carried ? ball.y + 6.5 : ball.y, null, null, 1);
    ents.sort((a, b) => a.y - b.y || a.k - b.k);

    this.iconCount = 0;
    for (const e of ents) {
      switch (e.k) {
        case K.FurnBase:
          this.drawFurniture(e.ref as FurnVis, e.area!, e.scale, false, now);
          break;
        case K.FurnFront:
          this.drawFurniture(e.ref as FurnVis, e.area!, e.scale, true, now);
          break;
        case K.Char:
          this.drawCharacter(e.ref as Character, now, sel);
          break;
        case K.Prop:
          this.drawProp(e.ref as ExteriorProp, e.scale);
          break;
        case K.Car:
          this.drawCar(e.ref as Vehicle);
          break;
        case K.Pet:
          this.drawPet(e.ref as Pet, now);
          break;
        case K.Ball:
          this.drawBall(now);
          break;
        case K.Robot:
          this.drawRobot();
          break;
      }
    }
    this.drawPingPong(now);
    // weather outside (rain, wind, birds), only outside the building
    drawWeather(ctx, this.weather, { x: vx0, y: vy0, w: vx1 - vx0, h: vy1 - vy0 }, { x: 0, y: 0, w: this.sim.building.cols * COL_W * TILE, h: BUILDING_H * TILE }, now, this.hourNow, reducedMotion());
    // ---- shell wait: spider webs, confetti/popcorn/rain (over the entities)
    this.drawCobwebs(now);
    this.drainEffects(now);
    this.roomFx.emit(this.particles, this.sim, now, dt, view);
    this.particles.update(dt);
    this.particles.draw(ctx, vx0, vy0, vx1, vy1, now);

    // ---- light: night, dark rooms, glows
    this.night = this.lighting.night;
    this.drawLighting(now, vx0, vy0, vx1, vy1);
    if (this.theme !== 'none') {
      for (const vis of this.areas.values()) {
        if (vis.room && vis.room.phase !== 'ready') continue;
        if (!visible(vis.px.x, vis.px.y, vis.px.w, vis.px.h)) continue;
        drawSeasonalLights(ctx, this.theme, vis.layout, vis.room ? vis.room.light(now) : 1);
      }
    }
    // New Year: the fireworks and the scoreboard glow over the night
    const bRect = { x: 0, y: 0, w: this.sim.building.cols * COL_W * TILE, h: BUILDING_H * TILE };
    if (this.sim.newYear.phase === 'party') drawFireworks(ctx, { x: vx0, y: vy0, w: vx1 - vx0, h: vy1 - vy0 }, bRect, now);
    else if (this.sim.newYear.phase === 'countdown') drawCountdown(ctx, bRect, this.sim.newYear.secondsLeft, this.sim.newYear.lunar ? tr('Lunar New Year in') : tr('New Year in'));
    // disco (type "disco"): nightclub in every room in view
    const disco = this.sim.discoLevel(now);
    if (disco > 0) {
      const lit: { x: number; y: number; w: number; h: number }[] = [];
      for (const vis of this.areas.values()) {
        if (vis.room && vis.room.phase !== 'ready') continue;
        if (visible(vis.px.x, vis.px.y, vis.px.w, vis.px.h)) lit.push(vis.px);
      }
      drawDisco(ctx, lit, now, disco, reducedMotion());
    }
    // CI alarm beacon and "!" bubble (also glow in the dark)
    this.roomFx.drawLights(ctx, this.sim, this.heads, now, view);

    // ---- icons over the heads (over the darkness)
    for (let i = 0; i < this.iconCount; i++) {
      const ic = this.icons[i];
      const s = this.icon(ic.name);
      if (!s) continue;
      ctx.globalAlpha = ic.alpha;
      const ix = Math.round(ic.x - s.ax);
      const iy = Math.round(ic.y - s.ay - ic.bounce);
      ctx.drawImage(s.canvas, ix, iy);
      if (ic.badge > 1) {
        // "×N": more than one shell running
        const b = countBadge(ic.badge);
        ctx.drawImage(b.canvas, ix + s.canvas.width - 1, iy + s.canvas.height - b.ay + 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private headOf(ch: Character): HeadInfo {
    let h = this.heads.get(ch.id);
    if (!h) this.heads.set(ch.id, (h = { x: 0, y: 0, feetY: 0, visible: false, bx: 0, by: 0, bw: 0, bh: 0, depth: 0 }));
    return h;
  }

  /** Removes entries of characters that have already left. */
  pruneHeads(): void {
    for (const id of this.heads.keys()) if (!this.sim.person(id)) this.heads.delete(id);
  }

  roomInSlot(slot: number): RoomState | undefined {
    if (!this.occupiedSlots.has(slot)) return undefined;
    for (const r of this.sim.rooms.values()) if (r.slot === slot && r.present) return r;
    return undefined;
  }

  // =================================================================== areas

  private drawFloor(vis: AreaVis, anim: BuildAnim): void {
    const { ctx } = this;
    const p = vis.px;
    if (anim.floor >= 1) {
      ctx.drawImage(vis.floor, p.x, p.y);
      return;
    }
    if (anim.floor <= 0) return;
    // sweep: tiles appear diagonally (and vanish in reverse order on teardown)
    const w = vis.layout.rect.w;
    const h = vis.layout.rect.h;
    const k = anim.floor * 1.06;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (sweepDelay(i, j, w, h) > k) continue;
        ctx.drawImage(vis.floor, i * TILE, j * TILE, TILE, TILE, p.x + i * TILE, p.y + j * TILE, TILE, TILE);
      }
    }
  }

  private drawWalls(vis: AreaVis, anim: BuildAnim, now: number, hour: number): void {
    const { ctx } = this;
    const p = vis.px;
    if (anim.walls <= 0) return;
    const rise = Math.round((1 - anim.walls) * 10);
    if (anim.walls < 1) ctx.globalAlpha = anim.walls;
    ctx.drawImage(vis.walls, p.x, p.y - WALL_MARGIN + rise);
    // dynamic wall items
    for (const w of vis.wallItems) this.drawWallItem(vis, w, now, hour, rise);
    ctx.globalAlpha = 1;
    if (vis.sign && anim.sign > 0) {
      const slide = Math.round((1 - anim.sign) * -18);
      ctx.globalAlpha = anim.sign;
      this.drawSign(vis, vis.sign, slide);
      ctx.globalAlpha = 1;
    }
  }

  private drawWallItem(vis: AreaVis, w: WallVis, now: number, hour: number, rise: number): void {
    const { ctx } = this;
    switch (w.kind) {
      case 'window':
        this.drawWindow(w, hour, now, 1, rise);
        return;
      case 'elevator': {
        const idx = this.elevatorVis.indexOf(w);
        const state = this.sim.elevators[idx]?.state ?? 0;
        const s = wallSprites(this.art, 'elevator', w.variant, state, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        decorateElevator(ctx, this.theme, w.cx, w.baseY + rise);
        return;
      }
      case 'light_switch': {
        const on = vis.room ? vis.room.lightOn : true;
        const s = wallSprites(this.art, 'light_switch', on ? 'on' : 'off', 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        return;
      }
      case 'clock': {
        const s = wallSprites(this.art, 'clock', w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        const r = s.base.rects?.face;
        if (r) this.safe(() => this.art.drawClock(ctx, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, this.date));
        return;
      }
      case 'whiteboard': {
        const s = wallSprites(this.art, 'whiteboard', w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        const r = s.base.rects?.board;
        if (r) this.safe(() => this.art.drawBoard(ctx, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, vis.room?.board ?? [], now));
        return;
      }
      case 'tv': {
        const s = wallSprites(this.art, 'tv', w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        const r = s.base.rects?.tv;
        // playing on the lounge TV: the chosen show (soccer, soap opera, cartoon) or the video game
        const live = this.sim.social.tvScreen();
        const mode = live ? live.mode : TV_MODES[Math.floor(now / 9000) % TV_MODES.length];
        const seed = live ? live.seed : w.seed;
        if (r) this.safe(() => this.art.drawScreen(ctx, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, mode, now, seed));
        return;
      }
      case 'mirror': {
        const s = wallSprites(this.art, 'mirror', w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        const r = s.base.rects?.glass;
        if (r) this.drawReflection(w, o.x + r.x, o.y + rise + r.y, r.w, r.h);
        return;
      }
      default: {
        const s = wallSprites(this.art, w.kind, w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
      }
    }
  }

  private drawWindow(w: WallVis, hour: number, now: number, alpha: number, rise = 0): void {
    const { ctx } = this;
    const s = wallSprites(this.art, 'window', w.variant, 0, w.seed);
    if (!s) return;
    const o = wallItemOrigin(w, s.base);
    let r = s.base.rects?.glass;
    if (!r) {
      const b = opaqueBounds(s.base.canvas);
      r = { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 };
    }
    ctx.globalAlpha *= alpha;
    this.safe(() => this.art.drawWindowView(ctx, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, hour, now, w.seed));
    drawSeasonalWindow(ctx, this.theme, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, now, w.seed);
    drawWeatherWindow(ctx, this.weather, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, now, w.seed, reducedMotion());
    ctx.drawImage(s.base.canvas, o.x, o.y + rise);
  }

  /** Name sign (the crisp text is written by the overlay in screen space). */
  private drawSign(vis: AreaVis, w: WallVis, slide: number): void {
    const { ctx } = this;
    if (!vis.room && this.assets?.signage && vis.id === 'core:recepcao') {
      const a = this.assets.signage;
      const maxW = 5 * TILE;
      const maxH = 24;
      // integer scale (crisp pixels) whenever it fits
      const fit = Math.min(maxW / a.w, maxH / a.h);
      const k = fit >= 1 ? Math.floor(fit) : fit;
      const dw = Math.round(a.w * k);
      const dh = Math.round(a.h * k);
      ctx.save();
      ctx.imageSmoothingEnabled = k < 1;
      ctx.drawImage(a.img, Math.round(w.cx - dw / 2), Math.round(w.baseY - 8 - dh) + slide, dw, dh);
      ctx.restore();
      return;
    }
    const s = wallSprites(this.art, 'sign', w.variant, 0, w.seed);
    if (!s) return;
    const o = wallItemOrigin(w, s.base);
    ctx.drawImage(s.base.canvas, o.x, o.y + slide);
  }

  /** Rectangle (world px) of an area's sign text region, if any. */
  signRect(vis: AreaVis): { x: number; y: number; w: number; h: number } | null {
    if (!vis.sign) return null;
    if (!vis.room && this.assets?.signage && vis.id === 'core:recepcao') return null;
    const s = wallSprites(this.art, 'sign', vis.sign.variant, 0, vis.sign.seed);
    if (!s) return null;
    const o = wallItemOrigin(vis.sign, s.base);
    const r = s.base.rects?.sign ?? (() => {
      const b = opaqueBounds(s.base.canvas);
      return { x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 6 };
    })();
    return { x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h };
  }

  /**
   * Rectangle (world px) of an area's wall frame (`painting`), painted together with the walls: the Visit scene
   * puts the lobby stamp board on top of the reception's.
   */
  paintingRect(areaId: string): { x: number; y: number; w: number; h: number } | null {
    const vis = this.areas.get(areaId);
    const it = vis?.layout.wallItems.find((x) => x.kind === 'painting');
    if (!vis || !it) return null;
    const w = toWallVis(it, vis.id);
    const s = wallSprites(this.art, 'painting', it.variant === 'wide' ? undefined : it.variant, 0, w.seed);
    if (!s) return null;
    const o = wallItemOrigin(w, s.base);
    const b = opaqueBounds(s.base.canvas);
    return { x: o.x + b.x, y: o.y + b.y, w: b.w, h: b.h };
  }

  /** Average luminance of the sign's text region (to pick the text color). */
  signIsDark(vis: AreaVis): boolean {
    const s = vis.sign ? wallSprites(this.art, 'sign', vis.sign.variant, 0, vis.sign.seed) : null;
    if (!s) return false;
    const c = s.base.canvas as HTMLCanvasElement & { __dark?: boolean };
    if (c.__dark !== undefined) return c.__dark;
    let dark = false;
    try {
      const r = s.base.rects?.sign ?? { x: 2, y: 2, w: c.width - 4, h: c.height - 4 };
      const d = c.getContext('2d')!.getImageData(r.x, r.y, Math.max(1, r.w), Math.max(1, r.h)).data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n++;
      }
      dark = n > 0 && sum / n < 120;
    } catch {
      dark = false;
    }
    c.__dark = dark;
    return dark;
  }

  // =================================================================== entities

  private furnState(f: FurnVis, now: number): number {
    if (f.kind === 'coffee_machine') return (this.sim.machineUntil.get(f.id) ?? 0) > now ? 1 : 0;
    if (f.kind === 'toilet_stall') return this.sim.stallBusy.has(f.id) ? 1 : 0;
    if (f.kind === 'altar') return this.sim.altarState(now);
    return 0;
  }

  private drawFurniture(f: FurnVis, area: AreaVis, scale: number, front: boolean, now: number): void {
    const { ctx } = this;
    const state = this.furnState(f, now);
    const fs = furnitureSprites(this.art, f, state);
    if (!fs) return;
    // the work tree takes the reception's ficus pot (the first pot is left for the themes)
    const tree = !front && this.sim.workTreeStage !== null && area.layout.kind === 'reception' && f.kind === 'plant_tall' && f.variant === 'ficus' ? workTreeSprite(this.sim.workTreeStage) : null;
    const s = tree ?? (front ? fs.front : seasonalFurniture(this.theme, f.kind, area.layout, f.seed) ?? fs.base);
    if (!s) return;
    const dx = Math.round(f.ax - s.ax);
    const dy = Math.round(f.ay - s.ay);
    const scaled = scale !== 1;
    if (scaled) {
      ctx.save();
      ctx.translate(f.ax, f.ay);
      ctx.scale(scale, scale);
      ctx.translate(-f.ax, -f.ay);
    }
    ctx.drawImage(s.canvas, dx, dy);
    // pizza party: open boxes on the pantry table
    if (!front && f.kind === 'meeting_table' && area.layout.kind === 'cafe' && now < this.sim.pizzaUntil) {
      const p = pizzaBoxSprite();
      ctx.drawImage(p.canvas, Math.round(f.ax - 10 - p.ax), Math.round(f.ay - 13 - p.ay));
      ctx.drawImage(p.canvas, Math.round(f.ax + 8 - p.ax), Math.round(f.ay - 12 - p.ay));
    }
    if (!front) {
      if (f.kind === 'desk' && s.rects?.screen) {
        const r = s.rects.screen;
        const mode = this.deskScreen(f, area);
        this.safe(() => this.art.drawScreen(ctx, { x: dx + r.x, y: dy + r.y, w: r.w, h: r.h }, mode, now, f.seed));
      } else if (f.kind === 'coffee_machine' && state === 1) {
        this.drawSteam(f.ax, dy + 2, now, f.seed);
      } else if (f.kind === 'altar') {
        this.drawAltarFx(f.ax, f.ay, now, (state & 1) === 1);
      } else if (f.kind === 'arcade' && s.rects?.screen) {
        // arcade duel: both machines show the match
        const seed = this.sim.social.arcadeSeed();
        const r = s.rects.screen;
        if (seed !== null) this.safe(() => this.art.drawScreen(ctx, { x: dx + r.x, y: dy + r.y, w: r.w, h: r.h }, 'game', now, seed));
      }
    }
    if (scaled) ctx.restore();
  }

  /** Monitor screen: follows the activity of whoever sits there. */
  deskScreen(f: FurnVis, area: AreaVis): ScreenMode {
    const room = area.room;
    if (room && room.light(this.sim.now) < 0.3) return 'off';
    const owner = f.seatSpot ? this.sim.spots.ownerOf(f.seatSpot) : undefined;
    const ch = owner ? this.sim.chars.get(owner) : undefined;
    if (!ch || ch.leaving) return 'off';
    const seated = ch.atSpot === f.seatSpot;
    if (ch.mode === 'wait') return 'alert';
    if (!seated) return 'idle';
    if (ch.mode === 'work') return screenModeFor(ch.info.activity?.kind);
    // waiting on a shell: terminal with the progress bar moving (the popcorn "movie")
    if (ch.mode === 'shell') return 'progress';
    return 'idle';
  }

  private drawSteam(x: number, y: number, now: number, seed: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const ph = ((now / 900 + i / 3 + (seed % 7) / 7) % 1 + 1) % 1;
      ctx.globalAlpha = 0.75 * (1 - ph);
      const sx = Math.round(x - 1 + Math.sin(ph * 6 + i * 2) * 1.5 + (i - 1));
      const sy = Math.round(y - ph * 9);
      ctx.fillRect(sx, sy, 1, 2);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Thần Tài altar: the red lamps' bulbs flicker softly and, with incense lit, a thin wavy smoke trail rises from each
   * stick tip and fades (time-based, no allocation).
   */
  private drawAltarFx(ax: number, ay: number, now: number, lit: boolean): void {
    const { ctx } = this;
    const x0 = Math.round(ax);
    const y0 = Math.round(ay);
    ALTAR_LAMPS.forEach((p, i) => {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 260 + i * 2.3) * Math.sin(now / 710 + i);
      ctx.fillStyle = '#fff0c0';
      ctx.fillRect(x0 + p.x - 1, y0 + p.y, 2, 1);
    });
    if (lit) {
      // gray-lilac reads on both the light wall and the dark niche
      ctx.fillStyle = '#b9b2c6';
      ALTAR_INCENSE.forEach((p, i) => {
        for (let k = 0; k < 8; k++) {
          const ph = ((now / 2800 + k / 8 + i * 0.37) % 1 + 1) % 1;
          ctx.globalAlpha = 0.8 * (1 - ph);
          const sx = Math.round(x0 + p.x + Math.sin(ph * 7 + now / 900 + i * 1.7) * (0.5 + ph * 2.5));
          ctx.fillRect(sx, Math.round(y0 + p.y - 1 - ph * 18), 1, 2);
        }
      });
    }
    ctx.globalAlpha = 1;
  }

  /** Robot vacuum (and the dock, when it is on it). */
  private drawRobot(): void {
    const r = this.sim.pets.robot;
    const { ctx } = this;
    const d = r.dockTile;
    if (d && r.state === 'charge') {
      const ds = dockSprite();
      ctx.drawImage(ds.canvas, Math.round(d.tx * TILE + TILE / 2 - ds.ax), Math.round(d.ty * TILE + 11 - ds.ay - 2));
    }
    const s = robotSprite(Math.floor(r.animT / 180), r.led);
    ctx.drawImage(s.canvas, Math.round(r.x - s.ax), Math.round(r.y - s.ay + 2));
  }

  /** The "fetch!" ball: red with a light stripe; on the ground it bounces a little, with a shadow. */
  private drawBall(now: number): void {
    const b = this.sim.pets.ball;
    if (!b) return;
    const { ctx } = this;
    const x = Math.round(b.x);
    const bounce = b.carried ? 0 : Math.round(Math.abs(Math.sin(now / 160)) * 2);
    const y = Math.round(b.y) - bounce;
    if (!b.carried) {
      ctx.fillStyle = 'rgba(28,32,52,0.25)';
      ctx.fillRect(x - 2, Math.round(b.y), 5, 1);
    }
    ctx.fillStyle = '#3b1d26';
    ctx.fillRect(x - 2, y - 4, 5, 4);
    ctx.fillRect(x - 1, y - 5, 3, 6);
    ctx.fillStyle = '#e2484f';
    ctx.fillRect(x - 1, y - 4, 3, 4);
    ctx.fillStyle = '#f6e7c8';
    ctx.fillRect(x - 1, y - 3, 3, 1);
    ctx.fillStyle = '#ff9a9e';
    ctx.fillRect(x - 1, y - 4, 1, 1);
  }

  /** Pet: small shadow, the sprite and the icon (petting heart, nap zzz). */
  private drawPet(pet: Pet, now: number): void {
    const { ctx } = this;
    const x = Math.round(pet.x);
    const y = Math.round(pet.y);
    if (pet.sortY === undefined) {
      const sh = shadowSprite();
      ctx.globalAlpha = 0.7;
      ctx.drawImage(sh.canvas, x - sh.ax, y - sh.ay);
      ctx.globalAlpha = 1;
    }
    try {
      const s = petSprite(pet.kind, pet.pose, pet.animT, pet.left, pet.facing);
      ctx.drawImage(s.canvas, x - s.ax, y - s.ay);
      this.petBoxes.set(pet.id, { x: x - s.ax, y: y - s.ay, w: s.canvas.width, h: s.canvas.height, feetY: y });
    } catch {
      // broken art doesn't bring down the frame
    }
    const top = y - (pet.pose === 'sleep' ? 8 : 14);
    if (pet.icon) this.pushIcon(x, top, pet.icon, Math.round(Math.sin(now / 180) * 1.5), 1, 0);
    else if (pet.pose === 'sleep') this.pushIcon(x + 6, top - 2, 'zzz', Math.round(Math.sin(now / 500) * 1.5), 1, 0);
  }

  private drawCharacter(ch: Character, now: number, sel: { agent: string | null; hover: string | null }): void {
    const { ctx } = this;
    const head = this.headOf(ch);
    // side lane for walkers (two on the same path don't become a two-headed figure)
    const x = Math.round(ch.x + ch.offX);
    const y = Math.round(ch.y + ch.offY);
    ctx.globalAlpha = ch.alpha;
    // rings on the floor (selection, hover, alert)
    if (ch.mode === 'wait') this.drawAlertRing(x, y, now);
    if (sel.agent === ch.id) this.drawRing(x, y, '#7fe3ff', now, true);
    else if (sel.hover === ch.id) this.drawRing(x, y, '#ffffff', now, false);
    if (!ch.seated) {
      const sh = shadowSprite();
      ctx.drawImage(sh.canvas, x - sh.ax, y - sh.ay);
    }
    let sprite: Sprite | null = null;
    const req: CharacterFrameRequest = this.req;
    req.appearance = ch.appearance;
    req.dir = ch.dir;
    req.pose = ch.pose;
    req.held = ch.held;
    req.seated = ch.seated;
    req.costume = ch.costume ?? seasonalCostume(this.theme, ch.info.seed);
    try {
      sprite = this.charSprite(req, ch.animT);
    } catch {
      sprite = null;
    }
    if (!sprite && (req.pose === 'wait' || req.held === 'popcorn')) {
      // art still without the wait/popcorn pose: sitting still
      req.pose = req.pose === 'wait' ? 'sit' : req.pose;
      req.held = 'none';
      try {
        sprite = this.charSprite(req, ch.animT);
      } catch {
        sprite = null;
      }
    }
    if (sprite) {
      const sx = x - sprite.ax;
      const sy = y - sprite.ay;
      ctx.drawImage(sprite.canvas, sx, sy);
      const b = opaqueBounds(sprite.canvas);
      head.bx = sx + b.x;
      head.by = sy + b.y;
      head.bw = b.w;
      head.bh = b.h;
      head.y = sy + b.y;
    } else {
      head.bx = x - 7;
      head.by = y - 26;
      head.bw = 14;
      head.bh = 26;
      head.y = y - 26;
    }
    ctx.globalAlpha = 1;
    head.x = x;
    head.feetY = y;
    head.visible = true;
    head.depth = ch.depth();
    // icon over the head (drawn after the light)
    let name: IconName | null = ch.mode === 'wait' ? 'alert' : ch.icon;
    const shell = ch.mode === 'shell' && ch.shellSince > 0 && !ch.leaving;
    let badge = 0;
    if (shell && (!name || name === 'zzz')) {
      // flipping hourglass (with "×N" when there's more than one shell)
      name = hourglassIcon(now);
      badge = ch.shellCount;
    }
    if (name) {
      const bounce =
        name === 'alert'
          ? Math.round(Math.abs(Math.sin(now / 180)) * 4)
          : name === 'zzz'
            ? Math.round(Math.sin(now / 500) * 1.5)
            : name === 'hourglass' || name === 'hourglass_flip'
              ? now % HOURGLASS_FLIP_MS < 110 ? 1 : 0
              : Math.round(Math.max(0, 1 - (now - ch.iconAt) / 250) * 4);
      const lift = name === 'storm' ? STORM_LIFT : 0;
      this.pushIcon(x, head.y - 2 - lift, name, bounce, ch.alpha, badge);
      // long nap: the snoring grows (more "zzz" rising)
      if (name === 'zzz' && ch.sleepSince) {
        const slept = now - ch.sleepSince;
        if (slept > 20_000) this.pushIcon(x + 8, head.y - 12, 'zzz', Math.round(Math.sin(now / 430 + 1) * 1.5), ch.alpha, 0);
        if (slept > 45_000) this.pushIcon(x + 15, head.y - 22, 'zzz', Math.round(Math.sin(now / 370 + 2) * 1.5), ch.alpha, 0);
      }
      // rain: drops fall from the cloud to the head
      if (name === 'storm' && Math.random() < this.dt * 24) this.particles.rain(x - 3 + Math.floor(Math.random() * 7), head.y - 3 - lift, lift + 1);
    }
    if (shell && ch.shellStage === 'nap' && ch.pose === 'sleep') {
      // napping: "zzz" floating above and to the right of the hourglass (the "×N" badge stays below)
      this.pushIcon(x + 10, head.y - 13, 'zzz', Math.round(Math.sin(now / 500) * 1.5), ch.alpha, 0);
    }
    // popcorn jumping out of the bucket now and then
    if (shell && ch.pose === 'wait' && ch.held === 'popcorn' && sprite && now >= ch.popcornAt) {
      ch.popcornAt = now + 450 + Math.random() * 1200;
      const px = x - 1 + (POPCORN_DX[ch.dir] ?? 0);
      const py = y - 1 - (POPCORN_DY[ch.dir] ?? 10);
      this.particles.popcorn(px, py);
      if (Math.random() < 0.3) this.particles.popcorn(px, py);
    }
  }

  private pushIcon(x: number, y: number, name: IconName, bounce: number, alpha: number, badge: number): void {
    if (this.iconCount >= 256) return;
    let ic = this.icons[this.iconCount];
    if (!ic) this.icons[this.iconCount] = ic = { x: 0, y: 0, name, bounce: 0, alpha: 1, badge: 0 };
    ic.x = x;
    ic.y = y;
    ic.name = name;
    ic.bounce = bounce;
    ic.alpha = alpha;
    ic.badge = badge;
    this.iconCount++;
  }

  /** Character sprite at the animation frame (tolerates art without the pose: invalid count/duration). */
  private charSprite(req: CharacterFrameRequest, animT: number): Sprite {
    const { art } = this;
    const count = Math.max(1, art.poseFrameCount(req.pose) || 1);
    const dur = Math.max(30, art.poseFrameDuration(req.pose) || 500);
    req.frame = Math.floor(animT / dur) % count;
    return art.characterSprite(req);
  }

  /**
   * Spider web in the corner of a character waiting on a shell for more than 10 min (integer scale:
   * 1x, then 2x at 20 min). Napping, it gets covered: one web on each side. The web goes to the
   * side without a neighbor; with neighbors on both sides, it covers the character itself more (doesn't spill onto the
   * next desk).
   */
  private drawCobwebs(now: number): void {
    // visit: no time came from the world, so no web
    if (this.sim.visit) return;
    const { ctx } = this;
    for (const ch of this.sim.chars.values()) {
      if (ch.mode !== 'shell' || !ch.shellSince || ch.leaving || !ch.seated || ch.atSpot !== ch.homeSpot) continue;
      const scale = cobwebScale(now - ch.shellSince);
      if (!scale) continue;
      const head = this.heads.get(ch.id);
      if (!head || !head.visible) continue;
      const web = this.icon('cobweb');
      if (!web) return;
      let left = (ch.info.seed & 1) === 0;
      const busyL = this.neighborAt(head, -1);
      const busyR = this.neighborAt(head, 1);
      if (left ? busyL && !busyR : busyR && !busyL) left = !left;
      ctx.globalAlpha = ch.alpha;
      this.drawWeb(web, head, left, scale, left ? busyL : busyR);
      if (ch.shellStage === 'nap') this.drawWeb(web, head, !left, 1, left ? busyR : busyL);
    }
    ctx.globalAlpha = 1;
  }

  /** Someone visible right next to them (same row, up to ~2 desks) on side `side` (-1 left, 1 right)? */
  private neighborAt(head: HeadInfo, side: -1 | 1): boolean {
    for (const h of this.heads.values()) {
      if (h === head || !h.visible || Math.abs(h.feetY - head.feetY) > 10) continue;
      const dx = (h.x - head.x) * side;
      if (dx > 0 && dx < 2.2 * TILE) return true;
    }
    return false;
  }

  /**
   * A web stuck to the shoulder (the web's corner, on top, sticks out of the body; mirrored on the right
   * side). With a neighbor beside, at most WEB_MAX_OUT px outside: the rest covers the character.
   */
  private drawWeb(web: Sprite, head: HeadInfo, left: boolean, scale: number, crowded: boolean): void {
    const { ctx } = this;
    const w = web.canvas.width * scale;
    const h = web.canvas.height * scale;
    const out = crowded ? Math.min(w - 3 * scale, WEB_MAX_OUT) : w - 3 * scale;
    const y = Math.round(head.by + 2);
    if (left) {
      ctx.drawImage(web.canvas, Math.round(head.bx - out), y, w, h);
      return;
    }
    const x = Math.round(head.bx + head.bw + out - w);
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(web.canvas, 0, 0, w, h);
    ctx.restore();
  }

  /**
   * Effects requested by the simulation: confetti (shell finished) over whoever celebrates, coins flying from
   * whoever lost the bet to whoever won, and the sparkle of whoever tidied up at the mirror.
   */
  private drainEffects(now: number): void {
    const fx = this.sim.effects;
    for (let i = 0; i < fx.length; i++) {
      const e = fx[i];
      const head = this.heads.get(e.charId);
      if (!head || !head.visible || now - e.at > 1500) continue;
      if (e.kind === 'confetti') this.particles.confetti(head.x, head.y - 4);
      else if (e.kind === 'sparkle') this.particles.sparkle(head.x, head.y + 4);
      else if (e.kind === 'coins') {
        const to = this.heads.get(e.toId);
        if (to && to.visible) this.particles.coins(head.x, head.y + 2, to.x, to.y + 2);
      }
    }
    fx.length = 0;
  }

  private reflectReq: CharacterFrameRequest = {
    appearance: undefined as unknown as CharacterFrameRequest['appearance'],
    dir: 'down',
    pose: 'stand',
    frame: 0,
    held: 'none',
    seated: false,
  };

  /**
   * Reflection in the restroom mirror: whoever stands at the sink, facing the mirror, appears from
   * the front in the glass (face centered, half transparent, with the glass's bluish veil on top).
   */
  private drawReflection(w: WallVis, gx: number, gy: number, gw: number, gh: number): void {
    const { ctx } = this;
    for (const ch of this.sim.chars.values()) {
      if (ch.inside || ch.alpha < 0.5 || ch.dir !== 'up' || ch.seated) continue;
      if (Math.abs(ch.x - w.cx) > 5) continue;
      const dy = ch.y - w.baseY;
      if (dy < 14 || dy > 30) continue;
      const req = this.reflectReq;
      req.appearance = ch.appearance;
      req.pose = ch.pose === 'groom' ? 'groom' : 'stand';
      req.held = ch.pose === 'groom' ? ch.held : 'none';
      req.seated = false;
      req.costume = ch.costume ?? seasonalCostume(this.theme, ch.info.seed);
      let s: Sprite;
      try {
        s = this.charSprite(req, ch.animT);
      } catch {
        return;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx, gy, gw, gh);
      ctx.clip();
      ctx.globalAlpha = 0.8 * ch.alpha;
      ctx.drawImage(s.canvas, Math.round(gx + gw / 2 - s.ax), Math.round(gy - 6));
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#cfe6f2';
      ctx.fillRect(gx, gy, gw, gh);
      ctx.restore();
      return;
    }
  }

  private req: CharacterFrameRequest = {
    appearance: undefined as unknown as CharacterFrameRequest['appearance'],
    dir: 'down',
    pose: 'stand',
    frame: 0,
    held: 'none',
    seated: false,
  };

  private drawRing(x: number, y: number, color: string, now: number, pulse: boolean): void {
    const { ctx } = this;
    const k = pulse ? 1 + Math.sin(now / 220) * 0.08 : 1;
    ctx.save();
    ctx.globalAlpha *= pulse ? 0.95 : 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, 8 * k, 3.5 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawAlertRing(x: number, y: number, now: number): void {
    const { ctx } = this;
    const ph = (now % 1100) / 1100;
    ctx.save();
    ctx.strokeStyle = '#ffb11f';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha *= 0.9 * (1 - ph);
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + ph * 12, 2.5 + ph * 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawProp(prop: ExteriorProp, alpha: number): void {
    if (prop.kind === 'paving') {
      const c = this.pavingCanvas(prop);
      if (alpha < 1) this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(c, prop.x, prop.y);
      this.ctx.globalAlpha = 1;
      return;
    }
    const s = propSprite(prop);
    if (alpha < 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(s.canvas, Math.round(prop.x - s.ax), Math.round(prop.y - s.ay));
    this.ctx.globalAlpha = 1;
  }

  private pavings = new Map<string, HTMLCanvasElement>();

  /** Sidewalk patch (2x2 tiles) with the same pattern as the neighboring sidewalk (world coordinates). */
  private pavingCanvas(prop: ExteriorProp): HTMLCanvasElement {
    const key = `${prop.x},${prop.y}`;
    let c = this.pavings.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = 2 * TILE;
    c.height = 2 * TILE;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-prop.x, -prop.y);
    this.safe(() => this.art.drawFloor(ctx, 'sidewalk', prop.x, prop.y, 2 * TILE, 2 * TILE, { seed: prop.seed }));
    this.pavings.set(key, c);
    return c;
  }

  /** Vehicles on the street, for the headlights (LightScene). */
  get cars(): readonly Vehicle[] {
    return this.traffic.vehicles;
  }

  private drawCar(car: Vehicle): void {
    if (car.kind === 'car') {
      const s = carSprite(car.variant, car.dir < 0);
      this.ctx.drawImage(s.canvas, Math.round(car.x - s.ax), Math.round(car.y - s.ay));
      this.wetWheels(car, 29);
      return;
    }
    // motorbike: the bike, the riders (office characters seated sideways, helmets on; the rider's arms reach for the
    // handlebar) and the bike's front over their legs
    const { back, front } = motorbikeSprites(car.variant, car.dir < 0);
    const x = Math.round(car.x - back.ax);
    const y = Math.round(car.y - back.ay);
    this.ctx.drawImage(back.canvas, x, y);
    const riders = this.bikeRiders(car);
    const dir = car.dir > 0 ? 'right' : 'left';
    const rain = this.weather === 'rain';
    if (car.cargo) {
      const c = cargoSprite(car.cargo, car.dir < 0, car.variant);
      this.ctx.drawImage(c.canvas, Math.round(car.x + car.dir * BIKE_RACK.dx - c.ax), Math.round(car.y + BIKE_RACK.dy - c.ay));
    }
    if (!car.pushing) {
      riders.forEach((appearance, i) => {
        const rider = i === riders.length - 1;
        const dx = rider ? BIKE_SEATS.rider : BIKE_SEATS.passenger;
        this.safe(() => {
          // a waiting xe ôm driver scrolls the phone; riding, the arms reach for the handlebar
          const sp = car.parked
            ? this.charSprite({ appearance, dir, pose: 'read', held: 'phone', seated: true, frame: 0 }, this.clock())
            : this.art.characterSprite({ appearance, dir, pose: rider ? 'type' : 'sit', frame: 0 });
          this.ctx.drawImage(sp.canvas, Math.round(car.x + car.dir * dx - sp.ax), Math.round(car.y - RIDER_LIFT - sp.ay));
        });
      });
      if (rain && riders.length) this.drawPoncho(car, car.x + car.dir * BIKE_SEATS.rider, car.y - RIDER_LIFT - 13, riders.length > 1);
    }
    this.ctx.drawImage(front.canvas, x, y);
    // stalled in the flood: the rider walks beside the bike, pushing it by the handlebar
    const walker = riders[riders.length - 1];
    if (car.pushing && walker) {
      this.safe(() => {
        const sp = this.charSprite({ appearance: walker, dir, pose: 'walk', frame: 0 }, this.clock() * 0.6);
        this.ctx.drawImage(sp.canvas, Math.round(car.x + car.dir * 5 - sp.ax), Math.round(car.y + 3 - sp.ay));
      });
      if (rain) this.drawPoncho(car, car.x + car.dir * 5, car.y + 3 - PONCHO_STANDING, false);
    }
    this.wetWheels(car, 13);
  }

  /**
   * "Áo mưa cánh dơi": a big plastic poncho over the rider (and the passenger), from the shoulders down past the seat,
   * its back edge flapping in the wind of the ride.
   */
  private drawPoncho(car: Vehicle, rx: number, neckY: number, two: boolean): void {
    const { ctx } = this;
    const [color, dark, light] = PONCHOS[car.variant % PONCHOS.length];
    const top = Math.round(neckY);
    const flap = Math.sin(this.clock() / 90 + car.variant) * 1.5 * Math.min(1, car.speed / 20);
    ctx.globalAlpha = 0.88;
    for (let r = 0; r < 12; r++) {
      const front = 3 + Math.min(r, 3);
      const back = (two ? 13 : 6) + r * 0.45 + (r > 6 ? flap * (r - 6) * 0.3 : 0);
      const a = Math.round(rx + car.dir * front);
      const b = Math.round(rx - car.dir * back);
      ctx.fillStyle = r === 0 || r === 11 ? dark : color;
      ctx.fillRect(Math.min(a, b), top + r, Math.abs(a - b) + 1, 1);
    }
    // a lighter crease down the back and a sheen on the shoulder
    ctx.fillStyle = light;
    ctx.fillRect(Math.round(rx - car.dir * 3), top + 2, 1, 8);
    ctx.fillRect(Math.round(rx + car.dir * 1), top + 1, 2, 1);
    ctx.globalAlpha = 1;
  }

  /** Wheels on a wet street: spray behind them in the rain, and through a flood the water up to the axles with a wake. */
  private wetWheels(car: Vehicle, half: number): void {
    const f = this.traffic.flood;
    const rain = this.weather === 'rain';
    if (!rain && f < 0.05) return;
    // only on the road (not the bikes parked or waiting on the sidewalks)
    if (car.y < this.exterior.streetY - 2 || car.y > this.exterior.streetY + this.exterior.streetH + 2) return;
    const moving = car.speed > 8;
    if (moving && Math.random() < this.dt * (rain ? 5 : 0) + this.dt * f * 14) this.particles.splash(car.x - car.dir * (half - 4), car.y - 1, car.dir, 0.6 + f);
    if (f < 0.05) return;
    const { ctx } = this;
    const depth = Math.round(1 + f * 6);
    ctx.fillStyle = `rgba(112,102,80,${(0.75 * Math.min(1, f * 1.6)).toFixed(3)})`;
    ctx.fillRect(Math.round(car.x - half - 1), Math.round(car.y - depth), half * 2 + 2, depth + 2);
    if (!moving) return;
    // the wake: a V of ripples trailing behind
    ctx.fillStyle = `rgba(214,228,236,${(0.55 * f).toFixed(3)})`;
    const rear = car.x - car.dir * half;
    for (let i = 1; i <= 3; i++) {
      ctx.fillRect(Math.round(rear - car.dir * i * 4), Math.round(car.y - depth - i), 2, 1);
      ctx.fillRect(Math.round(rear - car.dir * i * 4), Math.round(car.y + i), 2, 1);
    }
  }

  /** Who rides a bike (passenger last, drawn first so the rider is in front): stable per vehicle, a helmet for each. */
  private bikeRiders(car: Vehicle): Appearance[] {
    // an agent's own bike: nobody on it while parked, the agent (helmet on) riding
    if (car.owner) {
      const look = car.phase === 'parked' ? undefined : this.owners.get(car.owner);
      return look ? [{ ...look, accessory: 'cap', accessoryColor: HELMETS[car.variant % HELMETS.length], lanyard: null }] : [];
    }
    let list = this.riders.get(car.variant);
    if (list) return list;
    if (this.riders.size > 200) this.riders.clear();
    list = [];
    try {
      for (let i = 0; i < car.riders; i++) {
        const seed = car.variant * 7 + i * 1013;
        const base = this.art.appearanceFromSeed(seed, { look: seed % 2 ? 'f' : 'm', sub: false });
        // xe ôm: the ride-hailing green jacket and helmet
        if (car.parked) list.unshift({ ...base, top: '#1fa34a', topAccent: '#15803a', topStyle: 'jacket', accessory: 'cap', accessoryColor: '#1fa34a', lanyard: null });
        else list.unshift({ ...base, accessory: 'cap', accessoryColor: HELMETS[seed % HELMETS.length], lanyard: null });
      }
    } catch {
      list = [];
    }
    this.riders.set(car.variant, list);
    return list;
  }

  /** Steps the traffic on the clock (forced hour and timelapse included), not on the sky's hour: a pinned day still has rush hour. */
  private updateCars(now: number, dt: number): void {
    const b = this.exterior.bounds;
    const ext = this.exterior;
    const d = this.date;
    const hour = d.getHours() + d.getMinutes() / 60;
    const env: TrafficEnv = { x0: b.x * TILE - 40, x1: (b.x + b.w) * TILE + 40, lanes: ext.lanes, sidewalkY: ext.streetY + ext.streetH };
    this.bikeTrips(env);
    // last frame's weather: this frame's is worked out further down
    this.traffic.step(now, dt, env, hour, d.getDay(), this.weather === 'rain', this.streetDay());
    this.sim.flooded = this.traffic.flood > FLOODED;
    for (const id of this.traffic.parked) this.sim.bikeParked.add(id);
    this.traffic.parked.length = 0;
  }

  /**
   * The sim's bike trips: an agent riding in to park, or riding off. A bike still parked whose owner is gone (the
   * session vanished some other way) rides off too.
   */
  private bikeTrips(env: TrafficEnv): void {
    for (const trip of this.sim.bikeTrips) {
      this.owners.set(trip.id, trip.appearance);
      if (trip.t === 'arrive') this.traffic.arrive(trip.id, PARKING[trip.slot], env);
      else this.traffic.depart(trip.id);
    }
    this.sim.bikeTrips.length = 0;
    for (const v of this.traffic.vehicles) if (v.phase === 'parked' && v.owner && !this.sim.chars.has(v.owner)) this.traffic.depart(v.owner);
    if (this.owners.size > 64) for (const id of this.owners.keys()) if (!this.traffic.vehicles.some((v) => v.owner === id)) this.owners.delete(id);
  }

  /** The office's holiday theme as the street sees it: peach branches and an empty Tết, flowers on the flower days. */
  private streetDay(): StreetDay {
    if (this.theme === 'valentine' || this.theme === 'women') return { flowers: true };
    if (this.theme !== 'tet') return {};
    const d = this.date;
    const tet = tetDay(d.getFullYear());
    if (!tet) return {};
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - tet.getTime()) / 86_400_000);
    return diff < 0 ? { tet: 'before' } : diff <= 2 ? { tet: 'holiday' } : {};
  }

  /**
   * Xe ôm drivers in green jackets waiting on the far sidewalk, west of the entrance, from early morning to late night
   * (two or three, depending on the hour), seated on their bikes looking at their phones.
   */
  private xeOm(): readonly Vehicle[] {
    const h = this.date.getHours() + this.date.getMinutes() / 60;
    if (h < 6.5 || h >= 23) return NO_VEHICLES;
    const ext = this.exterior;
    if (this.xeOmFor !== ext) {
      this.xeOmFor = ext;
      const y = ext.streetY + ext.streetH + 28;
      this.xeOmList = [-8.2, -5.8, -3.4].map((tx, i): Vehicle => ({ kind: 'bike', x: tx * TILE, y, dir: 1, speed: 0, want: 0, laneY: y, ty: y, variant: 7001 + i * 3, riders: 1, stuck: 0, sidewalk: 0, parked: true }));
    }
    return this.xeOmList.slice(0, 2 + (this.date.getHours() % 2));
  }

  /** Muddy water over the street (spilling onto the curbs when deep), with ripples drifting on it. */
  private drawFlood(now: number, vx0: number, vy0: number, vx1: number, vy1: number): void {
    const { ctx } = this;
    const ext = this.exterior;
    const f = this.traffic.flood;
    const spill = f > 0.6 ? Math.round((f - 0.6) * 15) : 0;
    const x0 = Math.max(vx0, ext.bounds.x * TILE);
    const x1 = Math.min(vx1, (ext.bounds.x + ext.bounds.w) * TILE);
    const y0 = Math.max(vy0, ext.streetY - spill);
    const y1 = Math.min(vy1, ext.streetY + ext.streetH + spill);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.fillStyle = `rgba(112,102,80,${(0.62 * f).toFixed(3)})`;
    ctx.fillRect(Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0), Math.ceil(y1 - y0));
    // ripples: short light dashes on a loose grid, sliding back and forth
    ctx.fillStyle = `rgba(214,228,236,${(0.4 * f).toFixed(3)})`;
    const t = now / 1000;
    for (let gy = Math.floor(y0 / 7) * 7; gy < y1; gy += 7) {
      for (let gx = Math.floor(x0 / 22) * 22; gx < x1; gx += 22) {
        const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        if (h % 3 === 0) continue;
        const x = gx + (h % 17) + Math.sin(t * 0.8 + (h % 7)) * 2;
        ctx.fillRect(Math.round(x), gy + (h % 5), 2 + (h % 3), 1);
      }
    }
  }

  private drawPingPong(now: number): void {
    const { ctx } = this;
    for (const g of this.sim.social.gatherings) {
      if (g.kind !== 'pingpong' || g.phase !== 'run') continue;
      let a: Character | undefined;
      let b: Character | undefined;
      for (const m of g.members) {
        if (m.role !== 'player' || m.left) continue;
        if (!a) a = this.sim.chars.get(m.id);
        else b = this.sim.chars.get(m.id);
      }
      if (!a || !b) continue;
      const left = a.x < b.x ? a : b;
      const right = a.x < b.x ? b : a;
      const period = 1100;
      const ph = ((now - g.startAt) % (period * 2)) / period;
      const u = ph < 1 ? ph : 2 - ph;
      const x = left.x + 9 + (right.x - left.x - 18) * u;
      const baseY = (left.y + right.y) / 2 - 9;
      const arc = Math.sin(Math.PI * ((u * 2) % 1)) * 6;
      ctx.fillStyle = 'rgba(30,40,60,0.35)';
      ctx.fillRect(Math.round(x) - 1, Math.round(baseY) + 1, 2, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x) - 1, Math.round(baseY - arc) - 1, 2, 2);
    }
  }

  private icon(name: IconName): Sprite | null {
    try {
      const s = this.art.iconSprite(name);
      if (s && s.canvas.width > 0) return s;
    } catch {
      // art still without this icon
    }
    return fallbackIcon(name);
  }

  // =================================================================== light

  /**
   * Light: the day/night cycle map (exterior, interiors and halos; nothing by day), the shadow of rooms
   * with the light off (and the on/off transition) and the glows on top.
   */
  private drawLighting(now: number, vx0: number, vy0: number, vx1: number, vy1: number): void {
    const { ctx } = this;
    const view = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
    this.lighting.drawAmbient(ctx, this, view, now, this.dt);
    const n = this.night;
    // rooms with the light off (and the on/off transition)
    for (const vis of this.areas.values()) {
      const room = vis.room;
      if (!room || !vis.layout.shade) continue;
      // siesta: the office lights dim a little
      const light = room.light(now) * (1 - SIESTA_DIM * this.sim.siestaDim);
      const strength = (room.phase === 'building' ? 0.5 : 0.74) + 0.1 * n;
      // during assembly/teardown, the darkness follows the visible floor (the patio doesn't darken)
      const cover = room.phase === 'building' || room.phase === 'dismantling' ? buildAnim(room.phase, room.progress(now)).floor : 1;
      const dark = (1 - light) * strength * cover;
      if (dark <= 0.01) continue;
      const s = vis.layout.shade;
      ctx.fillStyle = `rgba(8,12,36,${dark})`;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }
    this.lighting.drawGlows(ctx, this, view, now);
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      // incomplete art (stub) must not bring down the world
    }
  }


}
