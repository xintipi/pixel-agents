// Pet sprites (art/pets.ts) on canvas, cached per pet, pose, frame and side.
import type { Sprite } from '../../art/api';
import type { BufSprite } from '../../art/core/sprite';
import { gridSize, paintGrid, type PixelGrid } from '../../art/handdrawn/grid';
import { PET_CAT } from '../../art/handdrawn/pet-cat';
import { PET_DOG } from '../../art/handdrawn/pet-dog';
import { PET_FRAME_COUNT, PET_FRAME_MS, type PetFacing, type PetKind, type PetPose } from '../../art/pets';
import { renderWorkTree, type WorkTreeStage } from '../../art/worktree';

const cache = new Map<string, Sprite>();

function toSprite(b: BufSprite): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = b.buf.w;
  canvas.height = b.buf.h;
  canvas.getContext('2d')!.putImageData(new ImageData(b.buf.data, b.buf.w, b.buf.h), 0, 0);
  return { canvas, ax: b.ax, ay: b.ay };
}

/** The reception's work tree at the requested stage. */
export function workTreeSprite(stage: WorkTreeStage): Sprite {
  const key = `tree|${stage}`;
  let s = cache.get(key);
  if (!s) cache.set(key, (s = toSprite(renderWorkTree(stage))));
  return s;
}

/**
 * Where each pose and view lives in the pet sheets (scripts/assets/handdrawn/pet-dog.png and pet-cat.png, drawn in
 * Pixelorama): one row per pose and view, one column per frame, each cell PET_CELL_W x PET_CELL_H. Sitting and sleeping
 * are always in profile.
 */
const SHEET_ROWS: readonly (readonly [PetPose, PetFacing])[] = [
  ['walk', 'side'], ['walk', 'down'], ['walk', 'up'], ['run', 'side'], ['run', 'down'], ['run', 'up'], ['sit', 'side'], ['sleep', 'side'],
];
const PET_CELL_W = 32;
const PET_CELL_H = 23;
/** Anchor of every cell: bottom center of the feet. */
const PET_AX = 16;
const PET_AY = 20;
const SHEETS: Readonly<Record<PetKind, PixelGrid>> = { dog: PET_DOG, cat: PET_CAT };
const sheets = new Map<PetKind, HTMLCanvasElement>();

function sheetCanvas(kind: PetKind): HTMLCanvasElement {
  let c = sheets.get(kind);
  if (!c) {
    const { w, h } = gridSize(SHEETS[kind]);
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paintGrid(c.getContext('2d')!, SHEETS[kind]);
    sheets.set(kind, c);
  }
  return c;
}

/** Pet sprite in the pose, with the frame taken from the time in the pose (`animT`, ms). */
export function petSprite(kind: PetKind, pose: PetPose, animT: number, left: boolean, facing: PetFacing = 'side'): Sprite {
  const frame = Math.floor(animT / PET_FRAME_MS[pose]) % PET_FRAME_COUNT[pose];
  const view: PetFacing = pose === 'sit' || pose === 'sleep' ? 'side' : facing;
  const key = `${kind}|${pose}|${frame}|${left ? 1 : 0}|${view}`;
  let s = cache.get(key);
  if (!s) {
    const row = SHEET_ROWS.findIndex(([p, f]) => p === pose && f === view);
    const canvas = document.createElement('canvas');
    canvas.width = PET_CELL_W;
    canvas.height = PET_CELL_H;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    if (left && view === 'side') {
      ctx.translate(PET_CELL_W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(sheetCanvas(kind), frame * PET_CELL_W, row * PET_CELL_H, PET_CELL_W, PET_CELL_H, 0, 0, PET_CELL_W, PET_CELL_H);
    cache.set(key, (s = { canvas, ax: PET_AX, ay: PET_AY }));
  }
  return s;
}
