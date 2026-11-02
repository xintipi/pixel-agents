// Fishing mini game (the pond across the street): the fish table, what a cast brings up and the local save.
// Pure: no DOM, storage injected. Slimmed down from the fishing-chill prototype: one pond, no shop, no bait.
// Local only: nothing here goes to the server or to Habblaud World.
import { tr } from '../../../shared/i18n';

export const FISHING_KEY = 'habblaud:fishing';

export type Shape = 'round' | 'deep' | 'long' | 'eel' | 'sturgeon' | 'boot' | 'can' | 'bottle' | 'chest';
/** Colours: body, shade, belly, outline, fin. */
export type FishPalette = readonly [string, string, string, string, string];

export interface Fish {
  id: number;
  name(): string;
  shape: Shape;
  pal: FishPalette;
  /** 0 common, 1 uncommon, 2 rare, 3 legendary. */
  rarity: 0 | 1 | 2 | 3;
  /** Length range (cm). */
  size: readonly [number, number];
  /** Only bites by day or by night; absent: any time. */
  time?: 'day' | 'night';
  /** Only bites while it rains. */
  rain?: boolean;
  /** Not a fish: left out of the Fishdex. */
  junk?: boolean;
}

export interface Catch {
  fish: Fish;
  /** cm (0 for junk). */
  size: number;
  /** A line of text that goes with the catch (a tip from the bottle, what the chest held). */
  note?: string;
}

export interface Cond {
  night: boolean;
  rain: boolean;
}

export const RARITY = [
  { name: () => tr('COMMON'), color: '#f4e3c3', weight: 60 },
  { name: () => tr('UNCOMMON'), color: '#7ed957', weight: 28 },
  { name: () => tr('RARE'), color: '#b07ce8', weight: 10 },
  { name: () => tr('LEGENDARY'), color: '#f6c945', weight: 2 },
] as const;

// The pond's ten fish. The Fishdex draws them in this order, five per row.
export const FISH: readonly Fish[] = [
  {
    id: 0,
    name: () => tr('Climbing perch'),
    shape: 'round',
    pal: ['#8fa36a', '#6f8550', '#d6dcaa', '#3e4a2a', '#6f8550'],
    rarity: 0,
    size: [8, 18],
  },
  {
    id: 1,
    name: () => tr('Carp'),
    shape: 'deep',
    pal: ['#d98a3d', '#b06a2a', '#f2d29b', '#5c3214', '#b06a2a'],
    rarity: 0,
    size: [20, 55],
  },
  {
    id: 2,
    name: () => tr('Goby'),
    shape: 'round',
    pal: ['#a39d7c', '#7f7a5c', '#e2ddc2', '#3f3c2a', '#7f7a5c'],
    rarity: 0,
    size: [15, 30],
  },
  {
    id: 3,
    name: () => tr('Catfish'),
    shape: 'long',
    pal: ['#7a5e4a', '#5c4535', '#b89a7c', '#2e2219', '#5c4535'],
    rarity: 1,
    size: [25, 48],
    time: 'night',
  },
  {
    id: 4,
    name: () => tr('Hemibagrus'),
    shape: 'long',
    pal: ['#b8a39a', '#8c766c', '#e6d8d0', '#3e302a', '#8c766c'],
    rarity: 1,
    size: [30, 80],
    time: 'day',
  },
  {
    id: 5,
    name: () => tr('Swamp eel'),
    shape: 'eel',
    pal: ['#6f7d50', '#525e3a', '#b4bf92', '#262d18', '#525e3a'],
    rarity: 1,
    size: [30, 70],
    time: 'night',
  },
  {
    id: 6,
    name: () => tr('Koi'),
    shape: 'deep',
    pal: ['#f7f2ea', '#e0583f', '#ffffff', '#8a2e22', '#e0583f'],
    rarity: 2,
    size: [30, 60],
    time: 'day',
  },
  {
    id: 7,
    name: () => tr('Goldfish'),
    shape: 'deep',
    pal: ['#f6c945', '#d9a024', '#fff2b0', '#7a5210', '#d9a024'],
    rarity: 2,
    size: [25, 45],
    time: 'day',
  },
  {
    id: 8,
    name: () => tr('Rainbow fish'),
    shape: 'round',
    pal: ['#6ec6e8', '#e87ab8', '#fff0a0', '#2f4f8e', '#e87ab8'],
    rarity: 2,
    size: [20, 40],
    time: 'night',
  },
  {
    id: 9,
    name: () => tr('Sturgeon'),
    shape: 'sturgeon',
    pal: ['#8a9aa8', '#66768a', '#d6dee6', '#2a3440', '#66768a'],
    rarity: 3,
    size: [60, 150],
    rain: true,
  },
];

