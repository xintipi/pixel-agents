// Flappy mini game (the lounge TV): the rules, with no drawing. One input: flap. `update(dt)` takes seconds.
// Local only: the best score lives in localStorage ('habblaud:flappy'), nothing here goes to the server or to Habblaud World.

export const FLAPPY_KEY = 'habblaud:flappy';

/** The picture is 320 x 180; the ground starts at GROUND_Y. */
export const W = 320;
export const H = 180;
export const GROUND_Y = 156;

export const BIRD_X = 84;
/** Radius of the bird's hitbox (the drawing is a little bigger, so a graze is forgiven). */
export const BIRD_R = 5;
export const PIPE_W = 28;
export const GAP = 56;
/** Distance between two pipes (left edge to left edge), in px. */
export const SPACING = 118;
/** The least a pipe shows above or below its gap. */
const MARGIN = 18;
/**
 * The most the gap's centre moves from one pipe to the next. The bird covers SPACING px in SPACING / SPEED = 1.3 s: it climbs
 * ~37 px with a single flap (and a flap every 0.2 s climbs far more) and falls ~50 px in 0.35 s, so 48 px either way is always makable.
 */
export const MAX_SHIFT = 48;

const GRAVITY = 820;
const FLAP = -245;
const MAX_FALL = 320;
export const SPEED = 92;
/** The longest step the physics takes: a tab that was hidden and comes back must not teleport the bird through a pipe. */
export const MAX_DT = 1 / 30;
/** After dying, presses are ignored for this long, so the flap that killed the bird doesn't skip the result. */
export const RESTART_LOCK = 0.6;
const READY_Y = 84;

export type Phase = 'ready' | 'playing' | 'dead';

export interface Pipe {
  /** Left edge (px). */
  x: number;
  /** Centre of the gap (px). */
  gapY: number;
  scored: boolean;
}

/** Highest and lowest centre a gap can have: every pipe shows at least MARGIN px above and below it. */
export const GAP_MIN = MARGIN + GAP / 2;
export const GAP_MAX = GROUND_Y - MARGIN - GAP / 2;

/** The gap centre of the next pipe: near the previous one (never more than MAX_SHIFT away), always inside the range. */
export function nextGap(prev: number | null, rnd: () => number): number {
  const lo = prev === null ? GAP_MIN : Math.max(GAP_MIN, prev - MAX_SHIFT);
  const hi = prev === null ? GAP_MAX : Math.min(GAP_MAX, prev + MAX_SHIFT);
  return Math.round(lo + rnd() * (hi - lo));
}

export class Flappy {
  phase: Phase = 'ready';
  /** Seconds in the current phase. */
  t = 0;
  y = READY_Y;
  vy = 0;
  score = 0;
  best: number;
  /** The last death set a new best score. */
  newBest = false;
  pipes: Pipe[] = [];
  /** How far the ground and the scenery have scrolled (px). */
  scroll = 0;

  constructor(
    best = 0,
    private readonly rnd: () => number = Math.random,
    /** The little hover of the bird before the first flap (off with reduced motion). */
    private readonly bob = true,
  ) {
    this.best = best;
  }

  private reset(): void {
    this.phase = 'ready';
    this.t = 0;
    this.y = READY_Y;
    this.vy = 0;
    this.score = 0;
    this.newBest = false;
    this.pipes = [];
  }

  /** Flap, or start, or (after the short lock) go back to the start. */
  press(): void {
    switch (this.phase) {
      case 'ready':
        this.phase = 'playing';
        this.t = 0;
        this.vy = FLAP;
        this.pipes = [{ x: W + 40, gapY: nextGap(null, this.rnd), scored: false }];
        this.fill();
        break;
      case 'playing':
        this.vy = FLAP;
        break;
      case 'dead':
        if (this.t >= RESTART_LOCK) this.reset();
        break;
    }
  }

  /** Keeps pipes coming in from the right edge. */
  private fill(): void {
    for (;;) {
      const last = this.pipes[this.pipes.length - 1];
      if (last.x + SPACING > W + SPACING) return;
      this.pipes.push({ x: last.x + SPACING, gapY: nextGap(last.gapY, this.rnd), scored: false });
    }
  }

  update(rawDt: number): void {
    const dt = Math.min(MAX_DT, Math.max(0, rawDt));
    this.t += dt;
    if (this.phase === 'ready') {
      this.scroll += SPEED * 0.5 * dt;
      this.y = READY_Y + (this.bob ? Math.sin(this.t * 4) * 3 : 0);
      return;
    }
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    this.y += this.vy * dt;
    if (this.phase === 'dead') {
      if (this.y > GROUND_Y - BIRD_R) {
        this.y = GROUND_Y - BIRD_R;
        this.vy = 0;
      }
      return;
    }
    this.scroll += SPEED * dt;
    for (const p of this.pipes) p.x -= SPEED * dt;
    while (this.pipes.length && this.pipes[0].x + PIPE_W < 0) this.pipes.shift();
    this.fill();
    for (const p of this.pipes) {
      if (!p.scored && p.x + PIPE_W / 2 < BIRD_X) {
        p.scored = true;
        this.score++;
      }
    }
    if (this.hits()) this.die();
  }

  /** The bird touches a pipe, the ground or the ceiling. */
  hits(): boolean {
    if (this.y + BIRD_R >= GROUND_Y || this.y - BIRD_R <= 0) return true;
    return this.pipes.some(
      (p) =>
        BIRD_X + BIRD_R > p.x &&
        BIRD_X - BIRD_R < p.x + PIPE_W &&
        (this.y - BIRD_R < p.gapY - GAP / 2 || this.y + BIRD_R > p.gapY + GAP / 2),
    );
  }

  private die(): void {
    this.phase = 'dead';
    this.t = 0;
    this.y = Math.min(Math.max(this.y, BIRD_R), GROUND_Y - BIRD_R);
    this.vy = Math.min(this.vy, 0);
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
    }
  }
}

// ------------------------------------------------------------------ save

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The saved best score; anything missing, corrupted or absurd reads as 0. */
export function loadBest(store: Store | null): number {
  try {
    const n: unknown = JSON.parse(store?.getItem(FLAPPY_KEY) ?? 'null');
    return typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 100_000 ? n : 0;
  } catch {
    return 0;
  }
}

/** Saves the best score, only if it beats what is stored (a lower number never overwrites it). */
export function saveBest(store: Store | null, best: number): void {
  try {
    if (best > loadBest(store)) store?.setItem(FLAPPY_KEY, JSON.stringify(best));
  } catch {
    // storage full or blocked: the game goes on, it just isn't remembered
  }
}
