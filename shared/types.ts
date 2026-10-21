// Protocol shared between the server (Node) and the client (browser).
// Pure code: no Node or DOM APIs.
//
// Evolution rule: changes here must be ADDITIVE (new optional fields).
// Renaming/removing fields breaks the server, world and UI at the same time.

import type { AppearanceParts } from './appearance';
import type { WorldMeta } from './world/api';

export type AgentKind = 'main' | 'sub';

/**
 * Which tool the agent (or the account, source, session, request) comes from. In the protocol types the field
 * `provider` is optional and ABSENT means 'claude' (everything that existed before Codex stays the same).
 * - claude: Claude Code;
 * - codex: OpenAI Codex (the `codex` CLI and the desktop app, which write to the same CODEX_HOME).
 */
export type Provider = 'claude' | 'codex';

/**
 * High-level state of an agent — it's what drives the character's behavior.
 * - working: processing a turn (busy). Stays at the desk typing.
 * - waiting: needs the user (permission, question, dialog). Stays at the desk with a raised hand.
 * - idle: finished the turn and waits for the next instruction. Wanders around the office (coffee, water cooler...).
 * - shell: finished the turn, but there are shell(s) running in the background (see `shells`); it's waiting
 *   for the shell to finish. Stays at the desk, watching the terminal. (The Claude Code registry records "shell"
 *   when the session is idle with background shells.)
 * - done: subagent finished. Hands the result to the main agent and leaves.
 * - offline: session ended. Leaves (if it's the last one in the room, turns off the light).
 */
export type AgentStatus = 'working' | 'waiting' | 'idle' | 'shell' | 'done' | 'offline';

/** A shell command the agent is waiting to finish. */
export interface ShellJob {
  /** Id of the background task (e.g. "bo0ov3q3l") or, in the foreground, the tool_use id. */
  id: string;
  /** Short text in PT-BR: the Bash description or a summary of the command (secrets masked). */
  label: string;
  /** Full command (masked, up to ~300 characters), when there is one. */
  command?: string;
  /** Epoch ms at which the command started. */
  startedAt: number;
  /** true = run_in_background (the agent ended the turn and waits for the notification); false = foreground command still without a result. */
  background: boolean;
  /** 'monitor' = Monitor tool (follows a process); 'shell' = Bash. */
  kind: 'shell' | 'monitor';
}

export type ActivityKind =
  | 'prompt' // received a new instruction from the user
  | 'think' // thinking (thinking block)
  | 'respond' // writing a text response
  | 'read'
  | 'search'
  | 'edit'
  | 'write'
  | 'run' // terminal command
  | 'test'
  | 'git'
  | 'web'
  | 'browser'
  | 'plan' // tasks / planning
  | 'delegate' // spawned subagent(s)
  | 'communicate' // message to another agent / notice
  | 'ask' // question to the user
  | 'mcp'
  | 'skill'
  | 'wait'
  | 'error'
  | 'compact' // context compaction
  | 'done' // finished the turn
  | 'other';

export interface Activity {
  /** Unique per activity (e.g. entry uuid + block index). */
  id: string;
  kind: ActivityKind;
  /** Emoji representing the activity. */
  icon: string;
  /** Short text in PT-BR (up to ~46 characters). E.g.: "Editando App.tsx". */
  text: string;
  /** Optional detail (full command, path, query...), up to ~300 characters. */
  detail?: string;
  /** Raw tool name, when there is one. */
  tool?: string;
  /** Epoch ms. */
  at: number;
  durationMs?: number;
  error?: boolean;
  /** Full questions of an AskUserQuestion (kind 'ask'), for the office to show the options. */
  questions?: AskQuestion[];
}

/**
 * An AskUserQuestion question, already masked and truncated. With the request in the office (PermissionRequestInfo.questions),
 * it can be answered there; otherwise the answer is given in Claude Code.
 */
