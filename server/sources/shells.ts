// Shells that a session's agents are waiting on: background Bash (run_in_background, or
// sent to the background mid-execution), foreground Bash still without a result, and Monitor.
//
// One tracker per session (main + subagents): the completion notification of a shell fired
// by a subagent may arrive in the main agent's transcript, and vice versa. Jobs are indexed by the
// tool_use id; the background task id ("bo0ov3q3l") arrives in the tool_result.
//
// Completion: <task-notification> (queue-operation 'enqueue', user message or attachment) matching task-id
// or tool-use-id; TaskStop/KillShell/KillBash with the id; end of turn/interruption (foreground ones
// only); /clear or session ended (tracker discarded); age.
import type { ShellJob } from '../../shared/types';
import type { ShellOutcome } from '../../shared/activity';

/** Jobs older than this are discarded (the process has certainly died or the notification was lost). */
export const SHELL_MAX_AGE_MS = 24 * 3_600_000;
/** "idle" registry + background shell without a notification for less than this = 'shell' status (old CLIs). */
export const SHELL_FALLBACK_MAX_AGE_MS = 12 * 3_600_000;
/** Monitor: expires on its own after timeout_ms (default 5 min, cap 1 h) + this grace period. */
const MONITOR_DEFAULT_TIMEOUT_MS = 300_000;
const MONITOR_MAX_TIMEOUT_MS = 3_600_000;
const EXPIRY_GRACE_MS = 60_000;
/** Tolerance between the transcript's clock and the process start in the registry. */
const PROCESS_START_SLACK_MS = 2_000;
/** Ended ids kept (so as not to resurrect a job when rereading the transcript or merging the start of the file). */
const MAX_ENDED = 2_000;
/** A repeated notification (queue -> message) up to this long after the end is still "the same completion". */
const RECENT_END_MS = 120_000;

/** Start of a Bash/Monitor seen in the transcript. */
export interface ShellStart {
  toolUseId: string;
  label: string;
  command?: string;
  /** run_in_background (Bash) or Monitor. */
  background: boolean;
  kind: 'shell' | 'monitor';
  /** Epoch ms of the tool_use. */
  at: number;
  /** Monitor's timeout_ms (expiry). */
  timeoutMs?: number;
}

export interface TrackedShell {
  owner: string;
  toolUseId: string;
  taskId?: string;
  label: string;
  command?: string;
  background: boolean;
  kind: 'shell' | 'monitor';
  /** Start shown (the real launch, when the tool_result of a background job arrives). */
  startedAt: number;
  /** When the tool_use was written (basis for the "before the current process" filter). */
  requestedAt: number;
  timeoutMs?: number;
  /** Foreground waiting for approval: does not show and its clock does not run. */
  held?: boolean;
}

export interface ShellFinish {
  job: TrackedShell;
  outcome: ShellOutcome;
  at: number;
  summary?: string;
}

export interface ShellRef {
  toolUseId?: string;
  taskId?: string;
}

const OK = /^(completed?|success|succeeded|done|finished|exited)$/i;
const FAILED = /^(failed|failure|error|errored|timeout|timed[_ -]?out)$/i;
const KILLED = /^(killed|stopped|cancell?ed|aborted|interrupted|terminated)$/i;

/**
 * Result of a notification: undefined = not terminal (e.g.: a Monitor event). Without a status,
 * a shell (Bash) only sends one notification — the final one; a Monitor sends one per event.
 */
export function notificationOutcome(kind: 'shell' | 'monitor', status: string | undefined, summary: string | undefined): ShellOutcome | undefined {
  const s = status?.trim();
  const exit = summary ? /exit code (-?\d+)/i.exec(summary)?.[1] : undefined;
  if (s && OK.test(s)) return exit !== undefined && exit !== '0' ? 'failed' : 'ok';
  if (s && FAILED.test(s)) return 'failed';
  if (s && KILLED.test(s)) return 'killed';
  if (s || kind === 'monitor') return undefined;
  if (summary && /\b(killed|stopped|interrupted|cancell?ed)\b/i.test(summary)) return 'killed';
  if (summary && /\bfailed\b/i.test(summary)) return 'failed';
  return exit !== undefined && exit !== '0' ? 'failed' : 'ok';
}

export class ShellTracker {
  private jobs = new Map<string, TrackedShell>();
  private taskToTool = new Map<string, string>();
  /** tool_use id / task id already ended -> when. */
  private ended = new Map<string, number>();
  /** Launches whose tool_use is not in the read window (matched when merging the start of the file). */
  private orphanLaunches = new Map<string, { taskId?: string; at: number }>();
  /** Ids of shells whose completion has already been reported (notification/TaskStop) -> when. */
  private reported = new Map<string, number>();

