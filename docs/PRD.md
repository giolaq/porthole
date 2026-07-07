# Porthole — Product Requirements Document

**A window into your Android emulator.** Porthole streams Android phone and
Android TV emulators to the browser and lets you (or an AI agent) control them
— touch for phones, a D-pad remote for TV — over a single local command.

> Status: v1 spec, ready for implementation.
> Audience: the engineer/agent building Porthole (intended to be developed with
> Claude Code).

---

## 1. Summary

`npx porthole` boots or attaches to an Android emulator, mirrors its screen in a
local web UI, and forwards input back to the device. It is the spiritual
successor to `serve-sim` (which did this for iOS Simulators), rebuilt from
scratch as a **pure-TypeScript, cross-platform, Android-only** tool.

Mirroring and input both ride on the **scrcpy** protocol. The tool is a single
Node process — no native helper binary.

---

## 2. Problem & goals

Developers and AI coding agents need to _see_ and _drive_ an Android emulator
without the heavyweight Android Studio "Running Devices" panel, and without
writing brittle `adb` glue. Android TV is especially poorly served: it needs a
D-pad remote, which no lightweight tool offers.

**Goals**

- One command (`npx porthole`) to get a live, controllable emulator in a browser.
- First-class **Android TV remote control** (on-screen D-pad + physical keyboard).
- Cross-platform: macOS, Linux, Windows.
- Headless-scriptable and **agent-friendly** (clean CLI + MCP server).
- Zero native binaries to compile; install is a plain npm package.

**Non-goals** — see §4.

---

## 3. Target users & use cases

| User                          | Use case                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Mobile developer              | Preview an app on a phone emulator in a browser tab while coding.                       |
| Android TV developer          | Test leanback navigation with a D-pad without a physical remote.                        |
| AI coding agent (Claude Code) | Drive the emulator via MCP tools: press keys, screenshot, read logcat, verify UI state. |
| QA / CI                       | Headless input scripting (`porthole tap`, `porthole remote`) against a booted AVD.      |
| Remote tester                 | Expose the preview over LAN / a tunnel for someone else to interact with.               |

---

## 4. Scope

### In scope (v1)

- Android **emulator** (AVD) support — phone profiles and Android TV profiles.
- scrcpy-based screen mirroring (H.264) and input injection.
- Web preview UI with two device profiles (touch / TV remote).
- CLI for lifecycle + headless input.
- MCP server for agent integration.
- Cross-platform (macOS / Linux / Windows).

### Non-goals (explicitly out — do not build these)

- **iOS / Apple Simulator** anything.
- **Physical Android devices** — the scrcpy engine technically supports them,
  but v1 neither targets nor tests them. Do not add device-specific code paths.
- **Audio** forwarding.
- **Screen recording to file.**
- Wear OS / Android Auto profiles.
- Heavyweight auth/accounts — only a simple shared token for LAN exposure (§8.7).

### Added after v1 spec

- Emulator controls such as rotation and `adb emu` passthrough are now in scope
  for the implementation roadmap in `docs/CODEX_PLAN.md`.

---

## 5. Architecture

```
┌──────────────────────── porthole (one Node process) ─────────────────────┐
│                                                                          │
│  Device Manager   discover / boot / attach / shutdown AVDs (via ADB)      │
│  Engine           one scrcpy session per attached device                 │
│       └ Engine interface: start() / onVideo() / sendInput() / stop()      │
│  HTTP + WS server preview UI, video frames, input channel, /screenshot    │
│  MCP server       stdio transport, exposes tools to Claude Code           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
        │ scrcpy protocol over ADB (local adb server, TCP 5037)
        ▼
   Android emulator(s)            ┌────────────────────────────┐
                                  │  Browser preview client     │
   scrcpy H.264 ──► WS ──────────►│  WebCodecs decode → canvas   │
   InputEvent  ◄── WS ◄───────────│  touch UI  /  TV remote UI   │
                                  └────────────────────────────┘
```

**Key principles**

- **One process, per-device workers.** Unlike `serve-sim` (one helper process
  per device, coordinated via state files), Porthole runs a single process with
  one async worker per attached device. No state files, no port reaping.
- **Engine abstraction.** All capture/input goes through an `Engine` interface.
  The scrcpy implementation is the only one shipped; the interface exists so the
  client/CLI/MCP layers never depend on scrcpy details.
- **scrcpy at the protocol level.** Do **not** spawn the `scrcpy` CLI binary.
  Push the `scrcpy-server` jar to the device over ADB, open its video + control
  sockets, and speak the protocol via a TypeScript scrcpy stack.

