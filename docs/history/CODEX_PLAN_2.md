# Porthole Development Plan 2 — Reliability, Agent Tooling, MJPEG

> Audience: Codex. Sequel to `docs/CODEX_PLAN.md`, which is implemented
> (commit `dcf9f85`) and was verified live against phone and TV AVDs on
> 2026-07-07: boot-from-stopped, cross-process kill, headless
> tap/key/remote/rotate/screenshot, `--detach` JSON, TV touch rejection, and
> leanback D-pad navigation all pass on a real emulator.
>
> Ground rules are unchanged and binding (see `CLAUDE.md` / plan 1 §Ground
> rules): strict TS, kebab-case, engine boundary, verify `@yume-chan/*` APIs
> on npm before use, one phase at a time, green
> `npm run build && npm run test && npm run lint && npm run typecheck`
> plus the phase's acceptance criteria before moving on.

---

## Phase 0 — Verification follow-ups (small; do these first)

Findings from the live verification of plan 1:

### 0.1 CLI surfaces raw stack traces on API errors

- **Repro:** `porthole tap 0.5 0.5` against a TV session →
  `Error: Touch input is not available for TV profile sessions.` followed by a
  full Node stack trace and `Node.js v24.9.0` banner. Exit code 1 is correct;
  the presentation is wrong.
- **Fix:** wrap every control-plane subcommand action (`tap`, `key`, `remote`,
  `text`, `rotate`, `emu`, `screenshot`, `focused` when it exists) in a shared
  helper that catches errors, prints `porthole: <message>` to stderr (JSON
  `{error}` under `-q`), and exits 1. No stack traces unless
  `PORTHOLE_DEBUG` is set.
- **Test:** unit-test the helper; assert stderr format for a rejected input.

### 0.2 Remove the dead `sharp` dependency

- Screenshots now use `adb exec-out screencap -p`, but `sharp` is still in
  `packages/porthole/package.json` dependencies. It is the only native
  dependency and contradicts the PRD's "no native binaries" promise.
- Remove it, confirm no imports remain, run the full suite.

### 0.3 Live-verify adb-offline recovery

- Plan 1 §0.4 (reconnect `offline` devices before attach) was implemented but
  never exercised against a real offline device. Write the integration test
  (`PORTHOLE_EMU=1`): force-disconnect (`adb reconnect offline` puts devices
  offline transiently, or kill/restart the adb server mid-session), then
  assert `porthole start` recovers without manual intervention.

### 0.4 Browser UI QA pass

- The plan-1 UI additions (device picker, logcat panel, stats overlay,
  screenshot copy/save, drag-drop install/push, phone hardware keys, keyboard
  capture) were verified only by unit/build. Do a manual QA pass against a
  phone AVD **and** the TV AVD; fix what breaks; capture screenshots for the
  README while at it.

---

## Track M — Implement `--mjpeg` for real (PRD FR-3.5)

Currently `--mjpeg` prints a "reserved" warning. This track replaces that
with a working fallback so browsers without WebCodecs still get a live,
controllable preview. Expanded design:

### M1. Constraints and shape

- **No native binaries** (PRD §6): no ffmpeg spawn, no node-gyp addons. Any
  decoder must be pure JS or WASM shipped inside the npm package.
- MJPEG here means `multipart/x-mixed-replace` over HTTP at
  `GET /stream.mjpeg` — one JPEG (or PNG, see M2-B) part per frame. Input
  continues to flow over the existing WS channel; only video transport
  changes.
- The engine boundary holds: add an optional capability to `Engine`
  (`captureFrame(): Promise<{data: Uint8Array, mime: string}>` or a
  server-side subscriber to decoded frames) rather than leaking scrcpy
  details into the HTTP layer.

### M2. Two candidate implementations — spike BOTH, decide by measurement

**Option A — server-side H.264 decode via WASM (true MJPEG):**

- Decode the existing scrcpy H.264 stream in Node with a WASM decoder.
  Candidates to evaluate on npm (verify current state, do not trust memory):
  `@yume-chan/scrcpy-decoder-tinyh264` (browser-targeted — check Node
  compatibility), standalone `tinyh264`, or an openh264 WASM build.