  get size(): number {
    return this.jobs.size;
  }

  /** Bash/Monitor called. Ignores what has already ended (transcript reread). */
  start(owner: string, s: ShellStart): void {
    if (this.jobs.has(s.toolUseId) || this.ended.has(s.toolUseId)) return;
    const job: TrackedShell = {
      owner,
      toolUseId: s.toolUseId,
      label: s.label,
      background: s.background,
      kind: s.kind,
      startedAt: s.at,
      requestedAt: s.at,
    };
    if (s.command) job.command = s.command;
    if (s.timeoutMs !== undefined) job.timeoutMs = s.timeoutMs;
    this.jobs.set(s.toolUseId, job);
    const orphan = this.orphanLaunches.get(s.toolUseId);
    if (orphan) {
      this.orphanLaunches.delete(s.toolUseId);
      this.launch(job, orphan.taskId, orphan.at);
    }
  }

  /**
   * tool_result of the Bash/Monitor. With a background task id (or if it was already in the background), the job
   * starts waiting for the notification; otherwise (foreground finished, error, denial) it leaves the list.
   */
  result(toolUseId: string, opts: { taskId?: string; error: boolean; at: number }): void {
    const job = this.jobs.get(toolUseId);
    if (!job) {
      if (opts.taskId && !opts.error && !this.ended.has(toolUseId)) {
        this.orphanLaunches.set(toolUseId, { taskId: opts.taskId, at: opts.at });
        if (this.orphanLaunches.size > 256) this.orphanLaunches.delete(this.orphanLaunches.keys().next().value as string);
      }
      return;
    }
    if (opts.error || (!job.background && !opts.taskId)) {
      this.remove(job, opts.at);
      return;
    }
    this.launch(job, opts.taskId, opts.at);
  }

  private launch(job: TrackedShell, taskId: string | undefined, at: number): void {
    if (taskId && this.ended.has(taskId)) {
      this.remove(job, at);
      return;
    }
    // Background request: actually starts at launch (after a possible approval). Sent
    // to the background mid-execution (foreground): keeps counting from the start.
    if (job.background) job.startedAt = Math.max(job.startedAt, at);
    job.background = true;
    delete job.held;
    if (taskId) {
      job.taskId = taskId;
      this.taskToTool.set(taskId, job.toolUseId);
    }
  }

  private find(ref: ShellRef): TrackedShell | undefined {
    if (ref.toolUseId) {
      const j = this.jobs.get(ref.toolUseId);
      if (j) return j;
    }
    if (ref.taskId) {
      const tool = this.taskToTool.get(ref.taskId);
      if (tool) return this.jobs.get(tool);
    }
    return undefined;
  }

  private markEnded(id: string | undefined, at: number): void {
    if (!id) return;
    this.ended.delete(id);
    this.ended.set(id, at);
    if (this.ended.size > MAX_ENDED) this.ended.delete(this.ended.keys().next().value as string);
  }

  private remove(job: TrackedShell, at: number): void {
    this.jobs.delete(job.toolUseId);
    if (job.taskId) this.taskToTool.delete(job.taskId);
    this.markEnded(job.toolUseId, at);
    this.markEnded(job.taskId, at);
  }

  /** <task-notification>: returns the completion (only once) of a known job. */
  notify(ref: ShellRef & { status?: string; summary?: string; at: number }): ShellFinish | undefined {
    const job = this.find(ref);
    if (!job) {
      // Unknown (subagent, or the tool_use was before the read window): remembers so as not to resurrect it.
      if (!ref.status || OK.test(ref.status) || FAILED.test(ref.status) || KILLED.test(ref.status)) {
        this.markEnded(ref.toolUseId, ref.at);
        this.markEnded(ref.taskId, ref.at);
      }
      return undefined;
    }
    const outcome = notificationOutcome(job.kind, ref.status, ref.summary);
    if (!outcome) return undefined;
    this.remove(job, ref.at);
    this.markReported(job, ref.at);
    const fin: ShellFinish = { job, outcome, at: ref.at };
    if (ref.summary) fin.summary = ref.summary;
    return fin;
  }

  private markReported(job: TrackedShell, at: number): void {
    for (const id of [job.toolUseId, job.taskId]) {
      if (!id) continue;
      this.reported.set(id, at);
      if (this.reported.size > 256) this.reported.delete(this.reported.keys().next().value as string);
    }
  }

  /** TaskStop/KillShell/KillBash accepted. */
  stop(taskId: string, at: number): ShellFinish | undefined {
    const job = this.find({ taskId, toolUseId: taskId });
    if (!job) {
      this.markEnded(taskId, at);
      return undefined;
    }
    this.remove(job, at);
    this.markReported(job, at);
    return { job, outcome: 'killed', at };
  }

