// Messages through the office: the queue of what the page sends to the agents.
//
// The page sends at POST /api/messages; the habblaud-mensagens plugin (mod/habblaud-mensagens, one round every 2 s
// in each open session) fetches its own session's at POST /api/mod/inbox, delivers each one as if the user had
// typed it and confirms at POST /api/mod/inbox/ack. The registry:
// - marks the PRESENCE of each session that asks for the inbox (AgentInfo.canMessage, via Office);
// - stores each agent's messages in order and tracks their status (queued → sent → delivered/failed);
// - fails those nobody fetched, those the session didn't confirm, those of an agent that left and those of a conversation that
//   has switched (/clear, /resume): each message is only valid for the session it was sent to;
// - sets the "Message via Habblaud" activity on the agent when the session confirms delivery;
// - simulates delivery for demo agents (nothing goes to a real session).
// The text goes to the session exactly as typed (it is the user's own) and never appears in the page responses nor
// in the log; only the feed activity carries its beginning, masked and truncated.
//
// Codex agents have no plugin: their messages go through the Codex deliverer (`codex queue`, messages/codex.ts),
// never through the inbox. In Node mode the server itself runs the command (`codex.run` option); in Docker, the
// host helper (npm run codex:bridge) fetches at POST /api/codex/bridge/poll and confirms at
// POST /api/codex/bridge/ack. Same states, deadlines and limits; canMessage = there is a deliverer (the binary in Node mode or
// the helper seen within PRESENCE_MS). `delivered` = got into the session's queue (gets in when it goes idle).
import { randomBytes } from 'node:crypto';
import { truncate } from '../../shared/activity';
import { describeMessage, MESSAGE_MAX } from '../../shared/messages';
import type { Activity, AgentInfo, InboxMessage, OutboxMessage } from '../../shared/types';
import { errMsg, log } from '../log';
import type { CodexQueueResult, CodexQueueRunner } from './codex';
import { tr } from '../../shared/i18n';

/** A session that asked for the inbox within this time: receives messages (canMessage). */
export const PRESENCE_MS = 10_000;
/** A queued message the session didn't fetch within this time: fails. */
export const QUEUED_TIMEOUT_MS = 60_000;
/** A fetched message the session didn't confirm within this time: fails. */
export const SENT_TIMEOUT_MS = 30_000;
/** A resolved message (delivered or not) stays this long for GET /api/messages/:id and then goes away. */
export const KEEP_MS = 10 * 60_000;
/** Fictional delivery of a message to a demo agent. */
export const DEMO_DELIVERY_MS = 1_000;
export const MAX_TEXT = MESSAGE_MAX;
/** Unresolved messages per agent (the next one gets 429). */
export const MAX_OPEN = 5;
/** Messages delivered to the plugin per round. */
export const INBOX_BATCH = 5;

export const ERR_NOT_FETCHED = tr('the session didn\'t fetch the message: is the habblaud-mensagens plugin installed and the session open?');
export const ERR_NOT_CONFIRMED = tr('the session didn\'t confirm delivery');
export const ERR_GONE = tr('the agent left the office');
export const ERR_REFUSED = tr('the session didn\'t accept the message');
export const ERR_SESSION_CHANGED = tr('the agent\'s conversation changed (/clear or /resume) before delivery');
export const ERR_CODEX_UNAVAILABLE =
  tr('no way to deliver to Codex right now: run Habblaud outside Docker with `codex` in PATH (or HABBLAUD_CODEX_BIN) or, in Docker, keep npm run codex:bridge running on the Mac');
export const ERR_CODEX_NOT_FETCHED = tr('the Codex helper didn\'t fetch the message: is npm run codex:bridge running on the Mac?');
export const ERR_CODEX_SLOW = tr('Codex took too long with the previous messages to this agent');
export const ERR_CODEX_NOT_CONFIRMED = tr('the Codex helper didn\'t confirm delivery');
export const ERR_CODEX_HOME = tr('this agent\'s Codex account folder is unknown');
export const ERR_CODEX_REFUSED = tr('codex queue didn\'t accept the message');

