// Pet sprites (art/pets.ts) on canvas, cached per pet, pose, frame and side.
import type { Sprite } from '../../art/api';
import type { BufSprite } from '../../art/core/sprite';
import { PET_FRAME_COUNT, PET_FRAME_MS, renderPet, type PetFacing, type PetKind, type PetPose } from '../../art/pets';
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

/** Pet sprite in the pose, with the frame taken from the time in the pose (`animT`, ms). */
export function petSprite(kind: PetKind, pose: PetPose, animT: number, left: boolean, facing: PetFacing = 'side'): Sprite {
  const frame = Math.floor(animT / PET_FRAME_MS[pose]) % PET_FRAME_COUNT[pose];
  const key = `${kind}|${pose}|${frame}|${left ? 1 : 0}|${facing}`;
  let s = cache.get(key);
  if (!s) {
    const { buf, ax, ay } = renderPet(kind, pose, frame, left, facing);
    const canvas = document.createElement('canvas');
    canvas.width = buf.w;
    canvas.height = buf.h;
    canvas.getContext('2d')!.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    cache.set(key, (s = { canvas, ax, ay }));
  }
  return s;
}
