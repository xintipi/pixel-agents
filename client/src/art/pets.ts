// Office pets in pixel art, in the same style as the characters (art/character): 5-tone ramps (cool
// shadows, warm highlights), parts stamped from a text drawing (stamp) and the dark outline at the end (outline).
// A corgi (tan and white, short legs, huge upright ears, fluffy white butt and a short little tail) and a
// British Longhair cat (blue-gray, chest ruff, round face, copper eyes and a feather-duster tail).
//
// Views: in profile facing right (left is the mirror), from the front ('down', coming toward the camera) and from
// behind ('up', heading to the back) — whoever walks vertically shows from the front or from behind, like the characters.
// Poses: walking and running (4 frames: the paws cross and the body rises mid-stride), sitting (2: the tail) and
// sleeping (2: breathing). Sitting and sleeping are always in profile. Anchor at the feet.
import { ramp } from './core/color';
import { PixelBuf, type Palette } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

export type PetKind = 'dog' | 'cat';
export type PetPose = 'walk' | 'run' | 'sit' | 'sleep';
/** Where the pet faces: in profile, from the front (down on screen) or from behind (up). */
export type PetFacing = 'side' | 'down' | 'up';

export const PET_POSES: readonly PetPose[] = ['walk', 'run', 'sit', 'sleep'];
export const PET_FACINGS: readonly PetFacing[] = ['side', 'down', 'up'];
/** Frames of each pose. */
export const PET_FRAME_COUNT: Readonly<Record<PetPose, number>> = { walk: 4, run: 4, sit: 2, sleep: 2 };
/** Duration of each frame (ms). */
export const PET_FRAME_MS: Readonly<Record<PetPose, number>> = { walk: 130, run: 85, sit: 420, sleep: 1300 };

const W = 28;
const H = 20;
/** Ground line (the feet stand on it). */
const FLOOR = 17;
/** Margin of the final sheet around the drawing area. */
const PAD_X = 2;
const PAD_Y = 3;

// Letters: o/O/H/d/D = fur (base, light, highlight, dark, darkest); w/W/v = white/cream (base, highlight, shadow);
// e = eye; E = eye highlight; k = pupil; n = nose; p = pink (ear, tongue); c/t = collar and tag.
function palette(fur: string, cream: string, extra: Record<string, string>): Palette {
  const f = ramp(fur, 0.09);
  const c = ramp(cream, 0.06);
  return { o: f.base, O: f.lt, H: f.hi, d: f.dk, D: f.dd, w: c.base, W: c.hi, v: c.dk, ...extra };
}

const CORGI = palette('#d9822f', '#f7ecdc', { e: '#2a1f26', E: '#fff6e8', n: '#2a1f26', p: '#e98f9c', c: '#3f78c4', t: '#f4c84a' });
const BRIT = palette('#8e97ab', '#d6dbe6', { e: '#e08a2c', E: '#ffd28a', k: '#2a2230', n: '#a7798a', p: '#d9a3b0' });

type Part = readonly string[];
const put = (b: PixelBuf, rows: Part, x: number, y: number, pal: Palette) => b.stamp(rows, x, y, pal);

/**
 * 4-frame stride: how far the near back paw and near front paw go forward (+) or back (−), and the bounce
 * of the body (rises on the frame where the paws cross). The far ones do the opposite.
 */
const GAIT: readonly { back: number; front: number; bob: number }[] = [
  { back: 1, front: -1, bob: 0 },
  { back: 0, front: 0, bob: -1 },
  { back: -1, front: 1, bob: 0 },
  { back: 0, front: 0, bob: -1 },
];

// ================================================================ corgi

/** Head in profile: big upright ears, white muzzle mask, black nose. 11×9. */
const CORGI_HEAD: Part = [
  '..oo..oo...',
  '..oOo.oOo..',
  '..oOo.oOo..',
  '.ooooooooo.',
  'ooooHooooo.',
  'oooooeEowww',
  'oooooooowwn',
  '.oowwwwwwwp',
  '..wwwwwww..',
];
/** Long, low body: tan back, white belly and butt. 15×6. */
const CORGI_BODY: Part = [
  '..oOOOOOOOOOoo.',
  '.ooooOoooooooow',
  'wooooooooooooww',
  'wwooooooooooww.',
  'wwwvwwwwwwwwvw.',
  '.wvvvvvvvvvvv..',
];
/** Short little paws with white socks: near and far. */
const CORGI_LEG: Part = ['oo', 'ww', 'ww'];
const CORGI_LEG_FAR: Part = ['dd', 'vv', 'vv'];