export interface AskQuestion {
  /** Position of the question in `tool_input.questions` (invalid entries are skipped, so there may be gaps). */
  index: number;
  question: string;
  header?: string;
  multiSelect?: boolean;
  /** `index` = position of the option in the original's `options`: it's what goes back in the answer (PermissionAnswer). */
  options: Array<{ index: number; label: string; description?: string }>;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  /** Gerund form ("Writing tests"), when available. */
  activeForm?: string;
}

export interface AgentStats {
  toolCalls: number;
  /** input + cache read + cache creation. */
  tokensIn: number;
  tokensOut: number;
  costUSD?: number;
  linesAdded?: number;
  linesRemoved?: number;
  /** Total subagents spawned by this agent. */
  subagents: number;
}

export interface AgentInfo {
  /**
   * Stable while the agent exists. Claude Code: main "<account>:<pid>", sub "<sessionId>:<agentId>".
   * Codex: main and sub "<account>:<threadId>" (the sub with `parentId`).
   */
  id: string;
  kind: AgentKind;
  /** Agent's tool; absent = 'claude'. */
  provider?: Provider;
  /** For subagents: id of the agent that spawned it. */
  parentId?: string;
  roomId: string;
  /** Unique human name in the office. E.g.: "Marina". */
  name: string;
  /** Name presentation hint (used by the art to vary the look). */
  look: 'f' | 'm';
  /** Role. Main: "Agente principal". Sub: subagent type ("Explore", "Plan", "fork"...). */
  role: string;
  /** Session title (main) or task description (sub). */
  title?: string;
  sessionId: string;
  /** Source account = AccountInfo.id (basename of the config dir, e.g. ".claude", ".claude-conta2"). */
  account: string;
  status: AgentStatus;
  /** Reason in PT-BR when status === 'waiting'. E.g.: "aprovar uma permissão". */
  waitingFor?: string;
  /** Current (or most recent) activity. */
  activity?: Activity;
  /** Latest activities, from oldest to newest (max. ~30). */
  recent: Activity[];
  tasks: TaskItem[];
  /** Running shells the agent waits for: in the background and the foreground command still without a result. */
  shells?: ShellJob[];
  model?: string;
  gitBranch?: string;
  permissionMode?: string;
  startedAt: number;
  lastEventAt: number;
  /** When the status last changed (epoch ms). */
  statusSince: number;
  stats: AgentStats;
  /** 32-bit seed for the character's deterministic appearance. */
  seed: number;
  /** Pieces chosen in the character editor, applied on top of the `seed` appearance (see shared/appearance.ts). */
  parts?: AppearanceParts;
  /** Uses the character chosen for the project (the room): the panel offers "Back to the draw". */
  custom?: true;
  /** Subagent running in the background. */
  background?: boolean;
  /**
   * Permission request that can be answered via Habblaud (PermissionRequest hook; the oldest, if
   * there are several). While it exists, the agent shows as 'waiting'. See PermissionRequestInfo.
   */
  permission?: PermissionRequestInfo;
  /**
   * This agent can be messaged via Habblaud (main agents only): the session has the habblaud-mensagens plugin
   * and checked the inbox recently. See POST /api/messages.
   */
  canMessage?: boolean;
}

export interface RoomInfo {
  /** Stable key: normalized project cwd. */
  id: string;
  /** Displayed name (basename of the cwd, disambiguated if repeated). */
  name: string;
  /** Full project path. */
  path: string;
  /**
   * Arrival order of the room, assigned by the server and stable while the room exists (a freed slot is only
   * reused after a waiting period). The client uses it only as an order: in the building, each room takes the first free
   * slot and, when a slot frees up between rooms, the farthest one moves into it (client/src/world/sim/sim.ts,
   * compact). Slot on the client: column = floor(slot / 2); even = north side of the corridor, odd = south side.
   */
  slot: number;
  /** Seed for deterministic colors/decoration. */
  seed: number;
  createdAt: number;
  /** Temporary visual effect in the room (GitHub events detected in transcripts; see shared/github.ts). */
  effect?: RoomEffect;
}

/**
 * Temporary effect in a project room, triggered by a GitHub event seen live:
 * - party: celebration (PR opened or merged, release, green CI after an alarm); lasts ~12 s;
 * - alarm: red CI; lasts until a green CI in that room or expires in ~10 min.
 */
