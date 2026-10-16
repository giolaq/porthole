# Porthole Development Plan 4 — One Device, Two Operators

> Audience: Codex (or any coding agent) executing this plan.
> Sequel to `docs/history/CODEX_PLAN.md`, `docs/history/CODEX_PLAN_2.md`, and
> `docs/history/CODEX_PLAN_3.md` (all implemented; portholejs 0.4.0 is on npm with
> green 3-OS CI, 78 unit tests, Vega support).
>
> Goal: turn Porthole into a showcase of **how to adapt a tool for
> human–agent collaboration**. Today a human (browser) and an agent (MCP)
> can both drive an emulator, but they do it through _separate_ control
> paths and cannot see or coordinate with each other. This plan cleans the
> codebase, unifies the control plane, and then adds the collaboration
> primitives — shared activity, visible agent input, hand-off, and
> agent↔human questions — that make the story demoable.
>
> Read `CLAUDE.md`, `AGENTS.md`, and `docs/PRD.md` first. Conventions there
> are binding.

## Ground rules for the agent

1. **One phase at a time, one PR per phase.** A phase is done when
   `npm run build && npm run test && npm run lint && npm run typecheck` are
   all green AND every acceptance criterion in that phase passes. Do not
   start phase N+1 on a red phase N.
2. **Verify APIs before use.** `@yume-chan/*` and
   `@modelcontextprotocol/sdk` APIs must be checked against the installed
   version's typings / current npm docs — never from memory. In particular,
   confirm `McpServer.registerTool`, tool `annotations`, `outputSchema` /
   `structuredContent`, and `InMemoryTransport` exist in the installed SDK
   version before using them (bump the SDK minor version if needed).
3. **Engine boundary.** Nothing outside `packages/porthole/src/engine/`
   may import `ScrcpyEngine` or `VegaEngine` except `session.ts`. After
   Phase 1, `mcp/` must not import either.
4. **No new runtime dependencies** unless this plan names them. No native
   binaries. No web frameworks for the HTTP server (keep `http` + `ws`).
5. **Non-goals still hold** (PRD §4): no iOS, no physical devices, no audio,
   no accounts/auth beyond the existing LAN token.
6. Strict TypeScript, no `any` without a justifying comment, kebab-case
   filenames, small single-purpose modules, conventional commits.
7. **Behavior-preserving refactors stay behavior-preserving.** Phase 0 and
   Phase 1 must not change any CLI output, `-q` JSON schema, HTTP route, or
   MCP tool name/argument. Existing tests must pass unmodified, except where
   a test imports a file that moved (update the import path only).
8. Unit tests for all pure logic and for every new HTTP route / MCP tool,
   using a fake engine (no emulator). Emulator tests stay gated behind
   `PORTHOLE_EMU=1`, browser e2e behind `PORTHOLE_E2E=1`.

## Current state (verified 2026-10-16)

- `npm ci && npm run build && npm run test && npm run lint && npm run typecheck`
  — all green. 21 test files, 78 tests, 1 skipped (emulator-gated).
- Three control paths exist:

  | Operator             | Path                                                            | Shares the live `Session`? |
  | -------------------- | --------------------------------------------------------------- | -------------------------- |
  | Human in the browser | `porthole-client` → WS `/ws` + HTTP `/api/*` → `Session`        | yes                        |
  | CLI / shell agent    | `control-client.ts` → HTTP `/api/*` of the running server       | yes                        |
  | MCP agent            | `mcp/server.ts` → its **own** `new ScrcpyEngine(...)` + globals | **no**                     |

- Consequences of the MCP fork:
  - MCP actions are invisible to the browser and to other clients.
  - A second scrcpy server is pushed to the same device when a browser
    session is also running.
  - MCP has no multi-device, no Vega, no LAN-token path, and bypasses the
    HTTP layer's validation.
  - Logic is duplicated between `server/http.ts` and `mcp/server.ts`:
    `focusOn`, `dumpUi`, `findElement`, `waitForUiText`, `parseCrashes`,
    `openUrl`/`stopApp`/`clearApp`, `sendGesture`, `assertInputAllowed`.
  - MCP errors are returned as ordinary text content (never `isError: true`),
    so agents cannot reliably tell failure from success.
  - `mcp/server.ts` uses the deprecated `server.tool(...)` registration.