/** From the front: upright ears, white stripe down the middle of the face, white chest. 12×9 + body 10×4. */
const CORGI_FRONT_HEAD: Part = [
  '.oo......oo.',
  '.oOo....oOo.',
  '.oOoo..ooOo.',
  '.oooowwoooo.',
  'oooowwwwoooo',
  'ooeEowwoeEoo',
  'oooowwwwoooo',
  '.ooowwnwwoo.',
  '..owwwpwwo..',
];
const CORGI_FRONT_BODY: Part = ['..owwwwwo.', '.oowwwwwoo', '.oowwwwwoo', '.oovwwwvoo'];
/** From behind: the ears from the back, the back and the white butt with the little tail. 12×7 + body 10×6. */
const CORGI_BACK_HEAD: Part = [
  '.oo......oo.',
  '.oOo....oOo.',
  '.oOoo..ooOo.',
  '.oooooooooo.',
  'oooooOOooooo',
  'oooooooooooo',
  '.oooooooooo.',
];
const CORGI_BACK_BODY: Part = ['.oooOOooo.', 'oooooooooo', 'oooooooooo', 'oowwoowwoo', 'owwwwwwwwo', '.wwwvvwww.'];
/** Sitting in profile: rump on the ground, puffed white chest, front legs straight. 11×8. */
const CORGI_SIT: Part = [
  '....oooooo.',
  '...oooooooo',
  '..ooooooowo',
  '.oooooooowo',
  'woooooooww.',
  'wwooooo.ww.',
  'wwwvwww.ww.',
  '.vvvvvv.vv.',
];
/** Sleeping stretched out on its side, head resting on the paws. 18×6. */
const CORGI_SLEEP: Part = [
  '..........oo.oo...',
  '...oOOOOOoooooooo.',
  '.woooooooooooooooo',
  'wwooooooooooooooww',
  'wwwvwwwwwwwwwwwwwn',
  '.vvvvvvvvvvvvvvvv.',
];

function corgi(pose: PetPose, f: number, facing: PetFacing, b: PixelBuf): void {
  const P = CORGI;
  if (pose === 'sleep') {
    const up = f === 1 ? 1 : 0;
    put(b, CORGI_SLEEP, 4, FLOOR - 6 - up, P);
    // closed eye
    b.hline(18, 19, FLOOR - 4 - up, P.d!);
    return;
  }
  if (pose === 'sit') {
    const bx = 8;
    const by = FLOOR - 8;
    // little tail wagging
    put(b, f === 0 ? ['oo'] : ['o.', '.o'], bx - 2, by + 4 - f, P);
    put(b, CORGI_SIT, bx, by, P);
    put(b, CORGI_HEAD, bx + 4, by - 8, P);
    put(b, ['ccccc', '..t..'], bx + 6, by, P);
    return;
  }
  const g = GAIT[f % GAIT.length];
  const run = pose === 'run';
  const k = run ? 2 : 1;
  const bob = g.bob * (run ? 2 : 1);
  if (facing === 'down') {
    const bx = 9;
    const by = FLOOR - 5 + bob;
    // front paws alternating (one lifts 1 px)
    put(b, ['ww'], bx + 2, FLOOR - 1 - (g.front > 0 ? 1 : 0), P);
    put(b, ['ww'], bx + 6, FLOOR - 1 - (g.front < 0 ? 1 : 0), P);
    put(b, CORGI_FRONT_BODY, bx, by, P);
    put(b, CORGI_FRONT_HEAD, bx - 1, by - 9, P);
    put(b, ['cccccc'], bx + 2, by, P);
    return;
  }
  if (facing === 'up') {
    const bx = 9;
    const by = FLOOR - 6 + bob;
    put(b, ['oo'], bx + 1, FLOOR - 1 - (g.back > 0 ? 1 : 0), P);
    put(b, ['oo'], bx + 7, FLOOR - 1 - (g.back < 0 ? 1 : 0), P);
    put(b, CORGI_BACK_BODY, bx, by, P);
    put(b, CORGI_BACK_HEAD, bx - 1, by - 6, P);
    // little tail wagging
    b.set(bx + 4 + (f % 2), by + 3, P.O!);
    return;
  }
  const bx = 5;
  const by = FLOOR - 9 + bob;
  const legY = by + 6;
  // far paws (behind the body), body, near paws, head
  put(b, CORGI_LEG_FAR, bx + 3 - g.back * k, legY, P);
  put(b, CORGI_LEG_FAR, bx + 10 - g.front * k, legY, P);
  put(b, CORGI_BODY, bx, by, P);
  put(b, CORGI_LEG, bx + 2 + g.back * k, legY, P);
  put(b, CORGI_LEG, bx + 11 + g.front * k, legY, P);
  // short little tail (running, stretched)
  put(b, run ? ['oo'] : ['o', 'o'], bx - (run ? 2 : 1), by + (run ? 1 : 0), P);
  put(b, CORGI_HEAD, bx + 11, by - 7 + (run && f % 2 ? 1 : 0), P);
  put(b, ['ccc', '.t.'], bx + 12, by + 1, P);
}