export interface RoomEffect {
  kind: 'party' | 'alarm';
  /** Short banner in PT-BR. E.g.: "PR #12 mergeado!", "CI falhou (feat/x)". */
  text: string;
  /** Start (epoch ms, server clock): a new effect has a different `at`. */
  at: number;
  /** Expected end (epoch ms, server clock). */
  until: number;
  /** Responsible agent: who opened/merged (party) or who saw CI fail (alarm, "!" bubble). */
  agentId?: string;
}

/**
 * New version check: the server queries the latest release of the repository on GitHub
 * (server/updates/checker.ts) and compares it with the version in use.
 */
export interface UpdateStatus {
  /**
   * - off: check turned off (HABBLAUD_UPDATE_CHECK=0 or package.json without a GitHub repository);
   * - pending: hasn't checked yet;
   * - ok: checked (with or without a published release);
   * - error: the last attempt failed (no internet, GitHub rate limit...).
   */
  state: 'off' | 'pending' | 'ok' | 'error';
  /** Queried repository, "owner/name". */
  repo?: string;
  /** Last successful query (epoch ms). */
  checkedAt?: number;
  /** Version of the latest release, without the "v" (absent: no published release). */
  latest?: string;
  /** Page of the latest release on GitHub. */
  url?: string;
  /** Publication of the latest release (epoch ms). */
  publishedAt?: number;
  /** The latest release is newer than the version in use. */
  available: boolean;
  /** Failure reason (state "error"). */
  error?: string;
}

export interface SourceInfo {
  /** Account label (basename of the config dir). */
  label: string;
  /** Source's tool; absent = 'claude'. */
  provider?: Provider;
  path: string;
  /** Open sessions detected in this source. */
  sessions: number;
  ok: boolean;
  error?: string;
}

/** A plan usage limit window (e.g. 5h session, week). */
export interface UsageWindow {
  /** Percentage used, 0–100. */
  utilization: number;
  /** When the window resets (epoch ms). */
  resetsAt?: number;
}

export interface AccountUsage {
  /** 5-hour session. */
  fiveHour?: UsageWindow;
  /** Weekly limit (all models). */
  sevenDay?: UsageWindow;
  sevenDayOpus?: UsageWindow;
  sevenDaySonnet?: UsageWindow;
  /**
   * Source of the numbers (all are local files written by the tool itself):
   * - 'statusline': captured live and written to ~/.habblaud/usage/<account>.json by the Habblaud mod
   *   (mod/habblaud, recommended) or by scripts/statusline-tap.mjs (the statusline's rate_limits field);
   * - 'cache': `cachedUsageUtilization` written by Claude Code itself (updates when someone runs /usage);
   * - 'codex': `rate_limits` from the Codex session files (only renewed while some session runs).
   */
  source: 'cache' | 'statusline' | 'codex';
  /** Who wrote the live file ('statusline'): the Habblaud mod in Claude Code or the statusline tap. */
  via?: 'mod' | 'tap';
  /**
   * Account with no quota or credits to use now (Codex: null `rate_limits.primary`, e.g. workspace credits
   * exhausted). It isn't "0% used": the windows are absent.
   */
  noQuota?: boolean;
  /** When the numbers were obtained at the source (epoch ms). */
  fetchedAt: number;
}

/** A Claude account (a config dir: ~/.claude, ~/.claude-conta2, ...) or a Codex one (a CODEX_HOME: ~/.codex). */
export interface AccountInfo {
  /** = AgentInfo.account (basename of the config dir, e.g. ".claude"); unique among the accounts of all tools. */
  id: string;
  /** Account's tool; absent = 'claude'. */
  provider?: Provider;
  /** Very short label (1–3 characters), e.g. "C" and "D" — shortcuts detected in the shell — or derived. */
  short: string;
  /** Friendly name. E.g.: "Conta C". */
  name: string;
  email?: string;
  organization?: string;
  /** Plan, when known (e.g. "Max", "Pro"). */
  plan?: string;
  /** Account identification color (hex). */
  color: string;
  configDir: string;
  /** Sessions open now on this account. */
  sessions: number;
  usage?: AccountUsage;
  /**
   * - ok: recent numbers;
   * - stale: old numbers (e.g. /usage cache from hours ago);
   * - disabled: no numbers (statusline tap not installed and no /usage cache).
   */
  usageStatus: 'ok' | 'stale' | 'disabled';
}

