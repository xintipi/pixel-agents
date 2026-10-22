// Office layout types. Layout modules are PURE (no DOM): they produce descriptions
// that the render turns into pixels and the simulation uses for paths and points of interest.
import type { Dir, FloorKind, FurnitureKind, WallStyle } from '../../art/api';

export type AreaKind = 'reception' | 'restroom' | 'cafe' | 'lounge' | 'room' | 'corridor';

/** Rectangle in tiles (absolute world coordinates). */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Placed floor furniture. */
export interface FurniturePlacement {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  /** Top-left corner of the footprint, in absolute tiles. */
  tx: number;
  ty: number;
  /** Drawing offset in px (e.g. chair centered on a 2-tile desk). Doesn't affect the footprint. */
  dx?: number;
  dy?: number;
  /** Relative order in the build animation (0..1). */
  order: number;
  /** For desks: seat index (the screen follows the activity of whoever sits there). */
  seat?: string;
}

/** Wall-mounted item. `cx` = center in world px; `baseY` = baseboard line in px. */
export interface WallItemPlacement {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  cx: number;
  baseY: number;
  /** 'face' = north wall face; 'south' = on top of the south wall's low wall. */
  on: 'face' | 'south';
  order: number;
}

export interface Doorway {
  x: number;
  w: number;
}

/** Wall segment in world px. */
export type WallSegment =
  | { kind: 'face'; x: number; y: number; w: number; style: WallStyle; doorways?: Doorway[] }
  | { kind: 'south'; x: number; y: number; w: number; style: WallStyle; doorways?: Doorway[] }
  | { kind: 'cap'; x: number; y: number; w: number; h: number; style: WallStyle };

export interface FloorPatch {
  kind: FloorKind;
  /** world px */
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  tint?: string;
  tint2?: string;
}

export interface RugPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  seed: number;
}

export type SpotKind =
  | 'desk' // workplace (desk + chair)
  | 'stool' // meeting table stool
  | 'nook' // armchair/pouf inside the project room (extra workplace, with laptop)
  | 'stand' // standing spot inside the room (work without a desk)
  | 'switch' // light switch
  | 'whiteboard'
  | 'coffee'
  | 'water'
  | 'snack'
  | 'fridge'
  | 'cafe_seat'
  | 'sofa'
  | 'armchair'
  | 'beanbag'
  | 'bench'
  | 'pingpong'
  | 'arcade'
  | 'shelf'
  | 'window'
  | 'stall'
  | 'sink'
  | 'elevator'
  | 'talk'
  | 'watch' // spectator standing spot (watching a match)
  | 'altar'; // in front of the Thần Tài altar (reception): lighting incense and bowing

/**
 * Point of interest. The character walks to the (walkable) approach tile (tx, ty),
 * and then "snaps" to the final position (x, y) in px, facing `dir`.
 */
export interface SpotDef {
  id: string;
  kind: SpotKind;
  areaId: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  dir: Dir;
  seated?: boolean;
  /** Associated furniture (chair, machine, stall...). */
  furnitureId?: string;
  /** Depth to use when occupied (seats: right after the furniture). */
  sortY?: number;
  /** Paired spots (ping-pong, chat) share the group. */
  group?: string;
  /** Desk whose screen follows whoever is sitting here. */
  deskId?: string;
  /** Preference order (desks). */
  rank?: number;
  /** Island side: 'S' = back to the camera (screen visible), 'N' = facing (desk_back). */
  side?: 'S' | 'N';
}

export interface AreaLayout {
  id: string;
  kind: AreaKind;
  /** Area rectangle in absolute tiles. */
  rect: TileRect;
  floors: FloorPatch[];
  rugs: RugPatch[];
  walls: WallSegment[];
  wallItems: WallItemPlacement[];
  furniture: FurniturePlacement[];
  spots: SpotDef[];
  /** Walkable tiles (absolute), besides those blocked by furniture. */
  walkable: TileRect[];
  /** Explicitly blocked tiles (partitions drawn as floor, etc.). */
  blocked?: TileRect[];
  /** Door tiles (absolute). */
  door?: TileRect;
  /** For project rooms: the corridor side it's on. */
  side?: 'north' | 'south';
  /** Tint (hex color) lightly applied over the floor, so each room has its own identity. */
  floorTint?: string;
  /** Rectangle (px) darkened when the light is off. */
  shade?: { x: number; y: number; w: number; h: number };
  /** Rectangle (px) of the name sign. */
  signId?: string;
}

/** Outdoor decorative element (tree, bush, lamp post...) drawn by the world itself. */
export interface ExteriorProp {
  kind: 'tree' | 'pine' | 'bush' | 'flowers' | 'lamp' | 'bench' | 'rock' | 'hedge' | 'parasol' | 'totem' | 'paving' | 'tea_stool' | 'tea_table' | 'tea_cooler' | 'tea_stack' | 'banhmi_cart'
    | 'repair_rack' | 'repair_sign' | 'repair_compressor' | 'repair_stool' | 'repair_basin' | 'trash_cart' | 'scrap_bike' | 'loudspeaker' | 'bun_bike';
  /** World px: bottom center point (base). */
  x: number;
  y: number;
  seed: number;
  /** Slot it belongs to (vanishes when there's a room there). */
  slot?: number;
  /** The opposite: only appears when there IS a room in this slot (e.g. hedge closing the garden path). */
  whenRoom?: number;
}