- Hygiene issues:
  - `zod` is imported by `mcp/server.ts` but is not declared in
    `packages/porthole/package.json` (it resolves only because the MCP SDK
    pulls it in transitively).
  - `mcp/server.ts` (`read_logcat`) and `engine/scrcpy-engine.ts:220` call a
    bare `"adb"` instead of `adbBin(findAndroidSdk())`.
  - `mcp/server.ts` repeatedly does `await import("node:child_process")` /
    `await import("node:util")` inside handlers.
  - `porthole-client/src/video-canvas.tsx` has unconditional `console.log`
    debug lines (lines ~129 and ~183).
  - `cli.ts` is 1135 lines; `server/http.ts` is 699 lines of sequential
    `if (url === ...)` blocks.
  - `AGENTS.md` and `CLAUDE.md` have drifted (`legacy singular skill path` vs
    `skills/porthole/SKILL.md`; the scrcpy-server rule exists only in
    `AGENTS.md`).
  - `docs/PRD.md` §7 layout lists files that do not exist (`mcp/tools.ts`,
    `skill/`) and omits Vega, `examples/`, `e2e/`, and `action.yml`.
  - The only MCP test asserts that `startMcpServer` is a function.

---

## Phase 0 — Cleanup (no behavior change)

### 0.1 Single source of agent instructions

- Make `AGENTS.md` the canonical conventions file. Merge in anything that is
  only in `CLAUDE.md` (repository layout with `skills/porthole/SKILL.md`,
  the `scrcpy-server` notes) and fix the layout block to match reality.
- Replace the body of `CLAUDE.md` with a single line `@AGENTS.md` (the same
  pattern `examples/rn-tvos-app/CLAUDE.md` already uses).
- **Acceptance:** `CLAUDE.md` is one line; `AGENTS.md` layout block matches
  `ls` of the repo; no reference to the legacy singular skill path remains.

### 0.2 Docs housekeeping

- Create `docs/history/` and `git mv` into it: `CODEX_PLAN.md`,
  `CODEX_PLAN_2.md`, `CODEX_PLAN_3.md`, `VEGA_EXPLORATION.md`,
  `ADR-MJPEG.md`. Leave `CODEX_PLAN_4.md` (this file) in `docs/` until it is
  done.
- Add `docs/history/README.md`: one paragraph per file — what it asked for,
  which release shipped it, and the commit range (use `git log` to find
  them). This is presentation material ("how the agent was briefed").
- Update every reference to the moved files (`grep -rn "CODEX_PLAN\|VEGA_EXPLORATION\|ADR-MJPEG" --exclude-dir=node_modules .`),
  including `README.md` and `docs/PRD.md` §4.
- Update `docs/PRD.md` §7 layout to the real tree (include `engine/vega-engine.ts`,
  `server/mjpeg.ts`, `examples/rn-tvos-app`, `e2e/`, `action.yml`,
  `skills/porthole/SKILL.md`; drop `mcp/tools.ts`). Add a short "Added after
  v1" bullet for Vega and multi-device.
- **Acceptance:** no dangling doc links; `npm run lint` (Prettier) green.

### 0.3 Dependency and correctness fixes

- Add `zod` to `packages/porthole/package.json` `dependencies`, pinned to
  the major version the installed MCP SDK uses (check
  `node_modules/@modelcontextprotocol/sdk/package.json`). Run `npm install`
  so `package-lock.json` updates.
- Replace bare `"adb"` in `mcp/server.ts` and `engine/scrcpy-engine.ts` with
  `adbBin(findAndroidSdk())` (or the engine's existing adb path option, if it
  has one — read the file first).
