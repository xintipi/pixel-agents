// Bichos do escritório em pixel art, no mesmo traço dos personagens (art/character): rampas de 5 tons (sombras
// frias, brilhos quentes), partes carimbadas de um desenho em texto (stamp) e o contorno escuro no fim (outline).
// Um cachorro caramelo de orelhas caídas e um gato laranja rajado, de perfil olhando para a direita (a esquerda é
// o espelho). Poses: andando (2 quadros), correndo (2, passada larga), sentado (2, o rabo abanando ou a ponta
// balançando) e dormindo (2, a respiração). Âncora nos pés, como os personagens (uns 13 px de altura: metade deles).
import { ramp } from './core/color';
import { PixelBuf, type Palette } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

export type PetKind = 'dog' | 'cat';
export type PetPose = 'walk' | 'run' | 'sit' | 'sleep';

export const PET_POSES: readonly PetPose[] = ['walk', 'run', 'sit', 'sleep'];
export const PET_FRAMES = 2;
/** Duração de cada quadro (ms). */
export const PET_FRAME_MS: Readonly<Record<PetPose, number>> = { walk: 170, run: 110, sit: 420, sleep: 1300 };

const W = 28;
const H = 18;
/** Linha do chão (os pés ficam em cima dela). */
const FLOOR = 16;

// Letras das partes: o/O/H/d/D = pelo (base, claro, brilho, escuro, mais escuro); w/W = pelo claro da barriga e do
// focinho; e = olho; E = brilho do olho; n = nariz; p = rosa (orelha, língua); c/t = coleira e plaquinha;
// s = listra (gato); g = íris verde (gato).
function palette(fur: string, cream: string, extra: Record<string, string>): Palette {
  const f = ramp(fur, 0.09);
  const c = ramp(cream, 0.06);
  return { o: f.base, O: f.lt, H: f.hi, d: f.dk, D: f.dd, w: c.base, W: c.hi, ...extra };
}

const DOG_PAL = palette('#d2914c', '#f6e6c9', { e: '#2b2230', E: '#fff4e6', n: '#2b2230', p: '#e49aa4', c: '#d9484f', t: '#f4c84a' });
const CAT_PAL = palette('#ee9d48', '#fbeedb', { e: '#1f2a1f', g: '#5fc26a', n: '#e57b8e', p: '#f0a6b0', s: '#c0692a' });

type Part = readonly string[];

const stamp = (b: PixelBuf, rows: Part, x: number, y: number, pal: Palette) => b.stamp(rows, x, y, pal);

// ---------------------------------------------------------------- cachorro

/** Cabeça de perfil: orelha caída atrás, focinho claro, nariz na ponta. 10×8. */
const DOG_HEAD: Part = [
  '...oooo...',
  '..oOHHoo..',
  '.doOOoooo.',
  '.doOoEoww.',
  'ddooooewww',
  'ddooooowwn',
  '.ddoooowwp',
  '..ddooooo.',
];
/** Corpo andando: lombo com brilho, barriga clara, parte de baixo na sombra. 14×7. */
const DOG_BODY: Part = [
  '..oOOOOOOoo...',
  '.oOOOoooooooo.',
  '.ooooooooooooo',
  '.ooooooooooooo',
  '..dowwwwwwwood',
  '..ddwwwwwwwodd',
  '...dddddddddd.',
];
/** Rabo levantado em gancho (andando) e esticado (correndo). */
const DOG_TAIL_UP: Part = ['.oo', 'oO.', 'o..', 'd..'];
const DOG_TAIL_BACK: Part = ['oooo', 'ddd.'];
/** Pernas: perto (pelo) e longe (sombra), 2×3 com a pata mais escura. */
const LEG_NEAR: Part = ['oo', 'oo', 'dd'];
const LEG_FAR: Part = ['dd', 'dd', 'DD'];
/** Sentado: garupa redonda, peito claro, patas da frente retas. 12×8. */
const DOG_SIT_BODY: Part = [
  '....oooooo..',
  '...ooooooooo',
  '..oooooowwoo',
  '.ooooooowwoo',
  '.oooooodwwdo',
  'oooooood.wwd',
  'ooooodd..ww.',
  'ddddd....dd.',
];
/** Dormindo enrolado: cabeça pousada à direita, rabo dando a volta na frente. 16×7. */
const DOG_SLEEP: Part = [
  '......ooooo.....',
  '....ooOOOooooo..',
  '...oooooooooodo.',
  '..ooooooooooodoo',
  '.dowwwwwwwwooDwn',
  '.oodwwwwwwwoooww',
  '..dddddddddddd..',
];

