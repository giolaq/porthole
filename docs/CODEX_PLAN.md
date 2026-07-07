# Porthole Development Plan — Road to "the `npx serve` of Android Emulators"

> Audience: Codex (or any coding agent) executing this plan.
> Benchmark: [EvanBacon/serve-sim](https://github.com/EvanBacon/serve-sim) — the iOS
> equivalent. Porthole should match its ergonomics and polish, adapted to Android.
> Read `CLAUDE.md` and `docs/PRD.md` first. Conventions there are binding.

## Ground rules for the agent

1. **One phase at a time.** A phase is done when `npm run build && npm run test &&
   npm run lint && npm run typecheck` are all green AND its acceptance criteria pass.
2. **Verify `@yume-chan/*` APIs against npm docs before use** — never from memory.
3. Engine details stay behind the `Engine` interface (`packages/porthole/src/engine/types.ts`).
4. Unit tests for all pure logic (no emulator). Integration tests gated behind
   `PORTHOLE_EMU=1`.
5. Non-goals still hold: no iOS, no physical devices, no audio. (Rotation/extended
   controls are now IN scope — Phase 5 — superseding PRD §4; update PRD when done.)
6. TypeScript strict, kebab-case files, small modules, conventional commits.

## Current state (verified by live run, 2026-07-07)

Working: `porthole list` / `start` (attach path) / `mcp`; scrcpy H.264 capture;
browser preview with touch overlay (phone) and D-pad remote (tv); profile
auto-detect; `/health`; `/screenshot` (PNG via sharp); WS video+input; MCP tools
`list_devices, boot_device, attach_device, tap, key, remote, type_text,
screenshot, read_logcat`; 24 unit tests.

Broken/missing: see Phase 0–1 bugs (each was reproduced live); everything in
Phases 2–6 does not exist yet.

---

## Phase 0 — Fix the four known bugs (all reproduced live)

### 0.1 `porthole start <avd>` cannot boot a stopped AVD
- **Repro:** `porthole start Pixel_8_Pro_API_34` with no emulator running →
  `Failed to start: Error: Device has no serial — is it running?`
- **Cause:** `packages/porthole/src/cli.ts` `start` action:
  `target = devices.find(d => d.name === avd || d.serial === opts.device)` matches
  the *stopped* AVD entry (which has no serial), so the boot branch
  (`if (!target && avd)`) never runs.
- **Fix:** only match running devices for direct attach; if the named AVD exists
  but is stopped, boot it. If `-d/--device` is given, it must match a running serial.
- **Test:** unit-test the target-selection logic (extract it to a pure function,
  e.g. `resolveTarget(devices, avd?, serial?) → {action: "attach"|"boot"|"error", ...}`).
- **Acceptance:** `porthole start <stopped-avd>` boots, waits for
  `sys.boot_completed=1`, attaches, prints preview URL.

### 0.2 Phantom AVD in `porthole list`
- **Repro:** first line of output is
  `INFO | Storing crashdata in: /tmp/... [phone] stopped`.
- **Cause:** `emulator -list-avds` writes `INFO |` diagnostics to stdout;
  `listAvds()` in `device-manager.ts` treats every line as an AVD name.
- **Fix:** filter lines: drop empty lines and anything matching `/^(INFO|WARNING|ERROR)\s*\|/`.
  AVD names match `/^[A-Za-z0-9._-]+$/`.
- **Test:** unit test with fixture output containing INFO lines.

### 0.3 `porthole kill` can never work across processes
- **Cause:** `bootedByUs` in `device-manager.ts` is an in-memory `Set` — a fresh
  `porthole kill` process always sees it empty.
- **Fix:** persist state to disk, serve-sim-style: `$TMPDIR/porthole/state.json`
  (or `~/.porthole/state.json`) recording `{serial, avdName, pid, port, startedAt}`
  for each session/boot. Write on boot, clean on shutdown. This file is also the
  foundation for Phase 1 (CLI → session discovery) and Phase 4 (`--detach`, `list`
  showing active streams).
- **Test:** unit-test read/write/merge of the state file with a temp dir.
- **Acceptance:** boot with `porthole start X`, Ctrl-C the server (emulator keeps
  running), run `porthole kill` from a new shell → emulator shuts down.

### 0.4 No recovery from stale/offline adb devices
- **Repro:** emulator shows `offline` in `adb devices` after host sleep;
  `porthole start` fails until a manual `adb reconnect offline`.
- **Fix:** in the attach path, if the target serial is `offline`, run
  `adb reconnect offline`, poll up to ~10s for `device` state, then proceed;
  clear error if it stays offline.

---

## Phase 1 — Real headless CLI input (kills the stubs)

`tap`, `key`, `remote`, `text` in `cli.ts` currently just print
"requires a running session". serve-sim solves this with helper state + a control
channel; do the Android equivalent:

- **1.1** Add a small JSON control API to the existing HTTP server:
  `POST /api/input` accepting the `InputEvent` union (already defined in
  `input.ts`), plus `GET /api/devices`, `GET /api/state`. Localhost-only unless
  the token (Phase 4.3) is presented.
- **1.2** CLI subcommands discover the running session via the Phase-0.3 state
  file (port), POST the event, print the result. `--port` overrides discovery.
  Exit non-zero with a clear message when no session is running.
- **1.3** `porthole remote <button>` validates against `REMOTE_BUTTON_TO_KEYCODE`
  (already does) and refuses `tap` on tv-profile sessions (FR-4.4) — enforce
  server-side in the input handler, not just the client.
- **1.4** Add `porthole screenshot [-o file.png]` — fetches `/screenshot`,
  writes PNG (default `./porthole-<serial>-<ts>.png`, `-q` prints the path as JSON).
- **Tests:** unit: CLI arg parsing → request payloads; server: input-route handler
  with a fake engine. Integration (`PORTHOLE_EMU=1`): `tap`/`remote` round-trip.
- **Acceptance:** with a session running, `porthole remote dpad_down` moves
  leanback focus (verify via `porthole screenshot`); `porthole tap 0.5 0.9`
  navigates a phone app. This closes PRD FR-6.2 and matches serve-sim's
  `gesture`/`button`/`type` ergonomics.

---

## Phase 2 — First-run experience & docs (serve-sim's biggest strength)

serve-sim's README sells the tool in 10 seconds: hero GIF, one-liner install,
copy-paste MCP snippet. Porthole has **no README at all**. This phase is as
important as any code.

- **2.1 README.md** (root):
  - Hero: one-line pitch ("A window into your Android emulator — `npx portholejs`"),
    animated GIF/webp of the browser UI driving a phone AND the TV remote driving
    leanback (record with the existing UI; keep under ~4MB).
  - Quick start: prerequisites (Android SDK, `emulator`, `adb`; how porthole finds
    the SDK, `$ANDROID_HOME` fallback chain), `npx portholejs`, what opens.
  - Full CLI reference table (every subcommand + option).
  - MCP setup: exact `.mcp.json` snippet and `claude mcp add porthole -- npx portholejs mcp`.
  - Comparison note: "Android sibling of serve-sim" with link.
  - Troubleshooting: SDK not found, adb offline, WebCodecs support, port in use.
- **2.2 `skill/SKILL.md`** — currently an empty dir. Write an agent skill teaching
  the workflow: list → boot/attach → screenshot → input → verify loop, with the
  exact CLI/MCP invocations and TV-specific guidance (use `remote`, never `tap`).
  Mirror the structure of serve-sim's agent skill.
- **2.3 `--quiet`/JSON everywhere:** every subcommand must support `-q` emitting
  a single JSON object/array on stdout (agents parse this). Today only `list` and
  `start` do. Document the schemas in the README.
- **2.4 First-run niceties:** default command with no args and no running
  emulator → interactive AVD list prompt (skippable with `-q`); auto-open browser
  (exists via `--no-preview` inverse — verify it actually opens on macOS/Linux/Windows);
  friendly error when port 3200 is taken (suggest `-p`).
- **Acceptance:** a new user on a machine with Android Studio installed gets a
  streaming browser tab from a cold clone with only README instructions.

---

## Phase 3 — Web UI: from demo to tool

The client works but is minimal. serve-sim's UI feels like a product: logs,
drag-drop, gestures, stats.

- **3.1 Wire up `device-picker.tsx`** (exists, dead code): header dropdown listing
  AVDs/running emulators from `GET /api/devices`; selecting one switches or boots
  (server gains session-switch support). Show profile badge and state.
- **3.2 Logcat panel:** engine already surfaces logcat for MCP; add
  `GET /api/logcat?lines=&filter=` and a collapsible bottom panel in the client
  (follow mode, filter box, level colors). Equivalent of serve-sim's "simulator
  logs in the browser".
- **3.3 Drag-and-drop install & push:** drop an `.apk` on the video → `adb install`
  with progress toast; drop image/video/other files → push to `/sdcard/Download`
  + media scan. (Android's analog of serve-sim's drag-drop injection.)
- **3.4 Phone hardware keys:** Back/Home/Recents/Power/Vol± buttons under the
  phone frame (keycodes already in `keycodes.ts`).
- **3.5 Keyboard capture:** when the video has focus, forward printable keys as
  `text`, arrows/enter/esc per profile mapping (tv mapping exists — extend to
  phone: esc→back). Add a visible "keyboard captured" indicator and Esc-Esc or
  click-outside to release.
- **3.6 Stream stats overlay:** small toggleable badge — fps, bitrate, decoder
  queue, resolution (data client-side from chunk timestamps/sizes).
- **3.7 Screenshot button** exists; add "copy to clipboard" alongside download.
- **Acceptance:** each feature demoed against both a phone AVD and the TV AVD;
  no regressions in decode path (`video-canvas.tsx` early-message buffering must
  survive refactors — it fixed a real race, commit 2473dbc).

---

## Phase 4 — Agent & automation ergonomics (serve-sim parity core)

- **4.1 Daemon mode: `porthole start --detach`** — forks the server, prints
  `{url, pid, serial, avdName}` JSON, exits. `porthole list` gains an
  "active sessions" section (from state file, with liveness check via `/health`).
  `porthole kill` also stops detached servers. This is serve-sim's `--detach`.
- **4.2 Middleware embedding:** export
  `createPortholeMiddleware(opts): (req, res, next) => void` from `portholejs`
  so the preview mounts inside Vite/Metro/Express dev servers (serve-sim mounts
  at `/.sim`; use `/.porthole`). WS upgrade handling included. Document usage for
  Vite and Metro in the README.
- **4.3 LAN exposure with token (PRD FR-8.7):** `--host 0.0.0.0` generates a
  session token, requires `?token=` on `/` and WS upgrade (cookie after first
  load), prints the tokenized URL + QR code in the terminal. Refuse token-less
  non-localhost requests.
- **4.4 `--mjpeg` fallback (PRD FR-3.5):** currently a no-op flag. Implement:
  server-side decode (sharp or a WASM H.264 decoder — investigate; scrcpy can
  also emit raw frames) → multipart MJPEG at `/stream.mjpeg`; client falls back
  to `<img>` automatically when `VideoDecoder` is unavailable, and logs which
  path it chose. If server-side H.264 decode proves too heavy, document and cut
  it — but decide with a spike, not by default.
- **4.5 MCP polish:** `screenshot` should return an MCP image content block (not
  just text); add `wait_for_boot` tool; add `install_apk` tool (path arg); all
  tool results structured and terse (FR-7.3).
- **Acceptance:** an agent can go cold-start → `porthole start X --detach -q` →
  parse JSON → `porthole remote/tap/screenshot` → `porthole kill`, all headless.

---

## Phase 5 — Device controls beyond v1 (adapted from serve-sim's extras)

serve-sim's rotation/memory-warning/CoreAnimation flags have Android analogs.
These supersede the PRD §4 "extended controls" deferral — update PRD when shipped.

- **5.1 Rotation:** `porthole rotate <portrait|landscape|left|right>` +
  UI button (phone profile only) via
  `adb shell settings put system user_rotation` / `content insert` method —
  research the reliable emulator approach. Client re-fits canvas on
  resolution-change (scrcpy sends new SPS — verify decoder reconfigure works;
  the codec-config persistence in `video-canvas.tsx` was built for this).
- **5.2 Emulator console goodies** (`adb emu` — porthole started it, so it has
  console auth): battery level/charging, network speed/latency profiles, GPS
  fix, fold/unfold for foldable AVDs. One `porthole emu <cmd>` passthrough plus
  first-class flags for battery/network/gps. UI: a slide-out "Controls" drawer.
- **5.3 Media keys & TV extras:** long-press support for remote buttons
  (`phase: down/up` already exists — expose hold in UI); TV text search via
  `type_text`; a "launch app" picker (`pm list packages` → `monkey -p <pkg> 1`
  or `am start`).
- **5.4 Multi-device:** PRD M6 promises it. One server, N engines: `/api/devices`
  lists sessions, WS messages carry a device id, client tabs switch streams.
  Keep 1-device fast path unchanged. (Do this last; it touches everything.)

---

## Phase 6 — Release engineering

- **6.1 CI (GitHub Actions):** matrix macOS/Linux/Windows × Node 20/22:
  build, lint, typecheck, unit tests. Separate optional job with an Android
  emulator (reactivecircus/android-emulator-runner) running `PORTHOLE_EMU=1`
  integration tests on Linux.
- **6.2 Packaging:** verify `npm pack` output — must include `dist/`, client
  `dist/`, `assets/scrcpy-server`, no `src/`; `files` field in package.json;
  `npx portholejs` works from the tarball on a clean machine. Pin and document
  the scrcpy-server version + upgrade procedure (PRD §12 risk).
- **6.3 Versioning/publish:** changesets or plain `npm version`; `v0.1.0` to npm
  once Phases 0–2 land; README badge row (npm, CI).
- **6.4 Demo assets:** record the hero GIF (phone touch + TV remote), a 30-s
  asciinema of the CLI, screenshots for README.

---

## Suggested order & sizing

| Phase | Value | Effort | Notes |
|---|---|---|---|
| 0 Bugs | Unblocks everything | S | Do first, single PR per bug |
| 1 CLI input | Closes FR-6.2, agent-critical | M | Depends on 0.3 state file |
| 2 Docs/DX | Adoption | S–M | Can run parallel to 1 |
| 4.1/4.5 Daemon + MCP polish | Agent workflows | M | Before UI extras |
| 3 Web UI | Product feel | M–L | 3.1–3.4 first |
| 4.2–4.4 Middleware/token/mjpeg | Parity | M–L | mjpeg needs a spike |
| 5 Device controls | Delight | M–L | 5.4 multi-device last |
| 6 Release | Ship it | M | 6.1 early is fine too |

**Definition of "great":** a developer or agent runs `npx portholejs`, gets a
streaming, controllable emulator in one command; the README convinces them in
ten seconds; Claude Code drives a TV app end-to-end through MCP with zero human
help; and everything above is green on CI across all three OSes.
