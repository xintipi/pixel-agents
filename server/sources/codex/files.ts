// Files of a Codex folder (CODEX_HOME) that the source reads: the rollouts (sessions/YYYY/MM/DD/ and
// archived_sessions/) and the locks of loaded threads (thread-writer-locks/<thread>.lock). Read-only: nothing is
// created and the locks are only checked for EXISTENCE (opening with flock would hold the lock and break Codex).
// auth.json, config.toml, history.jsonl, shell_snapshots/, logs and the SQLite files are never opened.
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCodexState, metaFromLine, parseRolloutLine, type RolloutMeta } from './rollout';

/** rollout-<YYYY-MM-DDThh-mm-ss>-<thread>[_<rollout>].jsonl[.zst] (the `_<rollout>` is from a rolled-back thread). */
const ROLLOUT_FILE = /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_[0-9a-f-]{36})?\.jsonl(\.zst)?$/i;
const LOCK_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.lock$/i;

export const SESSIONS_DIR = 'sessions';
export const ARCHIVED_DIR = 'archived_sessions';
export const LOCKS_DIR = 'thread-writer-locks';

/** Thread and compression from the file name; undefined = not a rollout. */
export function parseRolloutName(name: string): { threadId: string; compressed: boolean } | undefined {
  const m = ROLLOUT_FILE.exec(name);
  return m ? { threadId: m[1].toLowerCase(), compressed: !!m[2] } : undefined;
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Folders with rollouts: the days of sessions/YYYY/MM/DD (newest to oldest: the folder is the conversation's CREATION
 * date) and archived_sessions/ last.
 */
export function rolloutDirs(home: string): string[] {
  const out: string[] = [];
  const desc = (names: string[], re: RegExp) => names.filter((n) => re.test(n)).sort((a, b) => b.localeCompare(a));
  const sessions = join(home, SESSIONS_DIR);
  for (const y of desc(listDir(sessions), /^\d{4}$/)) {
    for (const m of desc(listDir(join(sessions, y)), /^\d{2}$/)) {
      for (const d of desc(listDir(join(sessions, y, m)), /^\d{2}$/)) out.push(join(sessions, y, m, d));
    }
  }
  out.push(join(home, ARCHIVED_DIR));
  return out;
}

export interface LockInfo {
  threadId: string;
  /** Lock creation (Codex never writes to it: the mtime is the moment it was created). */
  createdAt: number;
}

/**
 * Locks of the threads loaded right now; null = the folder does not exist (Codex version without locks, or not mounted in
 * Docker). `.coordination.lock` and any other file are left out.
 */
export function readLocks(home: string): Map<string, LockInfo> | null {
  const dir = join(home, LOCKS_DIR);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  const out = new Map<string, LockInfo>();
  for (const name of names) {
    const m = LOCK_FILE.exec(name);
    if (!m) continue;
    try {
      const st = statSync(join(dir, name));
      const born = st.birthtimeMs > 0 ? Math.min(st.birthtimeMs, st.mtimeMs) : st.mtimeMs;
      out.set(m[1].toLowerCase(), { threadId: m[1].toLowerCase(), createdAt: born });
    } catch {
      // disappeared between the listing and the stat
    }
  }
  return out;
}

interface Found {
  path: string;
  mtimeMs: number;
}

/**
 * Where each thread's rollout is (by the id in the file name), with a cache. A resumed thread stays in the old
 * file (the folder is the creation one), so the lookup scans the folders by date; a rolled-back thread has more than one
 * file and the last modified one wins. The most recent days' folders are rechecked every 2 s and the
 * full scan, at most every 30 s.
 */
export class RolloutIndex {
  private paths = new Map<string, Found>();
  /** Threads whose only rollout is compressed (.jsonl.zst): cannot be read yet. */
  private compressedOnly = new Set<string>();
  private lastRecentScan = -Infinity;
  private lastFullScan = -Infinity;

  constructor(
    readonly home: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Path of the thread's (uncompressed) rollout; undefined = does not exist yet (or was not found). */
  find(threadId: string): string | undefined {
    const id = threadId.toLowerCase();
    const hit = this.paths.get(id);
    if (hit && !existsSync(hit.path)) this.paths.delete(id);
    const now = this.now();
    if (now - this.lastRecentScan >= 2_000) {
      this.lastRecentScan = now;
      this.scan(rolloutDirs(this.home).slice(0, 2));
    }
    if (now - this.lastFullScan >= 30_000) this.scanAll();
    return this.paths.get(id)?.path;
  }

  /** The thread only has a compressed rollout (.zst). */
  isCompressedOnly(threadId: string): boolean {
    return this.compressedOnly.has(threadId.toLowerCase()) && !this.paths.has(threadId.toLowerCase());
  }

  /** Reports where the rollout is (e.g.: a hook's `transcript_path`, already validated). */
  hint(threadId: string, path: string): void {
    try {
      this.paths.set(threadId.toLowerCase(), { path, mtimeMs: statSync(path).mtimeMs });
    } catch {
      // does not exist yet
    }
  }

  /** Full scan (no stat, except to break ties for a thread with more than one file). */
  scanAll(): void {
    this.lastFullScan = this.lastRecentScan = this.now();
    this.scan(rolloutDirs(this.home));
  }

  private scan(dirs: string[]): void {
    for (const dir of dirs) {
      for (const name of listDir(dir)) {
        const r = parseRolloutName(name);
        if (!r) continue;
        if (r.compressed) {
          this.compressedOnly.add(r.threadId);
          continue;
        }
        const path = join(dir, name);
        const prev = this.paths.get(r.threadId);
        if (prev?.path === path) continue;
        let mtimeMs = 0;
        try {
          mtimeMs = statSync(path).mtimeMs;
        } catch {
          continue;
        }
        if (prev) {
          try {
            prev.mtimeMs = statSync(prev.path).mtimeMs;
          } catch {
            prev.mtimeMs = -Infinity;
          }
        }
        if (!prev || mtimeMs >= prev.mtimeMs) this.paths.set(r.threadId, { path, mtimeMs });
      }
    }
  }

  /**
   * Rollouts modified in the last `maxAgeMs` (with a stat of each): presence in lockless mode. Updates the
   * path cache along the way.
   */
  recentlyModified(maxAgeMs: number): Array<{ threadId: string; path: string; mtimeMs: number }> {
    const now = this.now();
    const out = new Map<string, { threadId: string; path: string; mtimeMs: number }>();
    for (const dir of rolloutDirs(this.home)) {
      for (const name of listDir(dir)) {
        const r = parseRolloutName(name);
        if (!r || r.compressed) continue;
        const path = join(dir, name);
        let mtimeMs: number;
        try {
          mtimeMs = statSync(path).mtimeMs;
        } catch {
          continue;
        }
        const prev = this.paths.get(r.threadId);
        if (!prev || mtimeMs >= prev.mtimeMs) this.paths.set(r.threadId, { path, mtimeMs });
        if (now - mtimeMs > maxAgeMs) continue;
        const cur = out.get(r.threadId);
        if (!cur || mtimeMs > cur.mtimeMs) out.set(r.threadId, { threadId: r.threadId, path, mtimeMs });
      }
    }
    this.lastFullScan = this.lastRecentScan = now;
    return [...out.values()];
  }
}

// ------------------------------------------------------------------ start of the rollout

/** Maximum read past the end of the 1st line (session_meta carries the base instructions: tens of KB). */
export const META_MAX_BYTES = 4 * 1024 * 1024;
/** Chunk after session_meta read looking for the first instruction (the title). */
export const HEAD_SCAN_BYTES = 256 * 1024;

export interface RolloutHead {
  meta?: RolloutMeta;
  /** First instruction (already masked and truncated). */
  title?: string;
  firstAt?: number;
}

/** Reads `length` bytes starting at `start` (synchronous). */
function readRange(fd: number, start: number, length: number): Buffer {
  const buf = Buffer.alloc(Math.max(0, length));
  const n = length > 0 ? readSync(fd, buf, 0, length, start) : 0;
  return buf.subarray(0, n);
}

/**
 * The start of the rollout: session_meta (1st line) and the first instruction. The end window read when opening a long
 * session has neither.
 */
export function readRolloutHead(path: string): RolloutHead {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return {};
  }
  try {
    const chunks: Buffer[] = [];
    let pos = 0;
    let nl = -1;
    while (pos < META_MAX_BYTES) {
      const chunk = readRange(fd, pos, 64 * 1024);
      if (!chunk.length) break;
      const i = chunk.indexOf(0x0a);
      if (i !== -1) {
        chunks.push(chunk.subarray(0, i));
        nl = pos + i;
        break;
      }
      chunks.push(chunk);
      pos += chunk.length;
    }
    const first = Buffer.concat(chunks).toString('utf8');
    const head: RolloutHead = {};
    const meta = metaFromLine(first);
    if (meta) {
      head.meta = meta;
      if (meta.startedAt !== undefined) head.firstAt = meta.startedAt;
    }
    if (nl < 0) return head;
    const rest = readRange(fd, nl + 1, HEAD_SCAN_BYTES).toString('utf8').split('\n');
    rest.pop(); // the last line may have been cut
    const state = createCodexState(meta);
    const ctx = { idPrefix: '', now: 0, activities: false };
    for (const line of rest) {
      if (!line.trim()) continue;
      parseRolloutLine(state, line, ctx);
      if (state.title !== undefined) break;
    }
    if (state.title) head.title = state.title;
    if (head.firstAt === undefined && state.firstAt !== undefined) head.firstAt = state.firstAt;
    return head;
  } catch {
    return {};
  } finally {
    closeSync(fd);
  }
}