// ================================================================ British Longhair

/** Head in profile: round and furry, small ears, copper eye, ruff below. 10×9. */
const BRIT_HEAD: Part = [
  '..o...o...',
  '.ooo.ooo..',
  'oooooooooo',
  'ooOHOooooo',
  'oooooeEoow',
  'ooooooooww',
  'ooooooowwn',
  '.owwwwwwww',
  '..wwvwwvw.',
];
/** Full, fluffy body, fringe of fur below. 14×7. */
const BRIT_BODY: Part = [
  '..oOOOOOOOOoo.',
  '.ooOoooOoooooo',
  'oooooooooooooo',
  'oooooooooooooo',
  'oowwwwwwwwwwoo',
  '.wvwvwwvwwvwo.',
  '..v.v..v.v....',
];
const BRIT_LEG: Part = ['oo', 'ww'];
const BRIT_LEG_FAR: Part = ['dd', 'vv'];
/** Feather-duster tail: plumed, upright with a curved tip (walking) or back (running). */
const BRIT_TAIL_UP: Part = ['.ooo', 'ooOo', 'oOo.', 'ooo.', 'oo..', 'oo..'];
const BRIT_TAIL_BACK: Part = ['.oooo', 'ooOoo', '.ooo.'];

/** From the front: round face, big copper eyes, white ruff. 12×9 + body 12×5. */
const BRIT_FRONT_HEAD: Part = [
  '.o........o.',
  '.oo......oo.',
  '.oooooooooo.',
  'oooOHooooooo',
  'ooeEkooeEkoo',
  'ooeeeooeeeoo',
  'ooooonnooooo',
  '.oowwwwwwoo.',
  '.owwwvvwwwo.',
];
const BRIT_FRONT_BODY: Part = ['.owwwwwwwwo.', 'oowwwwwwwwoo', 'ooowwwwwwooo', '.ooovwwvooo.', '..ww....ww..'];
/** From behind: round head, little ears, the feather-duster tail upright over the back. */
const BRIT_BACK_HEAD: Part = ['.o........o.', '.oo......oo.', '.oooooooooo.', 'oooOHooooooo', 'oooooooooooo', '.oooooooooo.'];
const BRIT_BACK_BODY: Part = ['.oooooooooo.', 'oooooooooooo', 'oooOoooOoooo', 'oooooooooooo', '.oooooooooo.', '..dd....dd..'];
/** Sitting in profile: a round loaf of fur, ruff on the chest, paws together. 10×9. */
const BRIT_SIT: Part = [
  '...oooooo.',
  '..oooooooo',
  '.ooooooowo',
  'oooOoooowo',
  'oooooooowo',
  'ooooooowwo',
  'oooooooww.',
  '.oooooo.ww',
  '..vvvvv.vv',
];
/** Sleeping curled up: a ball of fur with the tail wrapped around. 16×6. */
const BRIT_SLEEP: Part = [
  '.....oOOOoo..o.o',
  '...oooooooooooo.',
  '..oooooooooooooo',
  '.ooooooooooooowo',
  '.oOOOOOOooooowwn',
  '..oooooooovvvvv.',
];

