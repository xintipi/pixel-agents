// Sprites dos bichos (art/pets.ts) em canvas, com cache por bicho, pose, quadro e lado.
import type { Sprite } from '../../art/api';
import { PET_FRAMES, PET_FRAME_MS, renderPet, type PetKind, type PetPose } from '../../art/pets';

const cache = new Map<string, Sprite>();

/** Sprite do bicho na pose, com o quadro tirado do tempo na pose (`animT`, ms). */
export function petSprite(kind: PetKind, pose: PetPose, animT: number, left: boolean): Sprite {
  const frame = Math.floor(animT / PET_FRAME_MS[pose]) % PET_FRAMES;
  const key = `${kind}|${pose}|${frame}|${left ? 1 : 0}`;
  let s = cache.get(key);
  if (!s) {
    const { buf, ax, ay } = renderPet(kind, pose, frame, left);
    const canvas = document.createElement('canvas');
    canvas.width = buf.w;
    canvas.height = buf.h;
    canvas.getContext('2d')!.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    cache.set(key, (s = { canvas, ax, ay }));
  }
  return s;
}
