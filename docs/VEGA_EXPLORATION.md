# Vega OS (Fire TV) Support — Feasibility Exploration

> Branch: `explore/vega-support`. Explored live against Vega SDK **0.22.5875**
> with a booted Vega Virtual Device (VVD) on macOS, 2026-07-08.

## Verdict

**Yes — Porthole can support the Vega simulator**, with a new `VegaEngine`
that slots behind the existing `Engine` interface. It will be an
MJPEG-profile engine (screenshot polling, no H.264 stream) with QMP-based
D-pad input. Roughly: the same product experience as the Android TV profile,
minus the 30 fps video (poll-rate video instead), reusing Porthole's existing
MJPEG streaming path end to end.

## What Vega actually is (as discovered, not from docs)

- `vega` CLI (SDK 0.22.5875): `virtual-device start|status|stop`
  (`--no-gui`, `--display-res`, `--timeout`), `device
list|install-app|launch-app|terminate-app|shell|copy-to|copy-from|
start-log-stream|run-cmd`, `project`, `build`, `which <tool>`.
- **`vda` is a fork of adb** (server version 41, platform 34.0.4, default
  port 5037, `$ANDROID_SERIAL`, identical `forward/reverse/push/pull/shell`
  surface). The VVD registers as `emulator-5554`.
- **The VVD is a rebranded Android Emulator (QEMU/goldfish)**:
  `vega-virtual-device -avd-arch arm64 -skin tv-remote -ports 5554,5555
-qemu -qmp unix:/tmp/qmp-socket-5554.sock,server,nowait`, plus `netsimd`
  and an `emu-crash-34.1.15.db` crashpad database.
- **The guest is Yocto Linux (aarch64, kernel 6.1), NOT Android**: no
  `/system/bin`, no `screencap`, no `input`, no `uiautomator`, no
  `app_process` → **scrcpy-server cannot run there**. Apps are Kepler/React
  Native components (`com.amazon.keplerlauncherapp.main` etc.).
- `vda shell` lands in a sandbox as `app_user` (uid 5000); `/dev/input` is
  not visible from it.

## Verified working (live)

| Capability                      | Mechanism                                                                                                                                                     | Result                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Boot headless                   | `vega virtual-device start --no-gui`                                                                                                                          | ✅ ready in <60 s                                                                                                |
| Lifecycle                       | `virtual-device status/stop`, `vega device list`                                                                                                              | ✅                                                                                                               |
| adb-style transport             | `vda devices/shell/push/pull` on port 5037                                                                                                                    | ✅                                                                                                               |
| **Screenshot with real pixels** | Emulator console (port 5554, token auth): `screenrecord screenshot <dir>`                                                                                     | ✅ 1920×1080 PNG (~62 KB) showing the live launcher UI                                                           |
| QMP control channel             | `/tmp/qmp-socket-5554.sock`: handshake, `screendump`, `send-key`                                                                                              | ✅ commands accepted                                                                                             |
| Input devices in guest          | `/proc/bus/input/devices`                                                                                                                                     | ✅ `qwerty2` (emulator keyboard), `inputmgr-key-injection`, 4× virtio multitouch, all wrapped by Vega's `inputd` |
| Host→guest key mapping          | VVD launches with `-keyboard-mapping KEY_ESC:KEY_BACK, KEY_F1:KEY_HOMEPAGE, KEY_F2:KEY_MENU, KEY_F3:KEY_REWIND, KEY_F4:KEY_PLAYPAUSE, KEY_F5:KEY_FASTFORWARD` | ✅ documents the remote-button qcode table for `send-key`                                                        |
| App lifecycle & logs            | `vega device install-app/launch-app/running-apps/start-log-stream`                                                                                            | ✅ listed (not exercised end-to-end)                                                                             |

## Dead ends found (so nobody re-walks them)

- **QMP `screendump` returns black frames** on macOS: GL acceleration cannot
  be disabled (`--gl-accel` is Linux-only), so the pixels live in host GPU
  textures QEMU's software surface never sees. The console screenshot path
  composites via GPU and works.
- **Guest `ScreenCapture` segfaults** (exit 139) after initializing its
  VP8 pipeline; `/data/screen.webm` is created empty. Broken in this SDK
  build (may work on real hardware).
- No emulator **gRPC** endpoint is started (no `-grpc` flag, no discovery
  files) — the modern streaming API isn't available without patching launch
  flags.