function brit(pose: PetPose, f: number, facing: PetFacing, b: PixelBuf): void {
  const P = BRIT;
  if (pose === 'sleep') {
    const up = f === 1 ? 1 : 0;
    put(b, BRIT_SLEEP, 6, FLOOR - 6 - up, P);
    b.hline(18, 19, FLOOR - 3 - up, P.D!);
    return;
  }
  if (pose === 'sit') {
    const bx = 9;
    const by = FLOOR - 9;
    // feather-duster tail curled on the ground, the tip sways
    put(b, f === 0 ? ['....oo', 'oooooo', '.oooo.'] : ['.....o', 'ooooo.', '.oooo.'], bx - 6, by + 6, P);
    put(b, BRIT_SIT, bx, by, P);
    put(b, BRIT_HEAD, bx + 2, by - 7, P);
    return;
  }
  const g = GAIT[f % GAIT.length];
  const run = pose === 'run';
  const k = run ? 2 : 1;
  const bob = g.bob * (run ? 2 : 1);
  if (facing === 'down') {
    const bx = 8;
    const by = FLOOR - 5 + bob;
    put(b, BRIT_FRONT_BODY, bx, by, P);
    // the front paws take turns (one disappears behind the ruff)
    if (g.front > 0) b.set(bx + 2, FLOOR - 1, P.v!);
    if (g.front < 0) b.set(bx + 9, FLOOR - 1, P.v!);
    put(b, BRIT_FRONT_HEAD, bx, by - 8, P);
    return;
  }
  if (facing === 'up') {
    const bx = 8;
    const by = FLOOR - 6 + bob;
    put(b, BRIT_BACK_BODY, bx, by, P);
    put(b, BRIT_BACK_HEAD, bx, by - 5, P);
    // the tail upright, swaying from side to side
    put(b, ['.oo.', 'oOoo', 'oOoo', 'oooo', '.dd.', '.dd.'], bx + 4 + (f % 2 ? 1 : -1), by - 10, P);
    return;
  }
  const bx = 7;
  const by = FLOOR - 9 + bob;
  const legY = by + 6;
  put(b, BRIT_LEG_FAR, bx + 3 - g.back * k, legY, P);
  put(b, BRIT_LEG_FAR, bx + 9 - g.front * k, legY, P);
  if (run) put(b, BRIT_TAIL_BACK, bx - 5, by, P);
  else put(b, BRIT_TAIL_UP, bx - 3, by - 5, P);
  put(b, BRIT_BODY, bx, by, P);
  put(b, BRIT_LEG, bx + 2 + g.back * k, legY + 1, P);
  put(b, BRIT_LEG, bx + 10 + g.front * k, legY + 1, P);
  put(b, BRIT_HEAD, bx + 10, by - 6 + (run && f % 2 ? 1 : 0), P);
}

/**
 * Pet sprite in the requested pose, frame and view (in profile facing right; `left` mirrors; sitting and
 * sleeping are always in profile).
 */
export function renderPet(kind: PetKind, pose: PetPose, frame: number, left = false, facing: PetFacing = 'side'): BufSprite {
  const n = PET_FRAME_COUNT[pose];
  const f = ((Math.floor(frame) % n) + n) % n;
  const view: PetFacing = pose === 'sit' || pose === 'sleep' ? 'side' : facing;
  const inner = new PixelBuf(W, H);
  if (kind === 'dog') corgi(pose, f, view, inner);
  else brit(pose, f, view, inner);
  // sheet with a margin (ears, tail and the outline never touch the edge)
  const b = new PixelBuf(W + 2 * PAD_X, H + PAD_Y);
  b.draw(inner, PAD_X, PAD_Y);
  b.outline();
  const buf = left && view === 'side' ? b.flipped() : b;
  return { buf, ax: (W + 2 * PAD_X) / 2, ay: FLOOR + PAD_Y };
}