- Replace the in-handler dynamic `node:child_process` / `node:util` imports
  in `mcp/server.ts` with top-level imports and one module-level
  `execFileAsync = promisify(execFile)`. (Most of this code is deleted in
  Phase 1 anyway; do the minimal fix here.)
- Gate the `console.log` lines in `video-canvas.tsx` behind a
  `debug` flag read once from `?debug=1` in the page URL.
- **Acceptance:** `grep -n '"adb"' packages/porthole/src -r` returns only
  test files and `doctor.ts`'s label string; build/test/lint/typecheck green.

### 0.4 Split `cli.ts`

Target layout (names are a suggestion; keep files < ~300 lines):

```
packages/porthole/src/cli.ts              entry: builds `program`, registers groups, parses argv
packages/porthole/src/cli/shared.ts       runCliAction, printResult, sessionControlOpts, parse helpers
packages/porthole/src/cli/lifecycle.ts    list, doctor, start, kill, mcp
packages/porthole/src/cli/start-flow.ts   boot/attach resolution, Vega start, detach spawning
packages/porthole/src/cli/input.ts        tap, swipe, longpress, scroll, key, remote, text, rotate, emu
packages/porthole/src/cli/inspect.ts      screenshot, assert-screen, record, focused, focus-on, dump-ui, wait-for
packages/porthole/src/cli/apps.ts         open-url, stop-app, clear-app
```

- Each group exports `register(program: Command): void`.
- Keep `bin` pointing at `dist/cli.js`.
- Extract the detached-server spawning code into an exported
  `startDetachedSession(opts)` function in `cli/start-flow.ts`; Phase 1.3
  reuses it from MCP.
- **Acceptance:** `porthole --help` and `porthole <cmd> --help` output is
  byte-identical before and after (capture both to files in the PR
  description and `diff` them); `cli-errors.test.ts` and the npm-pack smoke
  in CI still pass.

### 0.5 Split `server/http.ts` into a route table

- Introduce a tiny router (no dependency):

  ```ts
  // server/router.ts
  export interface RouteContext {
    req;
    res;
    url: URL;
    deviceId?: string; /* deps */
  }
  export interface Route {
    method: "GET" | "POST";
    path: string;
    handler(ctx: RouteContext): Promise<void>;
  }
  ```

- Move handlers into `server/routes/*.ts` grouped by concern:
  `health.ts` (`/health`, `/api/state`, `/api/devices`), `media.ts`
  (`/screenshot`, `/stream.mjpeg`), `input.ts` (`/api/input`, `/api/rotate`,
  `/api/emu`), `ui.ts` (`/api/ui`, `/api/focused`, `/api/focus_on`,
  `/api/find`, `/api/wait_for`), `apps.ts` (`/api/open_url`, `/api/stop_app`,
  `/api/clear_app`, `/api/apps`, `/api/launch`, `/api/install`,
  `/api/push`), `logs.ts` (`/api/logcat`, `/api/crashes`).
- Token checking, JSON body parsing, and the JSON error response shape
  (`{ error: string }`) live in one place in `router.ts`.
- **Acceptance:** every existing route returns the same status code and body
  shape for success and error (add a table-driven test
  `__tests__/http-routes.test.ts` with a fake engine that hits each route
  once before the refactor, commit it, then refactor with the test
  unchanged).

### 0.6 Shared test helper

- Add `packages/porthole/src/__tests__/helpers/fake-engine.ts`: an `Engine`
  implementation that records `sendInput` calls, returns a fixed 1×1 PNG
  from `screenshot()`, and exposes `emitChunk()` for video tests. Use it in
  0.5 and all later phases.

---

## Phase 1 — One control plane

The browser, the CLI, and MCP must all go through the same `Session` and the
same action code. This is the central refactor; Phase 2 is cheap once it
lands.

### 1.1 Actor identity in the protocol

In `packages/porthole/src/protocol.ts` (no Node imports — it is shared with
the client):

