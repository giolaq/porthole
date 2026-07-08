# Porthole

<p align="center">
  <img src="https://raw.githubusercontent.com/giolaq/porthole/main/assets/porthole-logo.png" alt="Porthole logo" width="220">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/portholejs"><img src="https://img.shields.io/npm/v/portholejs" alt="npm version"></a>
  <a href="https://github.com/giolaq/porthole/actions/workflows/ci.yml"><img src="https://github.com/giolaq/porthole/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/giolaq/porthole/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/portholejs" alt="license"></a>
  <a href="https://www.npmjs.com/package/portholejs"><img src="https://img.shields.io/node/v/portholejs" alt="node"></a>
</p>

A window into your Android emulator — `npx portholejs`.

Porthole boots or attaches to Android phone and TV AVDs, streams them to a browser,
and forwards touch, keyboard, D-pad remote, screenshots, logcat, and file drops
through one local tool. It is the Android sibling of
[serve-sim](https://github.com/EvanBacon/serve-sim).

## Quick Start

Prerequisites:

- Node.js 20 or newer
- Android Studio or Android SDK command line tools
- `emulator` and `adb` installed under the SDK
- Chrome, Edge, or another browser with WebCodecs for H.264 playback

Porthole finds the SDK from `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then the
platform defaults:

- macOS: `~/Library/Android/sdk`
- Linux: `~/Android/Sdk`
- Windows: `%LOCALAPPDATA%\Android\Sdk`

```sh
npx portholejs
```

With no running emulator, Porthole prompts for an AVD. To boot a specific AVD:

### The scrcpy-server component

Porthole mirrors and controls the emulator by speaking the
[scrcpy](https://github.com/Genymobile/scrcpy) protocol. At runtime it pushes a
small server jar (`scrcpy-server`, Apache-2.0, by Genymobile) to the emulator
over adb and connects to its video and control sockets — no scrcpy CLI or
native binary is involved.

The jar is **not** bundled in this repository or in the npm package. It is
downloaded automatically during `npm install` (a `postinstall` step) from the
official Genymobile/scrcpy GitHub release, pinned to **v3.1** and verified
against a SHA-256 checksum. If the download was skipped (for example, an
offline install), fetch it later with:

```sh
node node_modules/portholejs/scripts/download-scrcpy-server.mjs
```

`porthole doctor` reports whether the jar is present. To bump the pinned
version, update `SCRCPY_VERSION` and `SCRCPY_SHA256` in
`scripts/download-scrcpy-server.mjs` and keep the engine's scrcpy options class
in sync (see `src/engine/scrcpy-engine.ts`).

```sh
npx portholejs start Pixel_8_Pro_API_34
```

For a headless agent workflow:

```sh
npx portholejs start Android_TV_1080p --detach -q
npx portholejs remote dpad_down
npx portholejs screenshot -q
npx portholejs kill -q
```

## CLI Reference

| Command                              | Purpose                                             |
| ------------------------------------ | --------------------------------------------------- |
| `porthole start [avd]`               | Boot or attach and serve the browser preview        |
| `porthole list`                      | List AVDs, running emulators, and known sessions    |
| `porthole kill [avd]`                | Stop emulators Porthole booted and detached servers |
| `porthole tap <x> <y>`               | Touch normalized phone coordinates from `0..1`      |
| `porthole swipe <x1> <y1> <x2> <y2>` | Swipe between normalized phone coordinates          |
| `porthole longpress <x> <y>`         | Long-press normalized phone coordinates             |
| `porthole scroll <direction>`        | Scroll phone content up, down, left, or right       |
| `porthole key <keycode>`             | Send an Android keycode down/up pair                |
| `porthole remote <button>`           | Press a TV D-pad/media button                       |
| `porthole text "<string>"`           | Type text into the active session                   |
| `porthole screenshot [-o file.png]`  | Save a PNG screenshot                               |
| `porthole focused`                   | Print the currently focused UI node                 |
| `porthole dump-ui [--filter text]`   | Dump the Android UI hierarchy                       |
| `porthole wait-for <text>`           | Wait until UI text appears                          |
| `porthole open-url <url>`            | Open a URL or Android deep link                     |
| `porthole stop-app <package>`        | Force-stop an app                                   |
| `porthole clear-app <package>`       | Clear app data                                      |
| `porthole rotate <orientation>`      | Rotate a phone emulator                             |
| `porthole emu <args...>`             | Pass through to `adb emu`                           |
| `porthole doctor`                    | Diagnose Node/SDK/adb/AVD/session problems          |
| `porthole mcp`                       | Run the MCP server over stdio                       |

Common options:

| Option                  | Meaning                                          |
| ----------------------- | ------------------------------------------------ |
| `-p, --port <port>`     | Preview/control port, default `3200`             |
| `-d, --device <serial>` | Attach to a running emulator serial              |
| `--host <host>`         | Bind address, default `127.0.0.1`                |
| `--no-preview`          | Do not open the browser automatically            |
| `--detach`              | Start the preview server in the background       |
| `--mjpeg`               | Force MJPEG screenshot polling                   |
| `-q, --quiet`           | Emit one JSON object/array on stdout             |
| `--max-size <px>`       | Maximum scrcpy stream dimension                  |
| `--max-fps <fps>`       | Maximum scrcpy FPS                               |
| `--bitrate <bps>`       | Scrcpy video bitrate                             |
| `--wipe-data`           | Wipe emulator data before boot                   |
| `--no-snapshot`         | Disable loading/saving emulator snapshots        |
| `--cold-boot`           | Alias for `--no-snapshot`                        |
| `--gpu <mode>`          | Pass emulator GPU mode                           |
| `--keep-alive`          | Leave a Porthole-booted emulator running on exit |

Quiet schemas are intentionally simple: `list -q` returns
`{ "devices": [...], "sessions": [...] }`; `start --detach -q` returns the
session record with `url`, `pid`, `serial`, `avdName`, `port`, and `profile`;
input commands return `{ "ok": true, "session": ... }`; `screenshot -q` returns
`{ "ok": true, "path": "...", "session": ... }`.

## MCP Setup

`.mcp.json`:

```json
{
  "mcpServers": {
    "porthole": {
      "command": "npx",
      "args": ["portholejs", "mcp"]
    }
  }
}
```

Claude Code:

```sh
claude mcp add porthole -- npx portholejs mcp
```

Useful MCP tools: `list_devices`, `boot_device`, `wait_for_boot`,
`attach_device`, `tap`, `swipe`, `long_press`, `scroll`, `key`, `remote`,
`type_text`, `screenshot`,
`dump_ui`, `get_focused`, `find_element`, `wait_for`, `open_url`, `stop_app`,
`clear_app`, `get_crashes`, `read_logcat`, and `install_apk`.

## Agent Skill

Porthole ships an agent skill (`skills/porthole/`) that teaches agents the full workflow: doctor triage,
boot/attach, semantic UI assertions, TV navigation, and cleanup.

Install it by copying the skill directory into your skills folder — for the
current project:

```sh
mkdir -p .claude/skills
cp -r node_modules/portholejs/skills/porthole .claude/skills/
```

or for all your projects:

```sh
mkdir -p ~/.claude/skills
cp -r node_modules/portholejs/skills/porthole ~/.claude/skills/
```

From a clone of this repository, copy `skills/porthole` instead. Claude Code
picks the skill up automatically; ask it to "test my app on the Android
emulator" and it will follow the Porthole workflow.

## Browser UI

The preview shows the active device, stream status, screenshots, copy-to-clipboard,
stream stats, logcat, drag-and-drop APK install/file push, phone hardware keys,
and a TV D-pad remote. TV sessions reject touch input server-side.

Video uses WebCodecs by default. Browsers without `VideoDecoder` automatically
fall back to `/stream.mjpeg`, and `--mjpeg` or `?video=mjpeg` forces that mode.
MJPEG is implemented with shared `adb screencap` polling at roughly 3 fps,
re-encoded server-side to downscaled JPEG (pure JS, max 800 px) to keep
per-frame payloads small; it is a compatibility fallback, not a
high-frame-rate stream.

When serving on a LAN with `--host 0.0.0.0`, Porthole prints a tokenized URL.
Non-local requests must present that token.

Two capability notes:

- `porthole emu` / `POST /api/emu` is a raw passthrough to the emulator
  console (`adb emu`) — including commands like `kill`. Treat it as
  operator-level access; anyone who can reach the (token-protected) API can
  use it.
- `porthole focused` / `get_focused` reads D-pad focus, which is a TV/leanback
  concept. On phone profiles it usually returns `null` unless a view holds
  keyboard focus — that is expected, not an error.

## Troubleshooting

| Problem                       | Fix                                                                         |
| ----------------------------- | --------------------------------------------------------------------------- |
| SDK not found                 | Set `ANDROID_HOME` or `ANDROID_SDK_ROOT` to your Android SDK                |
| `adb devices` shows `offline` | Porthole runs `adb reconnect offline`; if it persists, restart the emulator |
| Port `3200` is taken          | Pass `-p 3201` or another free port                                         |
| Blank video                   | Use a WebCodecs-capable browser and check DevTools for decoder errors       |
| TV taps do nothing            | Use `porthole remote <button>`; TV profiles reject touch                    |

## Development

```sh
npm install
npm run build
npm run test
npm run lint
npm run typecheck
```

Integration tests that require a booted emulator are gated behind
`PORTHOLE_EMU=1`.