const ERROR_MAX = 300;
const ID_MAX = 300;
const ACK_MAX = 50;

/** What the registry uses from the Office (minimal interface: makes testing easier). */
export interface OfficeLike {
  get(id: string): AgentInfo | undefined;
  list(): AgentInfo[];
  markDirty(): void;
  addActivity(id: string, activity: Activity, current: boolean): void;
}

/** Codex deliverer (`codex queue`). */
export interface CodexDeliveryOptions {
  /** Node mode: runs `codex queue` from here (absent in Docker or without the binary: only the host helper delivers). */
  run?: CodexQueueRunner;
  /** CODEX_HOME folder (host path: AccountInfo.configDir) of a Codex account. */
  homeOf: (account: string) => string | undefined;
}

export interface MessageRegistryOptions {
  office: OfficeLike;
  /** Demo agent (Office.demoAgent): these only exist in the snapshot. */
  demoAgent?: (id: string) => AgentInfo | undefined;
  /** Fictional delivery to a demo agent (Office.deliverDemoMessage); false = it already left. */
  demoDeliver?: (agentId: string, text: string) => boolean;
  /** Messages to Codex agents; absent = they don't receive. */
  codex?: CodexDeliveryOptions;
  now?: () => number;
  /** Internal clock interval (start). */
  tickMs?: number;
  presenceMs?: number;
  queuedTimeoutMs?: number;
  sentTimeoutMs?: number;
  keepMs?: number;
  demoDeliveryMs?: number;
}

export type SendResult = { message: OutboxMessage } | { error: 'not-found' | 'too-many' } | { error: 'unavailable'; reason: string };

/** Message delivered to the Codex helper on the host (POST /api/codex/bridge/poll): it runs `codex queue` with it. */
export interface CodexBridgeMessage {
  id: string;
  account: string;
  /** The account's CODEX_HOME, on the host. */
  codexHome: string;
  thread: string;
  /** The text as typed. */
  text: string;
}

/** Body validation error (becomes 400). */
export class InvalidRequest extends Error {}

interface Entry {
  msg: OutboxMessage;
  /** The text as typed; cleared when the message is resolved. */
  text: string;
  /** Feed activity when delivery is confirmed (the beginning of the text, masked and truncated). */
  activity: ReturnType<typeof describeMessage>;
  /** The agent's session when the message was sent: only it receives (conversation switch = failure). */
  target: string;
  /** Session that fetched the message (sent): only it confirms delivery. */
  session?: string;
  sentAt?: number;
  /** Message to a demo agent: never goes out through the inbox. */
  demo?: boolean;
  /** Message to a Codex agent: goes out through the Codex deliverer ('node' = the server ran it; 'bridge' = the helper). */
  codex?: true;
  via?: 'node' | 'bridge';
  /** Failed for lack of confirmation: a late confirmation still corrects the status. */
  late?: boolean;
}

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined;
}

function shortStr(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined;
}

/** Agent still in the office (neither left nor finished). */
function present(a: AgentInfo | undefined): a is AgentInfo {
  return !!a && a.status !== 'offline' && a.status !== 'done';
}

const isFinal = (e: Entry) => e.msg.status === 'delivered' || e.msg.status === 'failed';

/**
 * Why the agent doesn't receive messages now (undefined = it does). `reachable`: the session has the plugin connected (or,
 * for Codex, there is a deliverer).
 */
function unavailableReason(a: AgentInfo, reachable: boolean): string | undefined {
  if (a.kind !== 'main') return tr('subagents don\'t receive messages: send it to the main agent');
  if (!present(a)) return tr('the agent has already left the office');
  if (!reachable) return a.provider === 'codex' ? ERR_CODEX_UNAVAILABLE : tr('the session doesn\'t have the habblaud-mensagens plugin connected (npm run mod:install)');
  return undefined;
}