```ts
export type ActorKind = "human" | "agent" | "cli" | "ci";
export interface Actor {
  kind: ActorKind;
  /** Free-form client id, e.g. "mcp", "claude-code", "browser-<tabid>". */
  id?: string;
}
export const ACTOR_HEADER = "x-porthole-actor"; // value: "<kind>" or "<kind>:<id>"
export function formatActor(actor: Actor): string;
export function parseActor(value: string | undefined | null, fallback: Actor): Actor;
```

- `parseActor` rejects unknown kinds by returning `fallback`, trims `id` to
  64 chars, and allows only `[A-Za-z0-9._-]` in `id`.
- Defaults: WS input from the browser → `{ kind: "human", id: "browser" }`;
  HTTP without the header → `{ kind: "cli" }`.
- `control-client.ts` gains an `actor?: Actor` option and sends the header on
  every request; the CLI passes `{ kind: "cli" }`, or `{ kind: "ci" }` when
  `process.env.CI` is set.
- **Tests:** `protocol.test.ts` round-trips and rejects malformed values.

### 1.2 Actions layer

Create `packages/porthole/src/actions/`:

```
actions/context.ts     ActionContext { session: SessionHandle; deviceId: string; actor: Actor }
actions/input.ts       sendInput(ctx, InputEvent)  — validation + gesture expansion
actions/screen.ts      screenshot(ctx), captureFrame(ctx)
actions/ui.ts          dumpUi, getFocused, focusOn, findElement(tap?), waitFor
actions/apps.ts        openUrl, stopApp, clearApp, listApps, launch, installApk, pushFile
actions/device.ts      rotate, emu
actions/logs.ts        logcat, crashes
actions/recording.ts   startRecording, stopRecording (server-side, see 1.4)
actions/errors.ts      PortholeError { code, message, httpStatus, retryable }
```

- `SessionHandle` is a narrow interface implemented by `Session`
  (`getEngine(deviceId)`, `getDevice(deviceId)`, `serial(deviceId)`,
  `defaultDeviceId()`), so actions are testable with the fake engine.
- Every action is `async (ctx, params) => result` and throws `PortholeError`
  on failure. Error codes to start with: `NO_DEVICE`, `DEVICE_NOT_READY`,
  `TOUCH_NOT_SUPPORTED` (TV profile), `NOT_SUPPORTED_ON_VEGA`,
  `NOT_FOUND` (UI element), `TIMEOUT`, `BAD_REQUEST`, `ADB_FAILED`.
- HTTP routes (from 0.5) and WS input become thin adapters:
  parse → build `ActionContext` → call action → serialize. The router maps
  `PortholeError` to `{ error, code, retryable }` with `httpStatus`. Keep the
  existing `error` string identical so CLI output does not change.
- **Acceptance:** `grep -rn "focusOn(\|dumpUi(\|findElement(\|waitForUiText(\|parseCrashes(\|sendGesture(" packages/porthole/src --include=*.ts | grep -v __tests__`
  shows calls only from `actions/` (and the defining modules).

### 1.3 MCP becomes a session client

Rewrite `packages/porthole/src/mcp/` as:

```
mcp/server.ts          builds McpServer, registers tools from tools/*, connects stdio
mcp/session-link.ts    which Porthole session/device MCP is bound to; discovery + auto-start
mcp/tools/lifecycle.ts list_devices, boot_device, wait_for_boot, attach_device
mcp/tools/input.ts     tap, swipe, long_press, scroll, key, remote, type_text
mcp/tools/screen.ts    screenshot, assert_screen, start_recording, stop_recording
mcp/tools/ui.ts        dump_ui, get_focused, focus_on, find_element, wait_for
mcp/tools/apps.ts      open_url, stop_app, clear_app, install_apk
mcp/tools/logs.ts      read_logcat, get_crashes
mcp/result.ts          ok(json), image(png), fail(PortholeError) helpers
```