---

## 6. Tech stack & constraints

| Concern            | Choice                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language / runtime | TypeScript, Node ≥ 20. No Bun-specific APIs.                                                                                                                                                                                                                                                                                       |
| ADB + scrcpy       | A TypeScript ADB/scrcpy stack — recommended: the `@yume-chan/*` ("Tango" / ya-webadb) packages (`@yume-chan/adb`, `@yume-chan/scrcpy`, `@yume-chan/adb-scrcpy`, a Node adb-server connector, and `@yume-chan/scrcpy-decoder-webcodecs` for the client). **Verify current package names, versions, and APIs on npm before coding.** |
| ADB transport      | Connect to the local `adb` server over TCP (port 5037). Do not reimplement the host protocol.                                                                                                                                                                                                                                      |
| scrcpy server      | Download one **pinned** `scrcpy-server` jar from the official Genymobile/scrcpy GitHub release at install time (postinstall, SHA-256 verified); do not commit it to the repo or ship it in the npm tarball. Push it to the device at runtime.                                                                                      |
| Video codec        | H.264 (widest WebCodecs support).                                                                                                                                                                                                                                                                                                  |
| HTTP / WS server   | Node `http` + `ws`.                                                                                                                                                                                                                                                                                                                |
| Web client         | React + Vite. WebCodecs `VideoDecoder` → `<canvas>` renderer.                                                                                                                                                                                                                                                                      |
| MCP                | `@modelcontextprotocol/sdk`, stdio transport.                                                                                                                                                                                                                                                                                      |
| Testing            | Vitest.                                                                                                                                                                                                                                                                                                                            |
| Lint / format      | ESLint + Prettier (or oxlint).                                                                                                                                                                                                                                                                                                     |
| Package manager    | npm workspaces.                                                                                                                                                                                                                                                                                                                    |

**Distribution:** plain npm package, run via `npx`. npm name `portholejs`
(bare `porthole` is taken by an abandoned 2015 package); the `bin` command is
`porthole`. No compile step; ship JS + the built client; the scrcpy-server
jar is fetched from the pinned upstream release during install.

---

## 7. Repository layout

```
porthole/
  package.json                 npm workspaces root
  CLAUDE.md                    agent guidance (conventions, gotchas)
  packages/
    porthole/                  CLI + server + engine + MCP
      src/
        cli.ts                 commander-based CLI entrypoint
        device-manager.ts      AVD discovery / boot / attach
        engine/
          types.ts             Engine interface
          scrcpy-engine.ts     scrcpy implementation
        server/
          http.ts              preview UI + /screenshot + static assets
          ws.ts                video out + input in
        input.ts               InputEvent ↔ scrcpy control / Android keycodes
        keycodes.ts            shared Android keycode table
        mcp/
          server.ts            MCP server (stdio)
          tools.ts             tool definitions
        profiles.ts            phone vs tv device profile detection
      src/__tests__/
    porthole-client/           React preview UI
      src/
        app.tsx
        video-canvas.tsx       WebCodecs decode + render
        touch-overlay.tsx      phone input
        tv-remote.tsx          TV D-pad remote + keyboard mapping
        device-picker.tsx
  skill/
    SKILL.md                   optional Anthropic-style skill
```

File naming: **kebab-case** for all `.ts`/`.tsx` files.

---

## 8. Functional requirements

### FR-1 — Device management

- **FR-1.1** Locate the Android SDK via `$ANDROID_HOME` / `$ANDROID_SDK_ROOT`,
  with platform default fallbacks. Fail with a clear, actionable message if not
  found.
- **FR-1.2** List AVDs (`emulator -list-avds`) and running emulators
  (`adb devices`). Merge into a single device list with `{ name, serial,
profile, state }`.
- **FR-1.3** Detect device **profile** from each AVD's `config.ini`: `tag.id`
  of `android-tv` / `google-tv` → `tv` profile; everything else → `phone`.
- **FR-1.4** Boot an AVD (`emulator -avd <name>`), then wait until
  `adb -s <serial> shell getprop sys.boot_completed` returns `1`.
- **FR-1.5** Attach to an already-running emulator without rebooting it.
- **FR-1.6** Cleanly shut down emulators that Porthole started; leave
  pre-existing ones running on exit.

### FR-2 — Capture engine

- **FR-2.1** Define an `Engine` interface: `start()`, `onVideoChunk(cb)`,
  `sendInput(event)`, `screenshot()`, `stop()`, plus a `metadata` field
  (codec, width, height).