/** Body of POST /api/messages: `{agentId, text}`. The text is not altered (not even trimmed). */
export function parseSend(raw: unknown): { agentId: string; text: string } {
  const r = rec(raw);
  const agentId = shortStr(r?.agentId, ID_MAX);
  if (!r || !agentId || typeof r.text !== 'string') throw new InvalidRequest(tr('expected {agentId, text}'));
  if (!r.text.trim()) throw new InvalidRequest(tr('the message is empty'));
  if (r.text.length > MAX_TEXT) throw new InvalidRequest(tr('the message exceeds 20,000 characters'));
  return { agentId, text: r.text };
}

/** Results of a confirmation ({results: [{id, ok, error?}]}): the valid ones, up to ACK_MAX. */
function ackResults(raw: unknown): Array<{ id: string; ok: boolean; error?: string }> {
  const r = rec(raw);
  if (!r || !Array.isArray(r.results)) return [];
  const out: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of r.results.slice(0, ACK_MAX)) {
    const x = rec(item);
    const id = shortStr(x?.id, ID_MAX);
    if (!x || !id || typeof x.ok !== 'boolean') continue;
    out.push({ id, ok: x.ok, ...(typeof x.error === 'string' && x.error.trim() ? { error: truncate(x.error, ERROR_MAX) } : {}) });
  }
  return out;
}

export class MessageRegistry {
  private messages = new Map<string, Entry>();
  /** Last time each main agent's session asked for the inbox. */
  private seen = new Map<string, number>();
  /** Last time the Codex helper on the host fetched messages. */
  private bridgeAt?: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private readonly now: () => number;
  private readonly presenceMs: number;
  private readonly queuedTimeoutMs: number;
  private readonly sentTimeoutMs: number;
  private readonly keepMs: number;
  private readonly demoDeliveryMs: number;

