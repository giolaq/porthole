# Porthole Development Plan 3 — Gestures, Assertions, TV Pathfinding, Scale

> Audience: Codex. Sequel to `docs/CODEX_PLAN.md` (implemented) and
> `docs/CODEX_PLAN_2.md` (implemented; MJPEG shipped as screencap polling per
> `docs/ADR-MJPEG.md`). Porthole 0.1.1 is live on npm with green 3-OS CI.
>
> Verified-remaining gaps this plan addresses: no swipe/scroll/long-press
> input, no macro record/replay, no multi-device, no Playwright e2e, client
> still hand-duplicates protocol types.
>
> Ground rules are unchanged and binding (`CLAUDE.md`): strict TS, kebab-case,
> engine boundary, verify `@yume-chan/*` APIs on npm before use, no native
> binaries, one phase at a time, green
> `npm run build && npm run test && npm run lint && npm run typecheck` plus
> each phase's acceptance criteria before moving on. Do not add
> `Co-Authored-By` trailers to commits.

---

## Phase 0 — Prerequisite refactor: shared protocol types (plan-2 E4)

The client still hand-copies the WS envelope constants and API payload shapes.
Track G changes the envelope and Track D adds a device id to it — land this
refactor first so those changes happen in exactly one place.

- Extract `packages/porthole/src/protocol.ts` exports (envelope byte codes,
  `InputEvent`, API request/response shapes) into pure type + encode/decode
  helpers with **no Node imports**, and import them from `porthole-client`
  via the workspace.
- Unit-test encode/decode round-trips from one shared fixture.
- **Acceptance:** `grep` finds no duplicated envelope constants or InputEvent
  shapes in `porthole-client/src`; build + tests green.

---

## Track G — Gesture input: swipe, scroll, long-press, drag (highest value)

Porthole can only tap. An agent cannot scroll a list, dismiss a notification
shade, or swipe-to-delete. scrcpy's touch protocol already supports
down/move/up phases — the engine's `sendInput` handles `touch` with
`phase: "move"` today; what is missing is synthesis and surface area.

### G1. Gesture synthesis in the server

- New `InputEvent` variant:
  `{kind: "gesture", type: "swipe"|"longpress", x1, y1, x2, y2, durationMs, steps?}`
  (normalized 0..1; `longpress` uses x1/y1 only).
- Server-side interpolation: down at (x1,y1), N move events spaced over
  `durationMs` (default ~250 ms, N ≈ 20), up at (x2,y2). `longpress` = down,
  hold `durationMs` (default 600 ms), up. Pure function
  `interpolateGesture(event) → TouchEvent[]` in its own module — unit-test
  the sequences (phases, monotonic timestamps, endpoints exact).
- TV profiles reject gestures exactly like touch (FR-4.4).

### G2. Surfaces

- CLI: `porthole swipe <x1> <y1> <x2> <y2> [--duration ms]`,
  `porthole longpress <x> <y> [--duration ms]`, plus
  `porthole scroll <up|down|left|right> [--amount 0..1]` sugar that expands
  to a centered swipe.
- HTTP: the existing `POST /api/input` accepts the new event kind.
- MCP: `swipe`, `long_press`, `scroll` tools (structured args, terse results).
- Client: pointer drag on the phone overlay already streams move events —
  verify end-to-end and fix if the overlay throttles.

### G3. Acceptance (live, `PORTHOLE_EMU=1`)

- `porthole scroll down` visibly scrolls the Play Store feed (screenshot
  before/after differ in the scrolled region).
- `porthole swipe 0.5 0.05 0.5 0.6` opens the notification shade.
- `porthole longpress 0.5 0.5` on the launcher opens the wallpaper/context
  menu.

---

## Track V — Visual assertions: screenshot diffing

Give agents a visual assert to pair with the semantic ones (`wait_for`,
`get_focused`).

- Pure-JS compare with `pixelmatch` + `pngjs` (both already fit the
  no-native rule; `pngjs` is already a dependency).
- CLI: `porthole assert-screen <baseline.png> [--threshold 0.02]
[--diff out.png] [--region x,y,w,h]` → exit 0/1, `-q` emits
  `{ok, mismatchRatio, diffPath}`. `porthole screenshot` remains the way to
  record baselines.
- MCP: `assert_screen` tool taking a baseline path + threshold.
- Dimension mismatch (baseline vs current) is a clear error, not a diff.
- Unit tests with generated PNGs (identical, 1-pixel diff, resized);
  integration test: assert against a just-taken screenshot passes at 0.
- **Acceptance:** a CI-style flow — screenshot → navigate away → assert fails;
  navigate back → assert passes — works headless on the phone AVD.

---

## Track P — TV D-pad pathfinding: `focus_on`

Plan 2 declared pathfinding out of scope; the primitives it needs
(`dump_ui`, `get_focused`, `remote`) all exist now. This is the feature no
other tool has.

- `focusOn(serial, query)`: dump UI → locate target node (same matcher as
  `find_element`) and the `focused` node → choose the D-pad direction whose
  vector from focused-center to target-center has the largest component →
  press it → re-dump → repeat. Stop when the focused node matches the query.