- `session-link.ts`:
  - `attach_device({ serial })` → `discoverSession({ device: serial })`. If
    no live session serves that serial, start one with
    `startDetachedSession({ devices: [serial], preview: false, quiet: true })`
    (from 0.4) and then discover it. Store `{ port, serial }` in a small
    `SessionLink` object (not loose module globals).
  - Add optional `port` to `attach_device` for explicit targeting.
  - Every tool sends `x-porthole-actor: agent:mcp` via `control-client.ts`.
- All device operations go through HTTP (`control-client.ts`). `mcp/` must
  not import `engine/*`, `session.ts`, `recording.ts`, or `ui-tree.ts`.
  `list_devices`, `boot_device`, and `wait_for_boot` may keep using
  `device-manager.ts` directly (they are pre-session).
- `assert_screen` fetches `/screenshot` and runs `comparePngScreens`
  locally, exactly as `porthole assert-screen` does today — factor that into
  a shared function used by both.
- Tool names, argument names, and success payloads stay the same. The only
  intended behavior change: failures now set `isError: true` (see 1.5).
- **Acceptance:**
  - `grep -rn "ScrcpyEngine\|VegaEngine" packages/porthole/src/mcp` is empty.
  - With a browser open on `porthole start`, MCP `attach_device` reuses the
    same server (verify manually with `PORTHOLE_EMU=1`; note the result in
    the PR). The device runs exactly one scrcpy server
    (`adb shell ps -A | grep -c scrcpy` → 1).
  - MCP now works against a Vega session (`porthole start --vega`) for
    `remote`, `screenshot`, `assert_screen` without Vega-specific MCP code.

### 1.4 Server-side recording

- Recording is currently client-side (`recordSession` in the CLI; a
  module-global `H264Recorder` in MCP). Move it into the session:
  `POST /api/recording/start { path? }` and `POST /api/recording/stop`
  → `{ path, durationMs, bytes }`. One active recording per device; a
  second start returns `409` with code `RECORDING_ACTIVE`.
- `porthole record` keeps its CLI contract (start, wait for `--duration`
  or Ctrl+C, stop). MCP `start_recording` / `stop_recording` call the
  routes. Vega returns `NOT_SUPPORTED_ON_VEGA`.
- **Tests:** route tests with the fake engine emitting config + keyframe
  chunks; assert a valid MP4 header in the output (reuse
  `mp4-writer.test.ts` helpers).

### 1.5 MCP surface modernization

Verify each API against the installed SDK first (ground rule 2).

- Register tools with `server.registerTool(name, { title, description,
inputSchema, outputSchema?, annotations }, handler)`.
- Annotations:
  - `readOnlyHint: true`: `list_devices`, `screenshot`, `assert_screen`,
    `dump_ui`, `get_focused`, `find_element` (when `tap` is false),
    `wait_for`, `read_logcat`, `get_crashes`.
  - `destructiveHint: true`: `clear_app`, `stop_app`, `install_apk`.
  - `idempotentHint: true` where it holds (`open_url` is not; `stop_app` is).
- Errors: `mcp/result.ts` `fail(err)` returns
  `{ isError: true, content: [{ type: "text", text: JSON.stringify({ error, code, retryable }) }] }`.
  No handler may return a bare "No active session" text as a success.
- Structured output for JSON tools (`list_devices`, `dump_ui`,
  `get_focused`, `find_element`, `get_crashes`, `assert_screen`): return
  `structuredContent` alongside the text content.
- Set the server `instructions` string (if the SDK supports it) to a
  4–6 line summary of the collaboration protocol from Phase 2.6.
- `screenshot` keeps returning an `image` content block; add an optional
  `{ save?: string }` argument that also writes the PNG to disk and returns
  the path as text.

### 1.6 Real MCP tests