export interface OfficeSnapshot {
  /** Increments on every change. */
  rev: number;
  serverTime: number;
  rooms: RoomInfo[];
  agents: AgentInfo[];
  /** Interactive terminals opened by Habblaud (Claude Code running inside the browser). */
  ptys?: PtyInfo[];
  /** Detected Claude accounts (with 5h/weekly usage when available). */
  accounts: AccountInfo[];
  meta: {
    demo: boolean;
    sources: SourceInfo[];
    startedAt: number;
    version: string;
    /**
     * Identifier of the client build the server is serving (bundle name, e.g. "main-BFqheOCa").
     * A page open with another build is outdated and must reload. Absent in dev mode.
     */
    build?: string;
    /**
     * Terminal (GET /api/agents/:id/terminal) available: only when Habblaud isn't
     * exposed beyond the computer itself (local bind). Absent/false = feature off.
     */
    terminal?: boolean;
    /**
     * Messages from the office enabled (POST /api/messages): the same lock as the terminal and HABBLAUD_MENSAGENS not
     * turned off. Who receives now is told by AgentInfo.canMessage. Absent/false = feature off.
     */
    messages?: boolean;
    /**
     * Interactive terminal (open/take over sessions and end agents from the office): only outside Docker, with
     * node-pty and local access. Absent = feature off.
     */
    pty?: PtyStatus;
    /** New version check on GitHub (absent in tests and in the timelapse). */
    updates?: UpdateStatus;
    /**
     * Habblaud World (server/world/): `enabled` = the section shows (HABBLAUD_WORLD isn't 0 and the world server was
     * accepted: the default, server.habblaud.com, or a valid HABBLAUD_WORLD_URL; if rejected, the feature is off and nothing
     * from World shows); `configured` = world server accepted; `state` = the
     * account on this computer; `building` (additive, only with the account approved and the character created) = the summary
     * of the building in the world: connected, paused, floors and agents of the last shipment and its time, whether it left the
     * world and whether the world server stopped it (without the reason, which only goes in the status). Nothing else from the
     * account (the snapshot also goes to the phone and the timeline). Absent in tests and in the timelapse.
     */
    world?: WorldMeta;
  };
}

/**
 * What THIS page can do (GET /api/access): the local port allows everything via the local Host; the remote port with login
 * (server/http/remote.ts) only what HABBLAUD_REMOTE_ALLOW allows. `local` = opened from the computer itself (editing the
 * character and renaming rooms, which never work through the remote port).
 */
export interface AccessInfo {
  remote: boolean;
  local: boolean;
  permissions: boolean;
  messages: boolean;
  terminal: boolean;
  /** Can open new agents in the Claude app (POST /api/spawn). */
  spawn: boolean;
  /**
   * Can use the Habblaud World account (/api/world/*): feature on (HABBLAUD_WORLD), terminal lock and local port
   * with local Host. Absent on old servers.
   */
  world?: boolean;
}

export interface FeedItem {
  id: string;
  agentId: string;
  roomId: string;
  agentName: string;
  roomName: string;
  /** Agent's account (= AccountInfo.id). */
  account?: string;
  activity: Activity;
}

export type NoticeLevel = 'info' | 'success' | 'warn' | 'alert';

export interface Notice {
  id: string;
  level: NoticeLevel;
  text: string;
  agentId?: string;
  roomId?: string;
  at: number;
}

/**
 * Server messages via SSE on GET /api/stream.
 * Each message arrives as a named SSE event (`event: snapshot|feed|notice`) whose `data` is the JSON of `data`.
 * On connect, the server sends a full `snapshot` and a `feed` with the recent items.
 */