- **FR-2.2** `ScrcpyEngine`: push the pinned `scrcpy-server` jar over ADB,
  start the server, open the video and control sockets, and expose H.264
  chunks (with codec config / SPS-PPS) via `onVideoChunk`.
- **FR-2.3** One engine instance per attached device; instances are isolated
  so one crashing does not affect others.
- **FR-2.4** Surface the device's logcat as a readable stream (used by FR-7).

### FR-3 — Streaming server

- **FR-3.1** HTTP server serving the preview client and static assets.
- **FR-3.2** `GET /health` → `200` once an engine is streaming.
- **FR-3.3** `GET /screenshot` → current frame as PNG.
- **FR-3.4** WebSocket `/ws`: server → client video chunks (codec config first,
  then frames); client → server `InputEvent` messages.
- **FR-3.5** `--mjpeg` flag: decode H.264 server-side and deliver MJPEG instead,
  for browsers without WebCodecs. Not the default.

### FR-4 — Input

- **FR-4.1** Unified `InputEvent` schema:
  - `{ kind: "touch", phase: "down"|"move"|"up", x, y }` — normalized 0..1.
  - `{ kind: "key", phase: "down"|"up", keycode }`.
  - `{ kind: "text", text }`.
  - `{ kind: "remote", button }`.
- **FR-4.2** `RemoteButton` set and Android keycode mapping (in `keycodes.ts`):
  `dpad_up/down/left/right` → `KEYCODE_DPAD_UP/DOWN/LEFT/RIGHT`;
  `select` → `KEYCODE_DPAD_CENTER`; `back` → `KEYCODE_BACK`;
  `home` → `KEYCODE_HOME`; `menu` → `KEYCODE_MENU`;
  `play_pause`/`rewind`/`fast_forward` → `KEYCODE_MEDIA_*`;
  `volume_up`/`volume_down` → `KEYCODE_VOLUME_*`.
- **FR-4.3** Translate every `InputEvent` to a scrcpy control message.
- **FR-4.4** TV profiles must reject/ignore `touch` events; phone profiles
  accept all kinds.

### FR-5 — Web client

- **FR-5.1** Decode H.264 via WebCodecs `VideoDecoder`, render to `<canvas>`.
  Fall back to `<img>` when in `--mjpeg` mode.
- **FR-5.2** **Phone profile:** device-frame chrome, a touch overlay forwarding
  pointer events as `touch` `InputEvent`s, and hardware-key buttons.
- **FR-5.3** **TV profile:** 16:9 landscape frame, an on-screen **remote**
  (D-pad cluster + Back/Home/Menu + media transport), no touch overlay.
- **FR-5.4** **Physical keyboard mapping** for the TV profile: arrow keys →
  `dpad_*`, Enter → `select`, Esc/Backspace → `back`.
- **FR-5.5** Device picker, connection status, and a screenshot button.

### FR-6 — CLI

```
porthole [avd...]          Boot/attach + open preview (default port 3200)
porthole --list            List AVDs and running emulators (JSON with -q)
porthole --kill [avd]      Stop emulator(s) Porthole started
porthole tap <x> <y>       Touch at normalized 0..1            [phone]
porthole key <keycode>     Single Android keyevent             [both]
porthole remote <button>   D-pad / media remote button         [tv]
porthole text "<string>"   Type text                          [both]
porthole mcp               Run the MCP server on stdio
  -p,--port  -d,--device  --host  --no-preview  --mjpeg  -q,--quiet
```

- **FR-6.1** Default command boots/attaches and serves the preview.
- **FR-6.2** Input subcommands target a running session; clear error if none.
- **FR-6.3** `--host 0.0.0.0` exposes the preview on the LAN (see FR-8 / §8.7).
- **FR-6.4** `-q/--quiet` emits JSON only, for scripting.

### FR-7 — MCP server (Claude Code integration)

- **FR-7.1** `porthole mcp` runs an MCP server over **stdio**, registrable in
  Claude Code via `.mcp.json` or `claude mcp add`.
- **FR-7.2** Expose these tools:
  - `list_devices` — AVDs + running emulators with profiles.
  - `boot_device` / `attach_device`.
  - `tap`, `key`, `remote`, `type_text` — input.
  - `screenshot` — returns the current frame as an image.
  - `read_logcat` — returns recent logcat output (optionally filtered).
- **FR-7.3** Tool results must be structured and concise so an agent can chain
  them (e.g. `remote` then `screenshot` to verify D-pad focus moved).