- Replace `__tests__/mcp.test.ts` with tests that start the HTTP server on
  an ephemeral port with the fake engine, write a temporary
  `PORTHOLE_STATE_FILE`, connect an MCP `Client` to the server over the
  SDK's in-memory transport, and exercise: `attach_device` (existing
  session), `tap`, `remote`, `screenshot` (image block), `dump_ui` error on
  a fake engine with no adb (`isError: true`), TV-profile `tap` rejection
  (`code: "TOUCH_NOT_SUPPORTED"`), and the `x-porthole-actor` header reaching
  the server.
- If `startMcpServer` hard-wires stdio, split it into
  `createMcpServer(): McpServer` (testable) and `startMcpServer()` (stdio).

---

## Phase 2 — Collaboration primitives

Every feature in this phase must be usable from **both** sides: the browser
(human) and MCP/CLI (agent). That symmetry is the point of the demo.

### 2.1 Activity bus

- New `packages/porthole/src/activity.ts`:

  ```ts
  export interface ActivityEvent {
    id: number; // monotonically increasing per server
    ts: string; // ISO time
    deviceId: string;
    actor: Actor;
    action: string; // "tap" | "remote" | "focus_on" | "screenshot" | "note" | ...
    params?: Record<string, unknown>; // sanitized: no file contents, text truncated to 200 chars
    outcome: "ok" | "error" | "rejected";
    error?: { code: string; message: string };
    durationMs?: number;
  }
  export class ActivityBus {
    publish(e);
    since(id, limit);
    subscribe(cb): () => void;
  }
  ```

  Ring buffer of the last 500 events; pure, unit-tested.

- The actions layer (1.2) publishes one event per action call (wrap in a
  single `runAction(ctx, name, params, fn)` helper so no action forgets).
  Skip high-frequency noise: do not publish individual touch `move` events
  from browser drags; publish the gesture once.
- The type `ActivityEvent` lives in `protocol.ts` so the client can import it.
- HTTP: `GET /api/activity?since=<id>&limit=<n>&wait=<ms>` — long-poll up to
  `wait` (max 30 000) when nothing newer than `since` exists.
- WS: the server now also sends **text** frames
  `{"type":"activity","event":ActivityEvent}` to every client of that device.
  Update the client WS handling so binary frames go to the video decoder and
  text frames go to a new `useServerEvents` hook (check
  `video-canvas.tsx` early-message buffering does not choke on strings).
- CLI: `porthole activity [--follow] [-q]` prints events (`-q` → one JSON
  object per line).
- MCP: `get_recent_activity({ since?, limit? })` (read-only).

### 2.2 Activity feed and agent "ghost" input in the browser

- New `porthole-client/src/activity-feed.tsx`: a collapsible right-hand
  panel listing events newest-first with an actor badge (👤 human, 🤖 agent,
  ⌨️ cli, 🏗 ci), action, short params, outcome color, relative time. Toggle
  button in the header ("Activity"), open by default.
- New `porthole-client/src/input-ghost.tsx`: an overlay over the video
  canvas. For `tap` / `long_press` / `swipe` events whose actor is not the
  local human, draw a ripple (tap), ring (long press), or animated trail
  (swipe) at the normalized coordinates, fading out over ~800 ms. For
  `remote` events, briefly highlight the matching button in `tv-remote.tsx`.
- Respect `prefers-reduced-motion` (static marker instead of animation).
- **Acceptance:** Playwright e2e (`e2e/`, gated `PORTHOLE_E2E=1`): POST
  `/api/input` with `x-porthole-actor: agent:test` and assert the feed shows
  a 🤖 row and a ghost element appears.

### 2.3 Control hand-off ("take the wheel")

- Session-level control state per device:

  ```ts
  export interface ControlState {
    holder: "shared" | "human"; // "human" = agent/cli/ci input is paused
    since: string;
    by?: Actor;
    reason?: string;
  }
  ```

- `GET /api/control`, `POST /api/control { holder, reason? }`. Changes are
  published to the activity bus and pushed over WS as
  `{"type":"control","state":ControlState}`.