export type ServerMessage =
  | { type: 'snapshot'; data: OfficeSnapshot }
  | { type: 'feed'; data: FeedItem[] }
  | { type: 'notice'; data: Notice };

/** Response of GET /api/agents/:id */
export interface AgentDetail {
  agent: AgentInfo;
  /** Longer history (max. ~200), from oldest to newest. */
  history: Activity[];
}

// ------------------------------------------------------------------ Claude Code mod

/**
 * Response of GET /api/mod/summary: the minimum the Claude Code mod (mod/habblaud) needs for the
 * "needs you" line under the prompt and for the /habblaud command. Only real agents (the demo is left out)
 * and present ones (without those that already ended or delivered); with `?session=` (and `?account=`), without the
 * asker's own session: its main agent and subagents.
 */
export interface ModSummary {
  /** Habblaud version in use. */
  version: string;
  /** Present agents and how many are working. */
  agents: number;
  working: number;
  /** Who needs you, from who has been waiting longest to who has been waiting least. */
  waiting: ModWaitingAgent[];
}

export interface ModWaitingAgent {
  /** = AgentInfo.id. */
  id: string;
  name: string;
  /** Displayed name of the room (project). */
  room: string;
  /** = AccountInfo.id. */
  account: string;
  /** Reason in PT-BR (AgentInfo.waitingFor), e.g. "aprovar uma permissão". */
  waitingFor: string;
  /** Waiting since when (epoch ms). */
  since?: number;
  /** There's a permission request to answer from the office (AgentInfo.permission). */
  answerable: boolean;
}

// ------------------------------------------------------------------ terminal

/**
 * How to display the `input` of a tool call:
 * - command: shell command; diff: "- old" / "+ new" lines (Edit/Write); json: raw arguments; text: free text.
 */
export type TerminalInputKind = 'command' | 'diff' | 'json' | 'text';

/**
 * A terminal entry: the session's conversation rebuilt from the JSONL transcript,
 * in the format Claude Code shows it. All text already comes with secrets masked and truncated.
 * Entries are only appended (never edited): a tool's result arrives later, in a
 * 'result' entry that points to the 'tool' via `toolUseId`.
 */
export type TerminalEntry =
  /** User prompt or slash command (e.g. "/model"). */
  | { kind: 'user'; id: string; at: number; text: string }
  /** Text of the agent's response (markdown). */
  | { kind: 'assistant'; id: string; at: number; text: string }
  /** Reasoning block; `text` absent when the transcript only stores the signature. */
  | { kind: 'thinking'; id: string; at: number; text?: string }
  /**
   * Tool call. `id` = tool_use id. `title` in Claude Code style: "Bash(npm test)",
   * "Read(server/index.ts)". `input` = relevant arguments (command, diff...), when there are any.
   */
  | { kind: 'tool'; id: string; at: number; tool: string; title: string; input?: string; inputKind?: TerminalInputKind }
  /** Result of a tool. `truncated` = the text was cut (result too long). */
  | { kind: 'result'; id: string; at: number; toolUseId: string; text: string; error?: boolean; truncated?: boolean }
  /** Session event: compaction, interruption, background result, API error... */
  | { kind: 'system'; id: string; at: number; text: string; detail?: string; level?: 'info' | 'warn' | 'error' };

/** Terminal stream `init` event: the recent conversation (replaces everything the client has). */
export interface TerminalInit {
  agentId: string;
  /** From oldest to newest. */
  entries: TerminalEntry[];
  /** There's earlier conversation that wasn't loaded (the transcript is larger than the window read). */
  truncated: boolean;
}

/**
 * Terminal stream (Server-Sent Events) on GET /api/agents/:id/terminal.
 * On connect (and on every reconnect, or if the transcript is truncated/replaced) an `init` arrives;
 * then, `append` with the new entries. Errors before the stream respond with JSON `{error}`:
 * 403 (feature off or non-local access), 404 (unknown agent/transcript),
 * 429 (too many open terminals).
 */
export type TerminalMessage = { type: 'init'; data: TerminalInit } | { type: 'append'; data: TerminalEntry[] };

