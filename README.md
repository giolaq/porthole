# Porthole

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

| Command                             | Purpose                                             |
| ----------------------------------- | --------------------------------------------------- |
| `porthole start [avd]`              | Boot or attach and serve the browser preview        |
| `porthole list`                     | List AVDs, running emulators, and known sessions    |
| `porthole kill [avd]`               | Stop emulators Porthole booted and detached servers |
| `porthole tap <x> <y>`              | Touch normalized phone coordinates from `0..1`      |
| `porthole key <keycode>`            | Send an Android keycode down/up pair                |
| `porthole remote <button>`          | Press a TV D-pad/media button                       |
| `porthole text "<string>"`          | Type text into the active session                   |
| `porthole screenshot [-o file.png]` | Save a PNG screenshot                               |
| `porthole rotate <orientation>`     | Rotate a phone emulator                             |
| `porthole emu <args...>`            | Pass through to `adb emu`                           |
| `porthole mcp`                      | Run the MCP server over stdio                       |

Common options:

| Option                  | Meaning                                              |
| ----------------------- | ---------------------------------------------------- |
| `-p, --port <port>`     | Preview/control port, default `3200`                 |
| `-d, --device <serial>` | Attach to a running emulator serial                  |
| `--host <host>`         | Bind address, default `127.0.0.1`                    |
| `--no-preview`          | Do not open the browser automatically                |
| `--detach`              | Start the preview server in the background           |
| `--mjpeg`               | Reserved fallback flag; current builds use WebCodecs |
| `-q, --quiet`           | Emit one JSON object/array on stdout                 |

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
`attach_device`, `tap`, `key`, `remote`, `type_text`, `screenshot`,
`read_logcat`, and `install_apk`.

## Browser UI

The preview shows the active device, stream status, screenshots, copy-to-clipboard,
stream stats, logcat, drag-and-drop APK install/file push, phone hardware keys,
and a TV D-pad remote. TV sessions reject touch input server-side.

When serving on a LAN with `--host 0.0.0.0`, Porthole prints a tokenized URL.
Non-local requests must present that token.

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