function dog(pose: PetPose, f: number, b: PixelBuf): void {
  const P = DOG_PAL;
  if (pose === 'sleep') {
    stamp(b, DOG_SLEEP, 5, FLOOR - 7 - f, P);
    // o rabo na frente sobe junto com a barriga
    b.set(6, FLOOR - 2 - f, P.O!);
    b.set(5, FLOOR - 3 - f, P.o!);
    return;
  }
  if (pose === 'sit') {
    const bx = 7;
    const by = FLOOR - 8;
    // rabo no chão abanando (quadro 0 para trás, 1 levantado)
    if (f === 0) stamp(b, ['.ooo', 'ddd.'], bx - 4, by + 6, P);
    else stamp(b, ['oo.', '.oo', '.dd'], bx - 3, by + 4, P);
    stamp(b, DOG_SIT_BODY, bx, by, P);
    stamp(b, DOG_HEAD, bx + 5, by - 7, P);
    // coleira no pescoço, com a plaquinha
    stamp(b, ['cccccc', '..t...'], bx + 6, by, P);
    return;
  }
  const run = pose === 'run';
  const bob = run && f === 1 ? -1 : 0;
  const bx = 5;
  const by = FLOOR - 10 + bob;
  // pernas longe primeiro (atrás do corpo), depois o corpo, as pernas perto e a cabeça
  const spread = run ? 2 : 1;
  const legY = by + 6;
  const farB = f === 0 ? bx + 4 + spread : bx + 3;
  const farF = f === 0 ? bx + 9 - spread : bx + 10;
  const nearB = f === 0 ? bx + 2 : bx + 3 + spread;
  const nearF = f === 0 ? bx + 11 : bx + 10 - spread;
  stamp(b, LEG_FAR, farB, legY + (run ? 0 : 1), P);
  stamp(b, LEG_FAR, farF, legY + (run ? 0 : 1), P);
  stamp(b, DOG_BODY, bx, by, P);
  stamp(b, LEG_NEAR, nearB, legY + 1, P);
  stamp(b, LEG_NEAR, nearF, legY + 1, P);
  if (run) stamp(b, DOG_TAIL_BACK, bx - 3, by + 1, P);
  else stamp(b, DOG_TAIL_UP, bx - 1, by - 3, P);
  stamp(b, DOG_HEAD, bx + 10, by - 5 + (run && f === 1 ? 1 : 0), P);
  stamp(b, ['ccc', '.t.'], bx + 11, by + 2, P);
}

// ---------------------------------------------------------------- gato

/** Cabeça de perfil: orelhas pontudas com o rosa por dentro, olho verde, focinho claro e narizinho rosa. 9×7. */
const CAT_HEAD: Part = [
  '.o.....o.',
  '.po...po.',
  '.ooooooo.',
  'oooOooooo',
  'ooooogeww',
  'oooooooww',
  '.ooooowwn',
];
/** Corpo andando com as listras no lombo. 12×5. */
const CAT_BODY: Part = [
  '.oOsOOsOOso.',
  'oooooooooooo',
  'osooosooosoo',
  '.owwwwwwwwo.',
  '..dddddddd..',
];
/** Rabo comprido subindo em gancho, com anéis. */
const CAT_TAIL_UP: Part = ['.oo', 'os.', 'o..', 's..', 'o..'];
const CAT_TAIL_BACK: Part = ['osoos'];
const CAT_LEG_NEAR: Part = ['o', 'o', 'd'];
const CAT_LEG_FAR: Part = ['d', 'd', 'D'];
/** Sentado, bem ereto: peito claro, patas juntas. 8×8. */
const CAT_SIT_BODY: Part = [
  '..oooo..',
  '.osooso.',
  '.oowwoo.',
  'oooWwoo.',
  'osowwoso',
  'ooowwooo',
  'ooo.wo.o',
  'ddd.dd.d',
];
/** Dormindo de pãozinho: listras no lombo, rabo abraçando o corpo. 14×6. */
const CAT_SLEEP: Part = [
  '....osoosoo...',
  '..oooooooooooo',
  '.oosooosooodoo',
  '.ooooooooooown',
  '.dswwwwwwwooww',
  '..dsosoosdddd.',
];

function cat(pose: PetPose, f: number, b: PixelBuf): void {
  const P = CAT_PAL;
  if (pose === 'sleep') {
    stamp(b, CAT_SLEEP, 6, FLOOR - 6 - f, P);
    return;
  }
  if (pose === 'sit') {
    const bx = 9;
    const by = FLOOR - 8;
    // rabo no chão: a ponta balança
    if (f === 0) stamp(b, ['....s', 'osoos'], bx - 5, by + 6, P);
    else stamp(b, ['...s.', 'osoo.'], bx - 5, by + 6, P);
    stamp(b, CAT_SIT_BODY, bx, by, P);
    stamp(b, CAT_HEAD, bx + 2, by - 6, P);
    return;
  }
  const run = pose === 'run';
  const bob = run && f === 1 ? -1 : 0;
  const bx = 7;
  const by = FLOOR - 8 + bob;
  const spread = run ? 2 : 1;
  const legY = by + 4;
  const farB = f === 0 ? bx + 3 + spread : bx + 2;
  const farF = f === 0 ? bx + 8 - spread : bx + 9;
  const nearB = f === 0 ? bx + 1 : bx + 2 + spread;
  const nearF = f === 0 ? bx + 10 : bx + 9 - spread;
  stamp(b, CAT_LEG_FAR, farB, legY, P);
  stamp(b, CAT_LEG_FAR, farF, legY, P);
  stamp(b, CAT_BODY, bx, by, P);
  stamp(b, CAT_LEG_NEAR, nearB, legY + 1, P);
  stamp(b, CAT_LEG_NEAR, nearF, legY + 1, P);
  if (run) stamp(b, CAT_TAIL_BACK, bx - 5, by + 1, P);
  else stamp(b, CAT_TAIL_UP, bx - 2, by - 4, P);
  stamp(b, CAT_HEAD, bx + 9, by - 4 + (run && f === 1 ? 1 : 0), P);
}

/** Sprite do bicho na pose e quadro pedidos (olhando para a direita; `left` espelha). */
export function renderPet(kind: PetKind, pose: PetPose, frame: number, left = false): BufSprite {
  const f = ((Math.floor(frame) % PET_FRAMES) + PET_FRAMES) % PET_FRAMES;
  const b = new PixelBuf(W, H);
  if (kind === 'dog') dog(pose, f, b);
  else cat(pose, f, b);
  b.outline();
  const buf = left ? b.flipped() : b;
  return { buf, ax: W / 2, ay: FLOOR };
}