- Guards: step budget (default 15); loop detection (revisiting the same
  focused node twice with no progress → try the perpendicular axis once,
  then fail with the visited path in the error); target-not-in-tree is an
  immediate clear error.
- Keep the navigator a pure function over `(tree, targetQuery) → direction`
  so it unit-tests against XML fixtures (grid, rail, nested rows).
- Surfaces: CLI `porthole focus-on "<text>" [--select]`, MCP `focus_on`
  (with optional `select: true` to press center on arrival).
- **Acceptance (live, TV AVD):** from the Google TV home, `porthole focus-on
"Library" --select` lands on and opens the Library tab; a nonsense target
  fails within the budget with a useful error.

---

## Track R — Session recording to MP4 (requires PRD amendment)

PRD §4 currently lists "screen recording to file" as a non-goal — amend it
first (one line, cite this plan) or drop this track.

- The H.264 stream is already flowing; recording is a **pure remux**, no
  re-encode: wrap Annex-B NALs into an MP4 (`avc1`) track. Evaluate `mp4box`
  / `mp4-muxer` npm packages (verify current names/APIs); hand-rolling boxes
  is acceptable if deps are unmaintained — it is a bounded format.
- CLI: `porthole record out.mp4 [--duration 30s]` (Ctrl-C also finalizes);
  MCP: `start_recording` / `stop_recording` returning the path.
- Server: a recorder subscribes to the same engine chunk feed as WS clients;
  starts at the next keyframe; uses real PTS.
- Integration test: record 3 s, assert the file has a valid `ftyp`/`moov`
  and a decodable first sample (or probe duration > 2 s).
- **Acceptance:** the recorded MP4 plays in QuickTime/Chrome with correct
  duration and no corruption warnings.

---

## Track D — Multi-device (plan-2 F5, unblocked by Phase 0)

- One server, N sessions: `Session` becomes per-device; a `SessionManager`
  owns the map. WS envelope gains a device id (Phase 0 makes this a
  one-place change); `/api/*` routes accept `?device=<serial>` with the
  current single-device behavior as default.
- CLI: `porthole start avd1 avd2`, `porthole list` shows all sessions on the
  port; input subcommands gain `-d <serial>` targeting (flag already exists
  on `start`).
- Client: device tabs from `/api/devices`; switching tabs re-subscribes the
  video feed without reloading.
- Keep the 1-device fast path allocation-free; do this track LAST — it
  touches everything.
- **Acceptance:** phone + TV AVDs streamed simultaneously from one server;
  input routes to the correct device; killing one session leaves the other
  streaming.

---

## Track C — CI-as-a-product: a GitHub Action

- `action.yml` in-repo (marketplace-publishable later): inputs `avd-name`,
  `api-level`, `profile`; wraps `reactivecircus/android-emulator-runner` +
  `npx portholejs start --detach -q`, exposes `url`, `serial`, `port` as
  step outputs.
- A documented example workflow: boot TV AVD → `focus-on`/`assert-screen`
  smoke → upload screenshot artifacts on failure.
- Dogfood it: convert our own `PORTHOLE_EMU=1` CI job to use the action.
- **Acceptance:** a downstream repo can copy the README snippet and get a
  porthole-controlled emulator in CI with no other setup.

---

## Track W — Maintenance automation (small; run in the background)

- **W1. scrcpy pin freshness:** weekly workflow checks the latest
  Genymobile/scrcpy release; if newer than `SCRCPY_VERSION`, opens a PR
  bumping version + sha256 (computed from the downloaded asset) with a
  reminder to verify the `AdbScrcpyOptions` class still matches. Never
  auto-merge.
- **W2. Dependabot/renovate** for npm deps, grouped: `@yume-chan/*` weekly
  (they move fast and must be verified against docs), everything else
  monthly.
- **W3. Playwright e2e** (plan-2 C4, never built): against a live session —
  canvas paints non-black pixels, remote button click sends the right WS
  message, MJPEG mode renders. Gate behind `PORTHOLE_E2E=1`; wire into the
  emulator CI job.
- **W4. Coverage floor:** enable vitest coverage, set a modest threshold
  (~70 % lines on `packages/porthole/src`, excluding `cli.ts` wiring), fail
  CI below it.

---

## Non-goals (unchanged)

iOS, physical devices, audio, Wear OS. Recording moves from non-goal to
in-scope ONLY via the Track R PRD amendment.

## Execution order

| Order | Item    | Why                                                           |
| ----- | ------- | ------------------------------------------------------------- |
| 1     | Phase 0 | One-place protocol change unblocks G and D                    |
| 2     | Track G | Biggest functional hole; everything agent-side needs gestures |
| 3     | Track V | Cheap; completes the agent assert vocabulary                  |
| 4     | Track P | The TV differentiator; primitives already exist               |
| 5     | Track W | Background-able; W1 protects the scrcpy pin from rot          |
| 6     | Track R | After the PRD decision                                        |
| 7     | Track C | Packages the CI story once G/V/P give it substance            |
| 8     | Track D | Touches everything — last                                     |

**Definition of done for this plan:** an agent can scroll, swipe, and
long-press a phone app; navigate a TV app by saying where to focus; assert
screens visually and semantically; record an MP4 of the run; and a
downstream repo gets all of it in CI from one Action snippet.