- Encode decoded YUV/RGB frames to JPEG with a pure-JS encoder (`jpeg-js`)
  at reduced rate (target 10–15 fps at ≤720p; JPEG quality ~70).
- Measure: CPU % on an M-series Mac and a Linux CI runner, end-to-end
  latency, allocations/GC pressure. Decode only while ≥1 MJPEG client is
  connected; tear down when the last disconnects.

**Option B — screencap polling (zero new dependencies):**

- Poll `adb exec-out screencap -p` at 2–4 fps per connected MJPEG client
  (shared single poller, fan out to all clients).
- Frames are PNG; browsers render `image/png` parts in
  `multipart/x-mixed-replace` — verify on current Chrome, Firefox, Safari
  before committing to it.
- Pros: trivial, robust, no CPU spike. Cons: low fps, ~150–400 ms per
  capture. Perfectly acceptable as a _fallback_ mode.

**Decision gate:** if Option A holds ≥10 fps at <~60 % of one core, ship A
(with B's poller as emergency fallback for decode errors). Otherwise ship B
alone and document the fps expectation honestly. Record the decision and
measurements in `docs/` (short ADR).

### M3. Server & client wiring

- `GET /stream.mjpeg` (token-protected like `/ws` when `--host` is public).
- `/health` gains `videoModes: ["webcodecs", "mjpeg"]` and the active mode
  per client is a client-side concern.
- Client auto-detect: if `!("VideoDecoder" in window)` → render
  `<img src="/stream.mjpeg">` instead of the canvas, keep the input overlay
  and remote working identically. Manual override via `?video=mjpeg` query
  param (for testing) and a note in the status bar showing the active mode.
- CLI: `--mjpeg` forces MJPEG mode in the served client (inject a config
  flag), removes the "reserved" warning, and is documented in README +
  `--help`.

### M4. Tests & acceptance

- Unit: multipart framing (boundary correctness, part headers, flush
  behavior); poller fan-out logic with a fake engine.
- Integration (`PORTHOLE_EMU=1`): request `/stream.mjpeg`, assert ≥2 parts
  arrive within 3 s and each part parses as PNG/JPEG.
- E2E: with WebCodecs disabled (Chromium
  `--disable-blink-features=WebCodecs` or equivalent — verify the current
  flag), the preview shows a moving image and `porthole remote dpad_down`
  still navigates.
- **Acceptance:** a browser with no WebCodecs gets a live, controllable
  preview out of the box; README documents the mode, its fps expectations,
  and the auto-fallback; the "reserved" warning is gone.

---

## Track A — Agent-first semantic UI (the killer feature)

serve-sim agents are screenshot-driven. Android exposes a structured
accessibility tree — surfacing it makes Porthole the best agent-testing
target on any platform. Nothing in plan 1 covered this.

### A1. `dump_ui` — UI hierarchy as JSON

- `adb exec-out uiautomator dump /dev/tty` (fallback: dump to /sdcard + cat),
  parse the XML into a JSON tree: `{class, text, resourceId, contentDesc,
bounds:{l,t,r,b}, focused, focusable, clickable, enabled, children[]}`.
- Expose as `GET /api/ui` and MCP tool `dump_ui` (optional `filter` arg:
  substring match on text/resourceId returns matching nodes + ancestors).
- Parser is pure logic → unit tests with XML fixtures (phone + TV dumps).
- uiautomator dump is slow (~0.5–1 s) and fails during animations — retry
  once on empty output.

### A2. `get_focused` — leanback focus tracking

- From the A1 tree, return the `focused=true` node (class, text, resourceId,
  bounds). THE missing primitive for TV testing: press `dpad_down`, call
  `get_focused`, assert focus moved — no vision model needed. Expose as MCP
  tool, `GET /api/focused`, and CLI `porthole focused -q`.

### A3. `find_element` / element-relative input

- MCP tool `find_element(text|resourceId)` → node + normalized center point.
- Phone: optional `tap: true` taps the center. TV: return the node and its
  focus state instead (D-pad pathfinding is out of scope — document why).

### A4. Crash + ANR watchdog

- Logcat watcher in the engine layer: detect `FATAL EXCEPTION`, `ANR in`,
  native crash markers; ring buffer of the last N records
  `{ts, process, summary, stack}`.
- Expose: MCP `get_crashes`, `GET /api/crashes`, client toast wired to the
  logcat panel. Agents get a cheap "did my last action crash the app?" check.

### A5. Deep links, lifecycle, synchronization

- Thin adb wrappers (arg-construction unit-tested):
  - `open_url <url>` → `am start -W -a android.intent.action.VIEW -d <url>`
  - `stop_app <pkg>` → `am force-stop`; `clear_app <pkg>` → `pm clear`
  - `wait_for <text> [--timeout 10s]` → poll the A1 dump until a node's text
    matches; the agent's synchronization primitive for slow UI transitions.
- Reuse the existing `/api/apps` + `/api/launch` plumbing.

**Track A acceptance:** with the TV AVD, an agent (MCP only, no screenshots)
presses `dpad_right`, reads `get_focused`, asserts the title changed,
`open_url`s a deep link, and detects an injected crash via `get_crashes`.
Ship it as a `PORTHOLE_EMU=1` integration test.

---

## Track B — Reliability engineering

### B1. Engine supervision & stream recovery

- `scrcpy-engine.ts` has no reconnect logic — a dropped scrcpy socket
  freezes the stream silently.
- Supervisor in `Session`: on engine error/close → `stop()` → restart with
  exponential backoff (max ~3 attempts), re-`attachEngine` so WS clients get
  a fresh config chunk (client already handles re-config — commit 2473dbc).
- `/health` gains `status: "ok" | "reconnecting" | "dead"`; client overlays
  "Reconnecting…" instead of freezing.
- Kill test (`PORTHOLE_EMU=1`): kill the scrcpy server process mid-stream →
  stream recovers within 10 s.

### B2. Honor FR-1.6 on exit

- The SIGINT handler stops the session but leaves emulators Porthole booted
  running, violating PRD FR-1.6.
- On SIGINT/SIGTERM: if the session record says `bootedByUs`, call
  `shutdownDevice` (opt out with `--keep-alive`); always remove the session
  from the state file. Cover the `--detach` child too.

### B3. Honest video timestamps + keyframe flag in the envelope

- The client fabricates `frameCount * (1/30 s)` timestamps and NAL-scans
  every frame for IDR (O(n) per frame, per tab). scrcpy provides real PTS
  and a keyframe flag — verify against `@yume-chan/scrcpy` docs on npm.
- Extend `VideoChunk` with `keyframe: boolean` + real `timestamp`; WS
  envelope byte 0 becomes `0=config, 1=delta, 2=key`; client trusts the flag.
  Keep the NAL-scan fallback for one release, then delete.
- Unit-test envelope encode/decode on both sides from a shared fixture.

### B4. Boot robustness

- Expose `--wipe-data`, `--no-snapshot`, `--gpu <mode>`, `--cold-boot`
  passthrough on `start`.
- Boot wait: also require `pm path android` to succeed —
  `sys.boot_completed=1` fires before the launcher is usable, which flakes
  input sent too early.

---

## Track C — Test depth & CI trust

- **C1. Contract tests for every `/api/*` route** with a `FakeEngine`:
  status codes, validation errors, tv-touch rejection, token enforcement.
- **C2. WS protocol tests:** late-joiner decodes from cached
  config+keyframe; envelope round-trip; backpressure (slow client must not
  stall the engine — check `bufferedAmount` handling).
- **C3. Emulator integration suite** (`PORTHOLE_EMU=1`): boot → attach →
  first keyframe sanity → tap/remote round-trip → screenshot non-empty →
  kill cleans state. Wire into CI via `reactivecircus/android-emulator-runner`
  (Linux, API 34 phone + TV).
- **C4. Browser e2e (Playwright, `PORTHOLE_E2E=1`):** canvas paints
  non-black pixels; remote button click sends the right WS message; stats
  overlay updates; MJPEG mode (Track M) renders.
- **C5. `npm pack` smoke test in CI:** pack, install the tarball into a temp
  dir, run `porthole --version` and `porthole list -q` — locks in packaging
  (Track D) forever.

---

## Track D — Packaging & cross-platform correctness

- **D1. Published-package asset resolution:** `paths.ts` already prefers
  package-relative paths (`client-dist`, package `assets/`) with workspace
  fallbacks. Verify the prepack copy script actually produces that layout,
  the `files` whitelist ships it, and C5 proves it from the tarball.
- **D2. Windows:** `adbBin`/`emulatorBin` must append `.exe`; paths with
  spaces must survive `execFile` (never string-concat `exec`); state file
  under `%TMP%`. Add a Windows CI leg for unit tests at minimum.
- **D3. Node engines check:** fail fast with a clear message on Node < 20.

---

## Track E — Developer experience

- **E1. `porthole doctor`** — highest-value small feature. Ordered checks,
  each ✅/❌ with a fix suggestion: Node version; SDK found (print the
  `$ANDROID_HOME` → `$ANDROID_SDK_ROOT` → platform-default resolution
  chain); adb/emulator binaries; adb server responding; ≥1 AVD defined;
  running emulators + state (flag `offline`, offer reconnect); port 3200
  free; state-file sanity (prune dead PIDs). `-q` emits JSON. This is also
  the support script for bug reports.
- **E2. Client dev loop:** Vite dev-server proxy for `/ws`, `/health`,
  `/screenshot`, `/api/*` → `localhost:3200`, so client development
  hot-reloads against a live session instead of requiring a rebuild.
- **E3. Structured logging:** tiny `log.ts` with namespaces
  (`engine|ws|http|device|mcp`), enabled via `--verbose` or
  `PORTHOLE_DEBUG=engine,ws`. MCP server logs to stderr only — stdout is the
  protocol channel; corrupting it breaks Claude Code silently.
- **E4. Shared protocol types:** WS envelope + `/api` payload types are
  hand-duplicated in the client. Extract
  `packages/porthole/src/protocol.ts` (pure types + encode/decode, no Node
  imports) and import it from the client workspace — one source of truth.

---

## Track F — Product polish (small, high-delight)

- **F1. TV auto-wake:** before injecting input, if the display is
  off/dozing (`dumpsys power` → `mWakefulness`), send `KEYCODE_WAKEUP`
  first. TV AVDs screensave constantly; agents and humans both hit this.
- **F2. Input macro record/replay:** `porthole record out.json` captures the
  session's InputEvents with relative timestamps; `porthole play out.json
[--speed 2]` replays. Pure-logic serialize/replay-timing → unit tests.
- **F3. Stream tuning flags:** `--max-size`, `--max-fps`, `--bitrate` on
  `start` (Session already accepts maxSize/maxFps — plumb through +
  document).
- **F4. Page title & favicon:** title = `<AVD name> — Porthole`; favicon
  swaps phone/TV glyph.
- **F5. Multi-device streaming** (plan 1 §5.4, still open): one server, N
  engines; `/api/devices` lists sessions; WS messages carry a device id;
  client tabs switch streams. Keep the 1-device fast path unchanged. Do this
  LAST — it touches everything.

---

## Execution order

| Order | Item         | Why                                                      |
| ----- | ------------ | -------------------------------------------------------- |
| 1     | Phase 0      | Small fixes from live verification; unblocks trust       |
| 2     | Track M      | Closes the last dishonest flag (FR-3.5); user priority   |
| 3     | Track A      | Differentiator; unlocks agent workflows nothing else has |
| 4     | B1–B2        | Correctness promises + stream resilience                 |
| 5     | C1–C3, C5    | Lock everything in before more features                  |
| 6     | D1–D3        | Must be true before any npm publish                      |
| 7     | B3–B4, E1–E4 | Protocol + DX hardening                                  |
| 8     | Track F      | Polish pass; F5 multi-device last                        |

**Definition of done for this plan:** `--mjpeg` genuinely works; an agent can
test a TV app end-to-end without a single screenshot; a dropped stream heals
itself; `porthole doctor` diagnoses every failure we have ever hit live; and
CI proves the published tarball works on macOS, Linux, and Windows.