/**
 * A recent session (open or already ended) in the terminal history, on
 * GET /api/sessions/recent. The conversation of an ended session comes, with the same protocol as the agent's
 * terminal (TerminalMessage), from GET /api/sessions/:conta/:sessionId/terminal.
 */
export interface RecentSession {
  /** = AccountInfo.id. */
  account: string;
  /** Session's tool; absent = 'claude'. */
  provider?: Provider;
  sessionId: string;
  /** Project path (the `cwd` of the transcript's first lines); absent if it couldn't be found. */
  project?: string;
  /** Name of the project folder in `projects/` (the encoded cwd), for when `project` is missing. */
  projectDir: string;
  /** Title like the agent's: /rename > agent name > automatic title > last prompt (or the first). */
  title?: string;
  /** First and last activity with a timestamp (epoch ms); `lastAt` falls back to the file mtime with no timestamp at the end. */
  firstAt?: number;
  lastAt: number;
  /** Transcript size in bytes. */
  size: number;
  /** The session is still open: `agentId` is its main agent in the office. */
  open: boolean;
  agentId?: string;
}

// ------------------------------------------------------------------ deliveries

/** Type of a delivery attachment, to choose the viewer. */
export type DeliveryAttachmentKind = 'image' | 'pdf' | 'video' | 'page' | 'text' | 'file';

/** File the agent delivered (SendUserFile, link in the response) or a screen captured at the end of the work. */
export interface DeliveryAttachment {
  /** Opaque id for GET /api/deliveries/file/:id (never the path). */
  id: string;
  name: string;
  kind: DeliveryAttachmentKind;
  /** Agent's caption (SendUserFile) or "Tela capturada". */
  caption?: string;
  /** Screenshot that came inside the conversation (not a file from the computer). */
  capture?: boolean;
}

/**
 * A delivery: the end of a request the agent worked on (used tools) and answered. Built from the transcript
 * (server/deliveries/deliveries.ts), the way a BA would receive it: headline, summary, request and attachments.
 */
export interface DeliveryInfo {
  /** "<account>:<session>:<request entry>". */
  id: string;
  account: string;
  provider?: Provider;
  sessionId: string;
  /** Agent still in the office (for the avatar and "open terminal"). */
  agentId?: string;
  /** Agent's name (the office one) or the session title. */
  agentName?: string;
  project?: string;
  /** What was requested (one line). */
  request: string;
  /** First sentence of the response, without markdown. */
  headline: string;
  /** Paragraph in plain language (the last one of the response), when there is one. */
  summary?: string;
  /** The whole response (markdown). */
  text: string;
  startedAt: number;
  finishedAt: number;
  /** Tools used and files changed in the request. */
  tools: number;
  edited: number;
  attachments: DeliveryAttachment[];
}

export interface DeliveriesResponse {
  deliveries: DeliveryInfo[];
}

/** Response of GET /api/sessions/recent: from the most recent activity to the oldest. */
export interface RecentSessionsResponse {
  sessions: RecentSession[];
  /** Listing window (days) and maximum sessions. */
  days: number;
  limit: number;
}

// ------------------------------------------------------------------ answering from the office

/** "Always allow" rule suggested by Claude Code for a request (the hook's permission_suggestions). */
export interface PermissionSuggestionInfo {
  /** Position in the list the hook received: it's what goes back in the decision (the hook applies the original suggestion). */
  index: number;
  /** Rules in Claude Code's permissions format, e.g. "Bash(npm test:*)". */
  rules: string[];
  /** Where the rule is stored: 'session', 'localSettings', 'projectSettings' or 'userSettings'. */
  destination: string;
}

/**
 * Pending permission request that can be answered via Habblaud: Claude Code's PermissionRequest hook
 * (mod/habblaud-permissoes/hooks/permission-hook.mjs) registers it and waits for the decision. Only exists with a local bind (the same
 * lock as the terminal) and with some Habblaud page open.
 * In the snapshot it goes without `input` (the full arguments only come out via GET /api/permissions/:id, with local
 * access); the demo's fake requests already come with it.
 */