  /** End of turn or interruption: no foreground command keeps running. */
  endForeground(owner: string | undefined, at: number): void {
    for (const job of [...this.jobs.values()]) if (!job.background && (owner === undefined || job.owner === owner)) this.remove(job, at);
  }

  /**
   * The session is waiting for approval ('waiting' registry): foreground commands have not started yet —
   * they leave the list and their clock restarts when the wait ends.
   */
  holdForeground(waiting: boolean, now: number): void {
    for (const job of this.jobs.values()) {
      if (job.background) continue;
      if (waiting) {
        job.held = true;
        job.startedAt = Math.max(job.startedAt, now);
      } else delete job.held;
    }
  }

  /**
   * Has this shell's completion already been reported recently (e.g.: the queue notified and now the same notification is
   * delivered to the agent)? Only applies to tracked shells (not to subagents).
   */
  reportedRecently(ref: ShellRef, at: number): boolean {
    for (const id of [ref.toolUseId, ref.taskId]) {
      const t = id ? this.reported.get(id) : undefined;
      if (t !== undefined && Math.abs(at - t) <= RECENT_END_MS) return true;
    }
    return false;
  }

  /**
   * Discards what cannot be running: older than 24 h, before the current Claude Code process
   * (shells die with it — e.g.: resumed session) and monitors past their own timeout.
   */
  prune(now: number, processStart?: number): boolean {
    let changed = false;
    for (const job of [...this.jobs.values()]) {
      let drop = now - job.requestedAt > SHELL_MAX_AGE_MS;
      if (processStart !== undefined && job.requestedAt < processStart - PROCESS_START_SLACK_MS) drop = true;
      if (job.kind === 'monitor') {
        const limit = Math.min(job.timeoutMs ?? MONITOR_DEFAULT_TIMEOUT_MS, MONITOR_MAX_TIMEOUT_MS);
        if (now - job.startedAt > limit + EXPIRY_GRACE_MS) drop = true;
      }
      if (drop) {
        this.remove(job, now);
        changed = true;
      }
    }
    return changed;
  }

  /** Is a background Bash running (started less than `maxAgeMs` ago)? Monitors do not count (as in Claude Code). */
  hasBackgroundShell(now: number, maxAgeMs = SHELL_FALLBACK_MAX_AGE_MS): boolean {
    for (const job of this.jobs.values()) if (job.background && job.kind === 'shell' && now - job.startedAt < maxAgeMs) return true;
    return false;
  }

  /**
   * The registry (a version that writes "shell") says no background shell is running: what is left here
   * lost its notification. Discards background Bash (monitors are not part of that Claude Code count).
   */
  dropBackgroundShells(now: number): boolean {
    let changed = false;
    for (const job of [...this.jobs.values()]) {
      if (!job.background || job.kind !== 'shell') continue;
      this.remove(job, now);
      changed = true;
    }
    return changed;
  }

  /** Visible jobs (without the foreground ones awaiting approval), from oldest to newest. */
  list(): TrackedShell[] {
    return [...this.jobs.values()].filter((j) => !j.held).sort((a, b) => a.startedAt - b.startedAt || a.toolUseId.localeCompare(b.toolUseId));
  }

  /**
   * Background jobs left open at the start of the file (read after the end window): they go in,
   * unless the window has already shown their completion.
   */
  merge(jobs: readonly TrackedShell[]): boolean {
    let changed = false;
    for (const j of jobs) {
      if (!j.background || this.jobs.has(j.toolUseId) || this.ended.has(j.toolUseId) || (j.taskId && this.ended.has(j.taskId))) continue;
      const job: TrackedShell = { ...j };
      this.jobs.set(job.toolUseId, job);
      const orphan = this.orphanLaunches.get(job.toolUseId);
      if (orphan) {
        this.orphanLaunches.delete(job.toolUseId);
        this.launch(job, orphan.taskId, orphan.at);
      } else if (job.taskId) this.taskToTool.set(job.taskId, job.toolUseId);
      changed = true;
    }
    return changed;
  }

  /** Background jobs still open (to merge the start of the file). */
  openBackground(): TrackedShell[] {
    return [...this.jobs.values()].filter((j) => j.background).map((j) => ({ ...j }));
  }
}

/** Published ShellJob (without the internal fields). */
export function toShellJob(j: TrackedShell): ShellJob {
  const job: ShellJob = { id: j.taskId ?? j.toolUseId, label: j.label, startedAt: j.startedAt, background: j.background, kind: j.kind };
  if (j.command) job.command = j.command;
  return job;
}