  constructor(private readonly opts: MessageRegistryOptions) {
    this.now = opts.now ?? Date.now;
    this.presenceMs = opts.presenceMs ?? PRESENCE_MS;
    this.queuedTimeoutMs = opts.queuedTimeoutMs ?? QUEUED_TIMEOUT_MS;
    this.sentTimeoutMs = opts.sentTimeoutMs ?? SENT_TIMEOUT_MS;
    this.keepMs = opts.keepMs ?? KEEP_MS;
    this.demoDeliveryMs = opts.demoDeliveryMs ?? DEMO_DELIVERY_MS;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        log.warnOnce(`messages-tick:${errMsg(err)}`, tr('Messages: clock failed ({0}).', [errMsg(err)]));
      }
    }, this.opts.tickMs ?? 500);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Stored messages (including already resolved ones, until they go away). */
  get size(): number {
    return this.messages.size;
  }

  /**
   * Present main agents that receive messages now: Claude Code ones whose session asked for the inbox
   * recently and Codex ones, if there is a deliverer. This is what the Office puts in the snapshot.
   */
  reachable(): Set<string> {
    const out = new Set<string>();
    for (const id of this.seen.keys()) if (this.canMessage(id)) out.add(id);
    if (this.codexAvailable()) for (const a of this.opts.office.list()) if (a.provider === 'codex' && a.kind === 'main' && present(a)) out.add(a.id);
    return out;
  }

  canMessage(agentId: string): boolean {
    const a = this.opts.office.get(agentId);
    if (a?.provider === 'codex') return this.codexAvailable() && present(a) && a.kind === 'main';
    const at = this.seen.get(agentId);
    if (at === undefined || this.now() - at >= this.presenceMs) return false;
    return present(a) && a.kind === 'main';
  }

  /** There is a way to deliver to Codex: the binary in Node mode or the host helper seen recently. */
  codexAvailable(): boolean {
    const c = this.opts.codex;
    return !!c && (!!c.run || this.bridgeRecent());
  }

  /**
   * Message from the page. `{error}`: unknown agent (not-found), one that doesn't receive messages (unavailable, with
   * the reason: subagent, left/finished, session without the plugin or Codex without a deliverer) or with too many messages waiting
   * (too-many). Invalid body: throws InvalidRequest.
   */
  send(raw: unknown): SendResult {
    const { agentId, text } = parseSend(raw);
    const real = this.opts.office.get(agentId);
    const demo = real ? undefined : this.opts.demoAgent?.(agentId);
    const agent = real ?? demo;
    if (!agent) return { error: 'not-found' };
    const reason = unavailableReason(agent, real ? this.canMessage(agentId) : demo!.canMessage === true);
    if (reason) return { error: 'unavailable', reason };
    let open = 0;
    for (const e of this.messages.values()) if (e.msg.agentId === agentId && !isFinal(e)) open++;
    if (open >= MAX_OPEN) return { error: 'too-many' };

    const now = this.now();
    const id = `m-${now.toString(36)}-${++this.seq}-${randomBytes(9).toString('base64url')}`;
    const entry: Entry = { msg: { id, agentId, status: 'queued', createdAt: now, updatedAt: now }, text, activity: describeMessage(text), target: agent.sessionId };
    if (demo) entry.demo = true;
    else if (real?.provider === 'codex') entry.codex = true;
    this.messages.set(id, entry);
    const out = { ...entry.msg };
    if (entry.codex) this.pumpCodex();
    return { message: out };
  }

  /** Status of a message (without the text), or undefined. */
  get(id: string): OutboxMessage | undefined {
    const e = this.messages.get(id);
    return e ? { ...e.msg } : undefined;
  }

  /**
   * Plugin round: marks the session's presence and delivers its agent's next messages (marking them
   * `sent`). Session without a known main agent: no messages. Invalid body: throws InvalidRequest.
   */
  inbox(raw: unknown): InboxMessage[] {
    const r = rec(raw);
    const session = shortStr(r?.session, ID_MAX);
    if (!r || !session) throw new InvalidRequest(tr('expected {session, account?}'));
    const account = shortStr(r.account, ID_MAX);
    // The plugin is Claude Code's: Codex agents never receive through here.
    const agent = this.opts.office
      .list()
      .find((a) => a.kind === 'main' && a.provider !== 'codex' && a.sessionId === session && (!account || a.account === account) && present(a));
    if (!agent) return [];

    const now = this.now();
    const was = this.canMessage(agent.id);
    this.seen.set(agent.id, now);
    // Only a presence change touches the snapshot (the round repeats every 2 s).
    if (!was) this.opts.office.markDirty();

    const out: InboxMessage[] = [];
    for (const e of this.messages.values()) {
      if (out.length >= INBOX_BATCH) break;
      if (e.demo || e.codex || e.msg.agentId !== agent.id || e.msg.status !== 'queued' || e.target !== session) continue;
      this.setStatus(e, 'sent', now);
      e.session = session;
      e.sentAt = now;
      out.push({ id: e.msg.id, text: e.text });
    }
    return out;
  }

  /**
   * Plugin confirmation: `sent` → `delivered` (ok) or `failed` (with the reason). Only valid from the session that fetched the
   * message; unknown ids or ones in another status are ignored. A late confirmation (the message had already
   * failed for lack of it) still corrects the status: the plugin is the one that knows whether the text got in.
   */
  ack(raw: unknown): void {
    const r = rec(raw);
    const session = shortStr(r?.session, ID_MAX);
    if (!r || !session || !Array.isArray(r.results)) throw new InvalidRequest(tr('expected {session, results: [{id, ok, error?}]}'));
    const now = this.now();
    for (const x of ackResults(r)) {
      const e = this.messages.get(x.id);
      if (!e || e.demo || e.codex || e.session !== session) continue;
      if (e.msg.status !== 'sent' && !(e.msg.status === 'failed' && e.late)) continue;
      if (x.ok) this.finish(e, 'delivered', now);
      else this.fail(e, now, x.error ?? ERR_REFUSED);
    }
  }

  /**
   * Codex helper round on the host: marks its presence and delivers the next messages to Codex agents
   * (marking them `sent`), in each agent's order (none from an agent that still has another being delivered). In Node mode
   * the server delivers: nothing goes out through here (no double delivery).
   */
  codexPoll(raw: unknown): CodexBridgeMessage[] {
    if (!rec(raw)) throw new InvalidRequest(tr('expected a JSON object ({})'));
    const c = this.opts.codex;
    if (!c) return [];
    const now = this.now();
    const was = this.codexAvailable();
    this.bridgeAt = now;
    if (!was) this.opts.office.markDirty();
    if (c.run) return [];

    const busy = new Set<string>();
    for (const e of this.messages.values()) if (e.codex && e.msg.status === 'sent') busy.add(e.msg.agentId);
    const out: CodexBridgeMessage[] = [];
    for (const e of this.messages.values()) {
      if (out.length >= INBOX_BATCH) break;
      if (!e.codex || e.msg.status !== 'queued' || busy.has(e.msg.agentId)) continue;
      busy.add(e.msg.agentId);
      const target = this.codexTarget(e, now);
      if (!target) continue;
      this.setStatus(e, 'sent', now);
      e.sentAt = now;
      e.via = 'bridge';
      out.push({ id: e.msg.id, account: target.account, codexHome: target.codexHome, thread: target.thread, text: e.text });
    }
    return out;
  }

  /**
   * Codex helper confirmation: `sent` → `delivered` (`codex queue` accepted it) or `failed` (with the reason). Only
   * valid for the messages it fetched; a late one still corrects the status, as with the plugin. Invalid body: throws.
   */
  codexAck(raw: unknown): void {
    const r = rec(raw);
    if (!r || !Array.isArray(r.results)) throw new InvalidRequest(tr('expected {results: [{id, ok, error?}]}'));
    const now = this.now();
    this.bridgeAt = now;
    for (const x of ackResults(r)) {
      const e = this.messages.get(x.id);
      if (!e || !e.codex || e.via !== 'bridge') continue;
      if (e.msg.status !== 'sent' && !(e.msg.status === 'failed' && e.late)) continue;
      if (x.ok) this.finish(e, 'delivered', now);
      else this.fail(e, now, x.error ?? ERR_CODEX_REFUSED);
    }
  }

  /** Clock: deadlines, agent that left, demo fictional delivery, expired presence and cleanup of resolved ones. */
  tick(): void {
    const now = this.now();
    for (const [id, e] of this.messages) {
      if (isFinal(e)) {
        if (now - e.msg.updatedAt >= this.keepMs) this.messages.delete(id);
        continue;
      }
      if (e.demo) {
        if (!present(this.opts.demoAgent?.(e.msg.agentId))) this.fail(e, now, ERR_GONE);
        else if (now - e.msg.createdAt >= this.demoDeliveryMs) {
          if (this.opts.demoDeliver?.(e.msg.agentId, e.text)) this.finish(e, 'delivered', now);
          else this.fail(e, now, ERR_GONE);
        }
        continue;
      }
      const a = this.opts.office.get(e.msg.agentId);
      if (!present(a)) this.fail(e, now, ERR_GONE);
      else if (e.msg.status === 'queued' && a.sessionId !== e.target) this.fail(e, now, ERR_SESSION_CHANGED);
      else if (e.msg.status === 'queued' && now - e.msg.createdAt >= this.queuedTimeoutMs) {
        this.fail(e, now, !e.codex ? ERR_NOT_FETCHED : this.opts.codex?.run ? ERR_CODEX_SLOW : ERR_CODEX_NOT_FETCHED);
      } else if (e.msg.status === 'sent' && now - (e.sentAt ?? now) >= this.sentTimeoutMs) {
        this.fail(e, now, e.codex ? ERR_CODEX_NOT_CONFIRMED : ERR_NOT_CONFIRMED);
        e.late = true;
      }
    }
    // Expired presence (or of someone who left): the snapshot again says messages cannot be sent.
    for (const [agentId, at] of this.seen) {
      if (now - at < this.presenceMs && present(this.opts.office.get(agentId))) continue;
      this.seen.delete(agentId);
      this.opts.office.markDirty();
    }
    if (this.bridgeAt !== undefined && now - this.bridgeAt >= this.presenceMs) {
      this.bridgeAt = undefined;
      // Without the binary in Node mode, Codex agents stop receiving.
      if (!this.opts.codex?.run) this.opts.office.markDirty();
    }
    this.pumpCodex();
  }

  // ---------------------------------------------------------------- internals

  private bridgeRecent(): boolean {
    return this.bridgeAt !== undefined && this.now() - this.bridgeAt < this.presenceMs;
  }

  /** Thread and account folder of a message to Codex; without them, the message fails (and returns undefined). */
  private codexTarget(e: Entry, now: number): { account: string; codexHome: string; thread: string } | undefined {
    const a = this.opts.office.get(e.msg.agentId);
    if (!present(a)) return void this.fail(e, now, ERR_GONE);
    if (a.sessionId !== e.target) return void this.fail(e, now, ERR_SESSION_CHANGED);
    const codexHome = this.opts.codex?.homeOf(a.account);
    if (!codexHome) return void this.fail(e, now, ERR_CODEX_HOME);
    return { account: a.account, codexHome, thread: a.sessionId };
  }

  /**
   * Node mode: runs `codex queue` for each Codex agent's next message (one at a time per agent, in order;
   * the next one goes out when the previous one finishes).
   */
  private pumpCodex(): void {
    const run = this.opts.codex?.run;
    if (!run) return;
    const busy = new Set<string>();
    for (const e of this.messages.values()) if (e.codex && e.msg.status === 'sent') busy.add(e.msg.agentId);
    const now = this.now();
    for (const e of this.messages.values()) {
      if (!e.codex || e.msg.status !== 'queued' || busy.has(e.msg.agentId)) continue;
      busy.add(e.msg.agentId);
      const target = this.codexTarget(e, now);
      if (!target) continue;
      this.setStatus(e, 'sent', now);
      e.sentAt = now;
      e.via = 'node';
      run({ codexHome: target.codexHome, thread: target.thread, text: e.text }).then(
        (r) => this.codexDone(e, r),
        (err: unknown) => this.codexDone(e, { ok: false, error: errMsg(err) }),
      );
    }
  }

  /** End of a `codex queue` run from here. */
  private codexDone(e: Entry, r: CodexQueueResult): void {
    if (this.messages.get(e.msg.id) !== e) return;
    if (e.msg.status !== 'sent' && !(e.msg.status === 'failed' && e.late)) return;
    const now = this.now();
    if (r.ok) this.finish(e, 'delivered', now);
    else this.fail(e, now, truncate(r.error, ERROR_MAX) || ERR_CODEX_REFUSED);
    this.pumpCodex();
  }

  private setStatus(e: Entry, status: OutboxMessage['status'], now: number): void {
    e.msg.status = status;
    e.msg.updatedAt = now;
  }

  /** Resolves the message: the text is no longer needed. */
  private finish(e: Entry, status: 'delivered' | 'failed', now: number): void {
    this.setStatus(e, status, now);
    delete e.late;
    if (status === 'delivered') {
      delete e.msg.error;
      // The demo one goes to the fictional agent (Office.deliverDemoMessage).
      if (!e.demo) this.opts.office.addActivity(e.msg.agentId, { id: `${e.msg.agentId}#msg:${e.msg.id}`, at: now, ...e.activity }, false);
    }
    e.text = '';
  }

  private fail(e: Entry, now: number, error: string): void {
    e.msg.error = error;
    this.finish(e, 'failed', now);
  }
}