export interface PermissionRequestInfo {
  id: string;
  /** Requester's tool; absent = 'claude'. */
  provider?: Provider;
  /** Raw tool name (e.g. "Bash", "Edit", "mcp__github__create_issue"). */
  tool: string;
  /** Title in Claude Code style: "Bash(npm test)", "Edit(src/app.ts)". Masked and truncated. */
  title: string;
  /** Summary in PT-BR (e.g. "Rodando os testes") and the activity icon. */
  text: string;
  icon: string;
  /** Arguments (command, diff, JSON...), masked and truncated. */
  input?: string;
  inputKind?: TerminalInputKind;
  /** Request from a subagent Habblaud doesn't show yet: its type (e.g. "Explore"). */
  subagent?: string;
  /** "Always allow" rules that can be applied along with the approval. */
  suggestions?: PermissionSuggestionInfo[];
  /**
   * AskUserQuestion request: the questions, to answer from the office (`answer` decision). Also goes in the
   * snapshot (without them the card has nothing to show).
   */
  questions?: AskQuestion[];
  /** Other requests from the same agent waiting after this one. */
  queued?: number;
  createdAt: number;
  /** When the hook gives up waiting and the request is only valid in the terminal. */
  expiresAt: number;
}

/**
 * Answer to an AskUserQuestion question, by POSITION (AskQuestion.index and the options' `index`): the hook swaps
 * the positions for the original texts it received from Claude Code (the page only sees the masked, truncated texts).
 */
export interface PermissionAnswer {
  /** AskQuestion.index. */
  question: number;
  /** Positions of the chosen options (only one without multiSelect). */
  options?: number[];
  /** Free text ("Other"). Without multiSelect, it counts in place of an option. */
  other?: string;
}

/** Body of POST /api/permissions/:id/decision (coming from the page). */
export interface PermissionDecision {
  /**
   * allow = approve; deny = deny; terminal = hand the request back to the terminal (the hook exits without deciding);
   * answer = answer the questions of an AskUserQuestion (`answers`).
   */
  behavior: 'allow' | 'deny' | 'terminal' | 'answer';
  /** Deny: reason passed on to the agent. */
  message?: string;
  /** Deny: interrupts the agent (it stops and waits for you). */
  interrupt?: boolean;
  /** Approval: also applies the suggestion at this position (PermissionSuggestionInfo.index). */
  suggestion?: number;
  /** Answer (`answer`): one per question of the request. */
  answers?: PermissionAnswer[];
}

// ------------------------------------------------------------------ messages from the office

/**
 * Status of a message sent by the page to an agent (GET /api/messages/:id):
 * queued = waiting for the session to fetch it; sent = the session fetched it and is delivering; delivered = entered the
 * session (or its queue, if the agent was busy); failed = didn't enter (`error` says why).
 */
export type OutboxStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface OutboxMessage {
  id: string;
  /** AgentInfo.id of the recipient (always a main agent). */
  agentId: string;
  status: OutboxStatus;
  error?: string;
  createdAt: number;
  /** Last status change. */
  updatedAt: number;
}

/** Interactive terminal state (OfficeSnapshot.meta.pty). */
export interface PtyStatus {
  enabled: boolean;
  /** Why it's off. */
  reason?: string;
}

/** Interactive terminal opened by Habblaud (node-pty on the server, xterm.js in the browser). */
export interface PtyInfo {
  id: string;
  /** Claude Code PID: the corresponding agent is `${account}:${pid}` (= agentId). */
  pid: number;
  cwd: string;
  account: string;
  agentId: string;
  /** Resumed session (`claude --resume`), when the terminal took over a session that already existed. */
  resumed?: string;
  /** Agent this terminal took over (the old id, of the ended process). */
  fromAgent?: string;
  startedAt: number;
  exitedAt?: number;
  exitCode?: number;
}

/** Message delivered to the habblaud-mensagens plugin (POST /api/mod/inbox). */
export interface InboxMessage {
  id: string;
  /** The text as it was typed: the plugin sends it to the session as if you had typed it. */
  text: string;
}