### FR-8 — Docs & skill

- **FR-8.1** `README.md`: install, prerequisites (Android SDK, emulator, adb on
  PATH), CLI reference, MCP setup snippet.
- **FR-8.2** `CLAUDE.md`: conventions, architecture notes, common gotchas.
- **FR-8.3** Optional `skill/SKILL.md`: an Anthropic-style skill teaching agents
  the Porthole workflow.

---

## 9. Milestones & acceptance criteria

Build milestone by milestone; each must be green (lint + typecheck + tests)
before the next.

| ID     | Milestone           | Done when                                                                                                                                                                                                 |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** | Project scaffold    | npm workspaces monorepo, both packages, Vitest + ESLint + TS strict configured, CI matrix (macOS/Linux/Windows) green on an empty test. `CLAUDE.md` exists.                                               |
| **M1** | Device management   | `porthole --list` prints AVDs + running emulators with correct `phone`/`tv` profiles; `porthole <avd>` boots one and reports ready. Unit tests cover `config.ini` parsing and TV detection from fixtures. |
| **M2** | scrcpy capture      | `ScrcpyEngine` pushes the server jar, connects, and emits decodable H.264 chunks for a booted emulator (verified by a test that decodes one keyframe). Engine interface finalized.                        |
| **M3** | Web preview (phone) | Browser shows a live phone emulator via WebCodecs; pointer events drive touch; keyboard drives keys. `porthole tap` works headless.                                                                       |
| **M4** | TV profile + remote | TV AVD auto-selects the TV profile; on-screen remote + keyboard mapping drive a leanback app; `porthole remote dpad_down` works headless.                                                                 |
| **M5** | MCP server          | Claude Code connects to `porthole mcp`; `list_devices`, input tools, `screenshot`, and `read_logcat` all function in an integration test.                                                                 |
| **M6** | Polish & release    | Multi-device, `--host` LAN exposure with token, `--mjpeg` fallback, screenshot button, complete docs + skill. Publishable `portholejs` package.                                                           |

---

## 10. Testing requirements

- **TDD where practical** — write tests alongside each milestone.
- **Pure-logic unit tests** (no emulator needed): `config.ini` parsing, TV
  detection, `InputEvent` ↔ keycode mapping, scrcpy control-message encoding,
  CLI argument parsing.
- **Integration tests** (booted emulator): engine connects + streams,
  end-to-end input, MCP tools. Gate these behind an env flag so CI without an
  emulator still runs the unit suite.
- Every milestone's acceptance criteria in §9 must have a corresponding test.

---

## 11. Working with Claude Code / conventions

- Keep this PRD at `docs/PRD.md`; generate a `CLAUDE.md` from §6, §7, and §11
  so the agent reloads conventions every session.
- **Build one milestone at a time**; do not start M(n+1) until M(n) is green.
- TypeScript `strict: true`; no `any` without justification.
- kebab-case filenames; small, single-purpose modules.
- Engine details must not leak past the `Engine` interface into CLI/client/MCP.
- Before using any third-party scrcpy/ADB API, **verify it against current npm
  package docs** — these libraries evolve; do not rely on memorized signatures.
- Respect the non-goals in §4 — do not add iOS, physical-device, or audio code.

---

## 12. Risks & open questions

- **scrcpy server/protocol version drift** — the bundled jar must match a
  protocol version the TS client supports. Pin both; document the bump process.
- **WebCodecs availability** — strong in current Chromium/Safari; the `--mjpeg`
  fallback covers the rest. Confirm the fallback is acceptable before investing
  heavily in it.
- **Android TV leanback correctness** — verify the remote + keyboard mapping
  actually drives real leanback apps (focus traversal), not just the launcher.
- **Emulator boot time / headless CI** — boots are slow; integration tests need
  generous timeouts and an emulator-present env gate.
- **Package name** — ship as `portholejs` (bin `porthole`) unless the bare name
  is acquired; also secure the GitHub org and a `.dev` domain.

---

## 13. Success criteria

- `npx portholejs` takes a developer from "AVD installed" to "controllable
  emulator in a browser" in one command, on macOS, Linux, and Windows.
- An Android TV emulator is fully navigable with the on-screen remote and a
  physical keyboard.
- Claude Code can, via the MCP server, press a D-pad key, take a screenshot,
  and read logcat — closing the see/act loop with no human in between.
- Install is a plain npm package: no native build, no compiler, no Xcode/Swift.
