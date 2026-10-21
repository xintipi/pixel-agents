# Habblaud's Claude Code plugins

The repository is also a Claude Code plugin marketplace: `.claude-plugin/marketplace.json` (at the root) lists the
`habblaud` marketplace with three plugins, one in each folder here: the `habblaud` mod (it only observes),
`habblaud-permissoes` (answer permissions from the office) and `habblaud-mensagens` (send messages from the office).
`npm run mod:install` installs all three; `--sem-permissoes` and `--sem-mensagens` leave out the respective one.
Versions follow `package.json` (the `server/test/mod.test.ts` test fails if they diverge).

Tested with **Claude Code 2.1.293** (`habblaud-mensagens`, for now, only through `claude plugin test` on 2.1.295).
Mods (TypeScript hooks loaded by Claude Code itself) exist since 2.1.287; the API is still "early access" and may
change between versions. On earlier versions, use the usual installers (`npm run usage:install` and
`npm run hooks:install`); sending messages from the office only exists with the mod. Installation is described in
the main README.

## `habblaud` — the mod

`habblaud/hooks/register.ts`, a single module, no build. It connects each session to the office without reading the
conversation:

- **Plan usage (5h and weekly):** at session start and on every `session.measure` (after each turn and whenever a
  limit moves by one point) it reads `$.session.usage().rateLimits` and writes `~/.habblaud/usage/<account>.json` (or
  into `HABBLAUD_USAGE_DIR`) in the same format as the statusline tap, plus `"source": "mod"`. It replaces
  `npm run usage:install`: your statusline is left untouched. The account is the `CLAUDE_CONFIG_DIR` folder (its
  first item) or `~/.claude` (`~` is `HOME`; on Windows without it, `USERPROFILE`). Identical values written less
  than 10 s ago are not rewritten; a failed write = silence.
- **"Needs you" below the prompt:** every 5 s it asks the local Habblaud
  (`GET http://127.0.0.1:<HABBLAUD_PORT or 4747>/api/mod/summary`) who is waiting, already excluding this session and
  its subagents, and shows `🏢 Valentina needs you in loja-virtual` or
  `🏢 2 need you: Valentina (loja-virtual), Elias (app-mobile)` (up to 3 names, then "and N more"). Nobody waiting or
  Habblaud down: the line disappears; while it is down, it asks every 30 s until it comes back. Only in sessions that
  render (with `claude -p` it asks nothing).
- **`/habblaud`:** a summary of the whole office, answered by the mod itself (it doesn't call the model and uses no
  usage):

  ```
  Habblaud 0.3.0 at http://localhost:4747
  7 agents · 3 working · 2 need you
  ✋ Valentina (loja-virtual): approve a permission · can be answered from the office
  ✋ Elias (app-mobile): answer in the terminal
  ```

  When it is down: `Habblaud did not respond at http://localhost:4747. To start it: npm run docker:up in the Habblaud folder.`

### What it accesses

Output of `claude plugin validate --strict mod/habblaud` (the static analysis Claude Code runs before loading the
module; nothing outside this list is called):

```
❯ ./register.ts hooks: session.start, session.measure, command.run{command=habblaud}
❯ ./register.ts answers its own command: command.run{command=habblaud}
❯ ./register.ts calls: $.clock.after (via askHabblaud), $.clock.every (via schedule), $.clock.now (via writeUsage), $.command.register, $.env.get (via readEnv), $.fs.write (via writeUsage), $.http.fetch (via askHabblaud), $.session.id (via poll), $.session.surfaces (via poll), $.session.usage, $.ui.status (via setStatus)
❯ ./register.ts env writes: nothing
❯ ./register.ts env reads: CLAUDE_CONFIG_DIR, HABBLAUD_PORT, HABBLAUD_USAGE_DIR, HOME, USERPROFILE
```

