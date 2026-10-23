// Moths (thiêu thân) fluttering around the lit bulbs of the street lamp posts and of the hủ tiếu cart at night: a few
// pale specks per bulb in small, wobbly orbits that speed up, dart in and out and flap (1 or 2 px wide); the ones
// close to the bulb are lit by it, the others fade into the dark. The path is a pure function of time (no state, no
// allocation per frame); the lighting draws them in its glow pass, only for bulbs in view.
import { mulberry32 } from '../../../../shared/hash';

/** One moth's orbit (all fixed by the seed). */
export interface Moth {
  /** Orbit radius (px). */
  r: number;
  /** Vertical squash of the orbit (the 3/4 view: the far side is above the bulb). */
  ry: number;
  /** Angular speed (rad/s, the sign is the direction). */
  w: number;
  ph: number;
  /** Jitter frequencies (the erratic flutter). */
  jx: number;
  jy: number;
  /** Wing beats per second. */
  flap: number;
}

/** Offset of a moth from its bulb at a given instant; `front` is the near half of the orbit. */
export interface MothPos {
  dx: number;
  dy: number;
  front: boolean;
  wings: boolean;
}

const SETS = 8;
const PER_SET = 5;
const sets: Moth[][] = [];

/** Orbit parameters of `n` moths from `seed` (deterministic). */
export function makeMoths(seed: number, n: number): Moth[] {
  const rng = mulberry32(seed);
  const out: Moth[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      r: 3.5 + rng() * 6,
      ry: 0.55 + rng() * 0.35,
      w: (rng() < 0.5 ? -1 : 1) * (2.2 + rng() * 2.6),
      ph: rng() * Math.PI * 2,
      jx: 0.7 + rng() * 0.8,
      jy: 0.7 + rng() * 0.8,
      flap: 9 + rng() * 7,
    });
  }
  return out;
}

/**
 * Where moth `m` is at `t` (s), written into `out`: an elliptical orbit whose speed surges and whose radius breathes
 * (darting in to the bulb and back out), plus a fast jitter. Bounded by `r + 1.5` horizontally and `r·ry + 1.5`
 * vertically (times `scale`).
 */
export function mothOffset(m: Moth, t: number, scale: number, out: MothPos): MothPos {
  const a = m.ph + t * m.w + 0.9 * Math.sin(t * Math.abs(m.w) * 0.7 + m.ph);
  const rr = m.r * (0.62 + 0.38 * Math.sin(t * 1.9 * m.jx + m.ph * 2));
  const s = Math.sin(a);
  out.dx = (Math.cos(a) * rr + Math.sin(t * 13 * m.jx + m.ph) * 1.5) * scale;
  out.dy = (s * rr * m.ry + Math.sin(t * 11 * m.jy + m.ph * 3) * 1.5) * scale;
  out.front = s > 0;
  out.wings = Math.sin(t * m.flap * Math.PI * 2) > 0;
  return out;
}

/** The moths of one bulb: one of a few fixed sets, picked by the bulb's position. */
function mothSet(key: number): Moth[] {
  const i = ((key % SETS) + SETS) % SETS;
  return (sets[i] ??= makeMoths(0x307e + i * 977, PER_SET));
}

const pos: MothPos = { dx: 0, dy: 0, front: false, wings: false };
/** Pale wing color by how close to the bulb (lit, half-lit, in the dark). */
const SHADES = ['#fff6d2', '#e2d6b8', '#9c9282'] as const;

export interface SwarmOpts {
  /** How many moths (up to 5). */
  count: number;
  /** Orbit scale (the cart's bulb is small). */
  scale: number;
  /** Half-size of the lamp head around the bulb (moths behind it are hidden); 0 = nothing hides them. */
  head: number;
}

/**
 * Draws the moths around a bulb at (bx, by) world px, `k` 0–1 the strength of the night. Uses 'source-over' and
 * leaves the composite operation and alpha as it found them.
 */
export function drawMothSwarm(ctx: CanvasRenderingContext2D, bx: number, by: number, now: number, k: number, opts: SwarmOpts): void {
  const key = Math.round(bx * 7 + by * 13);
  const set = mothSet(key);
  const t = now / 1000 + (key % 97);
  const op = ctx.globalCompositeOperation;
  const alpha = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'source-over';
  const n = Math.min(set.length, opts.count);
  for (let i = 0; i < n; i++) {
    const m = set[i];
    mothOffset(m, t, opts.scale, pos);
    // behind the lamp head: hidden
    if (!pos.front && opts.head && Math.abs(pos.dx) < opts.head && pos.dy > -opts.head && pos.dy < 2) continue;
    const d = Math.hypot(pos.dx, pos.dy) / opts.scale;
    const shade = d < 4.5 ? 0 : d < 8 ? 1 : 2;
    ctx.globalAlpha = k * (shade === 2 ? 0.7 : 0.95);
    ctx.fillStyle = SHADES[shade];
    const x = Math.round(bx + pos.dx);
    const y = Math.round(by + pos.dy);
    // wings open: 2 px wide; closed: a single speck
    ctx.fillRect(pos.wings ? x - 1 : x, y, pos.wings ? 2 : 1, 1);
  }
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = alpha;
}

/** Bulb of a street lamp post (the lamp sprite's lit underside) relative to the prop's anchor. */
export const LAMP_BULB_DY = -29;
/** Bulb hanging on the hủ tiếu cart's little post, relative to the cart's anchor (props.ts hutieuCartSprite). */
export const HUTIEU_BULB = { dx: 5, dy: -41 } as const;