- This QEMU build's `screendump` predates the `format:png` argument (PPM
  only).
- The boot splash ("Kepler Virtual Device is ready") did not visibly react
  to `send-key up/right/ret` — it may simply have no focusable UI. Key
  delivery to a real app remains the one unverified link (the device
  plumbing for it is all present).

## Proposed `VegaEngine` design

```
VegaEngine implements Engine
  start()        vega virtual-device start --no-gui (or attach);
                 open console socket (auth via ~/.emulator_console_auth_token)
                 + QMP unix socket
  metadata       { codec: none, width/height from --display-res or first shot }
  captureFrame() console `screenrecord screenshot <tmpdir>` → read PNG
                 → existing frame-convert (PNG→scaled JPEG) → MJPEG poller
  screenshot()   same, full-resolution PNG
  sendInput()    remote buttons → QMP send-key qcodes:
                   dpad_up/down/left/right → up/down/left/right
                   select → ret        back → esc (KEY_BACK)
                   home → f1           menu → f2
                   rewind → f3         play_pause → f4   fast_forward → f5
                 touch/gesture → reject (TV profile) — later: QMP
                 input-send-event abs on the virtio multitouch
  stop()         vega virtual-device stop
```

Integration points that already exist in Porthole:

- The **MJPEG session path is fully reusable**: `forceMjpeg`, `MjpegPoller`,
  `frame-convert`, client `<img>` rendering and the `?video=mjpeg` override.
  A Vega session is essentially a permanently-MJPEG TV session.
- The TV remote UI, `remote` CLI/MCP tools, and profile-based touch
  rejection map 1:1.
- Device manager grows a second backend: `vega device list` / `vda devices`
  alongside AVDs. Profile is always `tv`.

Not portable to Vega (needs graceful degradation): scrcpy H.264/WebCodecs
video, `dump_ui`/`focus-on`/`wait_for` (no uiautomator — check whether Vega
exposes an accessibility dump; `vega device run-cmd` may reach one),
MP4 recording (no H.264 stream; console `screenrecord start` produces WebM —
could be offered as-is).

## The sample-app experiment (attempted, blocked by an SDK bug)

We ran the go/no-go experiment on the same day:

- `vega project generate --template helloWorld` → builds cleanly
  (`vega build --target aarch64` → `portholeprobe_aarch64.vpkg`).
- `vega run-app` installs it; the launch pipeline works end to end
  (pkgmgrd resolves the component, LCM accepts the launch, splashservice
  prepares the app splash).
- **The app then aborts (signal 6)**: the RN-for-Vega graphics stack calls
  `KeplerGraphics.getLocalDeviceState()`, which requires
  `com.amazon.hdmicontrol.service` — and that service **is not installed in
  the 0.22.5875 VVD image** (`installed-packages` shows only
  `com.amazon.hdmi.certificate`; `servicergrd` cannot connect). Identical
  crash with `--gui` and `--no-gui`.
- Conclusion: the **unmodified Amazon template cannot run on this VVD
  build** — an SDK image bug/mismatch, not a Porthole limitation. The
  key-delivery plumbing (QMP `send-key` → `qwerty2` → `inputd`) is verified
  present; the final "focus visibly moves in an app" check needs a working
  app, so it waits for an SDK update or a real Vega device.

## Risks & open items

1. **Input-to-app verification** — blocked by the SDK bug above; re-run the
   experiment on the next SDK release (`vega project` sample) or on real
   hardware. Everything else about the input path is verified.
2. **Port 5037 collision**: `vda` and `adb` both default to 5037 — running
   Android and Vega tooling simultaneously needs `vda -P <port>` handling.
3. Screenshot poll rate: console screenshot round-trip needs measuring
   (~2-4 fps expected; matches the existing MJPEG fallback envelope).
4. `@yume-chan/adb` likely speaks to vda directly (same wire protocol v41) —
   would give push/shell without spawning the `vda` binary; verify.
5. SDK version drift: all of this is against 0.22.x preview tooling.

## Suggested next step

A one-day spike on this branch: `VegaEngine` with console-screenshot capture

- QMP D-pad input, wired as `porthole start --vega` behind the existing
  MJPEG path. The engine can be built and demoed against the launcher today;
  the app-level acceptance test re-runs as soon as Amazon ships a VVD image
  whose own helloWorld template runs.