In words: it only observes (no hook decides anything: it doesn't approve tools, change prompts or read messages),
writes a single file (the usage one), talks only to `127.0.0.1` and reads five environment variables.
`$.clock.after` is the 2 s deadline of each request to Habblaud (`$.http.fetch` doesn't accept an AbortSignal).

## `habblaud-permissoes` — answer permissions from the office

A plain `PermissionRequest` hook (no mod), in `habblaud-permissoes/hooks/hooks.json`:

```json
{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/permission-hook.mjs\"", "timeout": 86430, "statusMessage": "Waiting for an answer in Habblaud" }] }
```

The `hooks/permission-hook.mjs` script is the same one `npm run hooks:install` installs (single source; plain Node,
only `node:*`, because Claude Code copies just the plugin folder into its cache). It sends the request to the local
Habblaud and waits up to 5 min for the answer; the dialog stays open in the terminal and whichever answer comes first
wins. Without Habblaud running or with no page open, it exits right away. Port: `HABBLAUD_PORT` (default 4747); wait:
`HABBLAUD_PERMISSION_TIMEOUT` (default 300 s, up to 86400 s = 24 h; the hook timeout in the plugin is 86430 s). To
approve from your phone away from the computer, put `"env": { "HABBLAUD_PERMISSION_TIMEOUT": "86400" }` in the
account's `settings.json`: it applies to sessions opened afterwards. Background subagents only show the dialog when
the hook finishes, which is why the default stays at 5 min. Requires `node` 22+ on the session's `PATH`.

`claude plugin validate --strict mod/habblaud-permissoes`: `✔ Validation passed` (the validator also checks the
`hooks.json` schema).

## `habblaud-mensagens` — messages from the office

`habblaud-mensagens/hooks/register.ts`, a single module, no build. It brings into the session what you type in the
office (in the agent panel or in the T-key terminal), as if you had typed it in the terminal:

- **Fetch:** every 2 s, only in sessions that render (with `claude -p` it asks nothing),
  `POST http://127.0.0.1:<HABBLAUD_PORT or 4747>/api/mod/inbox` with `{session, account}`. The request also marks the
  session as present: that is what shows the agent's message box on the page (without the plugin, the page suggests
  installing it). When Habblaud is down, or answers anything else (403 with messages turned off, 404 on a version
  without the route), it asks every 30 s until it comes back.
- **Delivery:** each message, in order, goes through `$.prompt.submit({ text, asUser: true })`. The model reads the
  text as yours, without the "The habblaud-mensagens plugin sent a message" (the session log still says it came from
  the plugin), and the text goes exactly as it was typed. With the session in the middle of a turn, Claude Code keeps
  the prompt and runs it in a turn of its own when the current one ends (a plugin prompt never enters mid-turn, the
  way a typed one can). A hook that refuses the message (`{drop}`) or an exception becomes a failure, with the
  reason, on the page.
- **Confirmation:** a single `POST /api/mod/inbox/ack` with the result of each one
  (`{session, results: [{id, ok, error?}]}`). The wait per message is at most 2 s: past that, the session is busy,
  the message is in its queue and counts as delivered (the following ones go right after, in order). This way a round
  never takes more than a few seconds and the server's presence (10 s) and confirmation (30 s) timeouts don't expire
  because the session is busy; the price is that a refusal after those 2 s doesn't reach the page.

It is kept separate from the `habblaud` mod on purpose: that one only observes; this one acts, typing into the
session on your behalf. To go without it: `npm run mod:install -- --sem-mensagens` (one already installed stays; to
remove it: `claude plugin uninstall habblaud-mensagens@habblaud`). `npm run docker:up` updates the plugin for those
who already have it, but doesn't install it on its own: on an account with the mod and without it, it only suggests
running `npm run mod:install`.

### What it accesses

Output of `claude plugin validate --strict mod/habblaud-mensagens`:

```
❯ ./register.ts hooks: session.start
❯ ./register.ts calls: $.clock.after (via waitAtMost), $.clock.every (via schedule), $.env.get (via readEnv), $.http.fetch (via postJson), $.prompt.submit (via submitOne), $.session.id (via round), $.session.surfaces (via round)
❯ ./register.ts env writes: nothing
❯ ./register.ts env reads: CLAUDE_CODE_ENTRYPOINT, CLAUDE_CONFIG_DIR, HABBLAUD_PORT, HOME, USERPROFILE
```

In words: a single hook (`session.start`, which starts the round timer); the only action in the session is the
`$.prompt.submit` of the messages; it doesn't read the conversation, writes no files, talks only to `127.0.0.1` and
reads four environment variables (the account comes from `CLAUDE_CONFIG_DIR`, as in the mod). `$.clock.after` is the
2 s deadline of each request to Habblaud and of each `$.prompt.submit`.

Port: `HABBLAUD_PORT` (default 4747). Requires Claude Code 2.1.287+ and a Habblaud with messages turned on: the same
lock as the terminal and permissions (port bound to `127.0.0.1` and a local Host header) and `HABBLAUD_MENSAGENS` not
turned off (`0`, `false`, `off` or `no` turn it off). Any process on this machine that talks to Habblaud can send a
message to the sessions with the plugin: hence the local lock.

## Development

```bash
claude --plugin-dir mod/habblaud                     # loads the mod in a session, without installing (reloads on save)
claude -p "/habblaud" --plugin-dir mod/habblaud      # tests the command without an interactive session (doesn't call the model)
cd mod/habblaud && claude plugin test                # mod tests (tests/*.test.ts), no session, login or network
cd mod/habblaud-mensagens && claude plugin test      # same for the messages plugin
claude plugin validate --strict mod/habblaud         # static analysis + manifest (same for the other folders and .)
npx tsc -p mod/habblaud                              # types (after loading the mod once with --plugin-dir)
```

When loading a mod, Claude Code writes the installed version's types to `<folder>/.claude-plugin/types/` and a
`<folder>/tsconfig.json` that extends them; both are generated and kept out of git (`mod/.gitignore`). The mods'
tests import `claude-code/testing` and only run through `claude plugin test`: `npm test` (vitest) and
`npm run typecheck` don't look at this folder.