- While `holder === "human"`, any **mutating** action whose actor kind is
  not `human` fails with `PortholeError` code `PAUSED_BY_HUMAN`,
  `httpStatus: 423`, `retryable: true`, message
  `"A human has taken control of <device>. Wait, or call ask_human."`
  Read-only actions (screenshot, dump_ui, focused, logcat, activity) remain
  allowed so the agent can keep observing. Mark each action as
  mutating/read-only in one table in `actions/`.
- Browser: a prominent header toggle "🤖 Agent can act" / "✋ You have
  control", plus keyboard shortcut `Ctrl+Shift+Space`. Show a banner while
  paused. Show a toast when an agent action is rejected because of the pause.
- MCP: `get_control_state()` (read-only). CLI: `porthole control
[shared|human] [-q]`.
- **Tests:** unit tests for the gating table; route test that an
  `agent:mcp` tap gets `423` while `human` taps still work.

### 2.4 Ask the human

- Server-side question store per session:

  ```ts
  export interface HumanQuestion {
    id: string;
    deviceId: string;
    askedBy: Actor;
    text: string;
    options?: string[];
    createdAt: string;
    answer?: { text: string; by: Actor; at: string };
    status: "open" | "answered" | "expired";
  }
  ```

- Routes: `POST /api/questions { text, options?, timeoutMs? }` → question;
  `GET /api/questions/:id?wait=<ms>` long-poll;
  `POST /api/questions/:id/answer { text }`; `GET /api/questions?status=open`.
  Expire after `timeoutMs` (default 5 min, max 30 min). Published to
  activity and pushed over WS as `{"type":"question",...}`.
- Browser: a modal-less banner above the video with the question, option
  buttons, and a free-text field. A sound/visual cue is optional; no
  browser notifications permission prompt.
- MCP: `ask_human({ question, options?, timeoutSeconds? })` blocks until
  answered or timeout and returns `{ answered: true, answer }` or
  `{ answered: false, reason: "timeout" }` (not `isError`). Check whether
  the installed SDK supports MCP elicitation; if it does, note it in the
  ADR as a future alternative but implement the browser path — the human
  watching the stream is the one who should answer.
- CLI: `porthole ask "<question>" [--option A --option B] [--timeout 60s] -q`.

### 2.5 Human annotations for the agent

- Browser: an "Annotate" mode (button + `A` key while keyboard is not
  captured). Drag a rectangle on the video, type a note, submit. Draw saved
  annotations as outlined boxes until dismissed.
- Routes: `POST /api/annotations { rect: {x,y,w,h} (normalized 0..1), note }`,
  `GET /api/annotations?since=<id>`, `DELETE /api/annotations/:id`.
  Each annotation stores a PNG crop of the current screenshot region
  server-side (pngjs crop; no new dependency) so the agent sees what the
  human saw.
- MCP: `get_annotations({ since?, includeImages? })` returns notes plus,
  when requested, image blocks of the crops.
- **Inbox hint:** every MCP tool result appends a short text block
  `"ℹ︎ 2 unread human notes — call get_annotations"` /
  `"ℹ︎ 1 open question answered"` when applicable, so the agent notices
  without polling. Implement once in `mcp/result.ts`.

### 2.6 Agent narration

- MCP: `say({ message })` publishes an activity event with action `"note"`
  and the agent actor; the feed renders it as a speech bubble. Use it to
  narrate intent ("Navigating to Settings to check the toggle").
- CLI: `porthole say "<message>"`.
- The MCP server `instructions` (1.5) and the skill (3.2) tell agents to
  `say` before multi-step sequences and before anything destructive.

---

## Phase 3 — Agent-facing surface and docs

### 3.1 ADR

- `docs/ADR-shared-control-plane.md`: context (the three paths table from
  "Current state"), decision (single session + actions layer + actor
  identity + activity bus), alternatives considered (MCP keeps its own
  engine; MCP embeds the HTTP server; elicitation-only questions),
  consequences. Include before/after ASCII diagrams in the style of PRD §5.

### 3.2 Skill update

Update `skills/porthole/SKILL.md` with a "Working alongside a human"
section:

1. `attach_device`, then `get_control_state`; if `holder` is `human`,
   observe only.
2. `say` your intent before multi-step or destructive sequences.
3. On `PAUSED_BY_HUMAN`, stop, call `get_recent_activity` to see what the
   human did, and either wait or `ask_human`.
4. Check `get_annotations` whenever a tool result shows the inbox hint.
5. Use `ask_human` for ambiguous choices (which account, which build,
   whether a visual difference is a bug) instead of guessing.
6. After risky steps: `get_crashes`, `screenshot`.

Keep the existing CLI workflow sections; add the new tools to the MCP loop
list. Keep the frontmatter `description` under 1024 characters.

### 3.3 README and PRD

- README: new section "Humans and agents, one device" (what the feed,
  ghost input, hand-off, questions, and annotations do, with one screenshot
  or GIF placeholder `assets/collab-demo.gif` — leave a TODO comment if the
  asset is not produced yet). Update the MCP tool list and CLI reference
  table (`activity`, `control`, `ask`, `say`).
- PRD: add FR entries for actor identity, activity, control hand-off,
  questions, annotations. Mark them "Added in plan 4".

### 3.4 MCP resources (optional, only if time allows)

- Expose `porthole://activity` and `porthole://screen` as MCP resources
  with subscription updates, if the installed SDK supports resource
  subscriptions. Skip without guilt otherwise.

---

## Phase 4 — Showcase

### 4.1 Demo app hooks

- In `examples/rn-tvos-app`, make sure every movie card has stable
  `testID`/`accessibilityLabel` equal to the title so `focus_on`, `dump_ui`,
  and `find_element` target it reliably. Do not otherwise change the app's
  look. Add a `README.md` with build-and-install steps
  (`npx expo run:android` on a TV AVD) and how to run it with Porthole.

### 4.2 Demo script

- `docs/demo/human-agent-demo.md`: a 5-minute scripted walkthrough with
  exact prompts and commands:
  1. `porthole start <TV_AVD>`; browser opens; activity feed empty.
  2. In Claude Code (MCP configured): "Open the movie app and focus
     Interstellar." Feed shows 🤖 `say`, `open_url`/`remote`, `focus_on`;
     the D-pad highlights move.
  3. Human clicks "✋ You have control", navigates to Dune manually; agent's
     next `remote` gets `PAUSED_BY_HUMAN`; agent calls `get_recent_activity`
     and `ask_human("You moved to Dune — continue from there?")`.
  4. Human answers in the browser, hands control back, draws an annotation
     around a misaligned card ("border clipped here").
  5. Agent reads the annotation, takes a screenshot, runs
     `assert_screen` / `get_crashes`, and summarizes.
  6. `porthole record demo.mp4` running throughout produces the video.
- `scripts/demo-reset.sh` (repo root `scripts/` or `examples/rn-tvos-app/scripts/`):
  `porthole stop-app`, `clear-app`, relaunch, so the demo can be rerun.

### 4.3 E2E coverage of the story

- Extend `e2e/porthole.spec.ts` (gated `PORTHOLE_E2E=1`) with one scenario
  that drives the HTTP API as an agent and the page as a human: agent tap →
  feed row + ghost; human pauses → agent tap 423 + toast; agent asks →
  banner → human answers → agent long-poll resolves.

---

## Definition of done (whole plan)

- All phases merged, each with green `build`/`test`/`lint`/`typecheck` and
  green CI on all three OSes.
- `mcp/` has no engine imports; one scrcpy server per device regardless of
  how many operators are connected.
- Every action, from any operator, appears in the activity feed with the
  correct actor.
- A human can pause the agent from the browser, and the agent receives a
  clear, retryable error and can ask the human a question that the human
  answers from the same page.
- `docs/demo/human-agent-demo.md` runs end to end on a TV AVD with the
  example app.
- Bump `packages/porthole/package.json` to `0.5.0` in the final PR and add
  a release note summary to the PR description (do not publish to npm).