// Odd things that come up instead of a fish.
export const JUNK: readonly Fish[] = [
  {
    id: 100,
    name: () => tr('Old boot'),
    shape: 'boot',
    pal: ['#6a6a5a', '#4a4a3e', '#8a8a78', '#2a2a22', '#8a8a78'],
    rarity: 0,
    size: [0, 0],
    junk: true,
  },
  {
    id: 101,
    name: () => tr('Soda can'),
    shape: 'can',
    pal: ['#d0503f', '#8a2e24', '#f4f4f4', '#3a1a14', '#d0503f'],
    rarity: 0,
    size: [0, 0],
    junk: true,
  },
  {
    id: 102,
    name: () => tr('Message in a bottle'),
    shape: 'bottle',
    pal: ['#7fc8b0', '#5aa08a', '#f4e8c8', '#2a5a4a', '#a0673e'],
    rarity: 1,
    size: [0, 0],
    junk: true,
  },
  {
    id: 103,
    name: () => tr('Treasure chest'),
    shape: 'chest',
    pal: ['#9a6440', '#6e4329', '#c08556', '#3a2414', '#f6c945'],
    rarity: 2,
    size: [0, 0],
    junk: true,
  },
];

const JUNK_CHANCE = 0.12;

function rollJunk(rnd: () => number): Catch {
  const k = rnd();
  const fish = k < 0.1 ? JUNK[3] : JUNK[Math.floor(((k - 0.1) / 0.9) * 3)];
  switch (fish.id) {
    case 100:
      return { fish, size: 0, note: tr('Who dropped this here?') };
    case 101:
      return {
        fish,
        size: 0,
        note: tr('Picking up litter keeps the pond clean'),
      };
    case 102: {
      const tips = [
        tr('Casting far brings up the rarer fish'),
        tr('The catfish only bites at night'),
        tr('The sturgeon shows up when it rains'),
        tr('Koi and goldfish bite in daylight'),
      ];
      return { fish, size: 0, note: tips[Math.floor(rnd() * tips.length)] };
    }
    default:
      return { fish, size: 0, note: tr('A sunken chest, full of shells') };
  }
}

/**
 * What a cast brings up. `dist` (0..1): the farther the cast, the likelier the rarer fish; rain makes them likelier
 * too. A rarity with no fish for the time and weather falls back to the one below, so there is always something
 * (the common fish bite at any hour).
 */
export function rollFish(dist: number, c: Cond, rnd: () => number = Math.random): Catch {
  if (rnd() < JUNK_CHANCE) return rollJunk(rnd);
  const w = RARITY.map((r, i) => r.weight * (1 + dist * i * 1.5) * (i && c.rain ? 1.5 : 1));
  let x = rnd() * w.reduce((a, b) => a + b, 0);
  let r = 0;
  while (r < w.length - 1 && x >= w[r]) {
    x -= w[r];
    r++;
  }
  const fits = (f: Fish) => f.rarity === r && (!f.time || f.time === (c.night ? 'night' : 'day')) && (!f.rain || c.rain);
  let pool = FISH.filter(fits);
  while (!pool.length) {
    r--;
    pool = FISH.filter(fits);
  }
  const fish = pool[Math.floor(rnd() * pool.length)];
  return {
    fish,
    size: Math.round(fish.size[0] + rnd() * (fish.size[1] - fish.size[0])),
  };
}

// ------------------------------------------------------------------ save

export interface FishingSave {
  /** Longest fish of each kind (cm), by id. */
  best: Record<number, number>;
  /** How many of each kind. */
  count: Record<number, number>;
}

export const emptySave = (): FishingSave => ({ best: {}, count: {} });

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const natural = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(9999, Math.round(v)) : 0);

/** Reads the save, dropping anything that is not a known fish. Corrupted or missing: empty. */
export function loadSave(store: Store | null): FishingSave {
  const out = emptySave();
  try {
    const raw = JSON.parse(store?.getItem(FISHING_KEY) ?? 'null') as Partial<FishingSave> | null;
    for (const f of FISH) {
      const best = natural(raw?.best?.[f.id]);
      const count = natural(raw?.count?.[f.id]);
      if (count > 0) {
        out.count[f.id] = count;
        out.best[f.id] = Math.max(best, f.size[0]);
      }
    }
  } catch {
    // unreadable save: starts over
  }
  return out;
}

export function writeSave(store: Store | null, s: FishingSave): void {
  try {
    store?.setItem(FISHING_KEY, JSON.stringify(s));
  } catch {
    // storage full or blocked: the game goes on, it just isn't remembered
  }
}

/** Notes the catch in the Fishdex. Returns true when it is the first of its kind. Junk doesn't count. */
export function record(s: FishingSave, c: Catch): boolean {
  if (c.fish.junk) return false;
  const id = c.fish.id;
  const first = !s.count[id];
  s.count[id] = (s.count[id] ?? 0) + 1;
  s.best[id] = Math.max(s.best[id] ?? 0, c.size);
  return first;
}
