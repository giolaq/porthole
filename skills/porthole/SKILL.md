---
name: porthole
description: Boot, stream, and control Android phone/TV emulators headlessly with the porthole CLI or MCP tools — screenshots, touch/D-pad input, semantic UI dumps, logcat, and APK install. Use when asked to run, test, drive, or inspect an Android emulator or AVD, navigate an Android TV app, or verify Android UI state from an agent workflow.
---

# Porthole Agent Skill

Use Porthole when you need to inspect or control an Android emulator from an
agent workflow. Porthole supports Android emulator AVDs only; do not use it for
iOS, physical Android devices, or audio.

## Workflow

1. List devices:

   ```sh
   porthole list -q
   ```

   If anything fails at any step (SDK missing, port busy, offline adb,
   missing scrcpy-server), diagnose first:

   ```sh
   porthole doctor -q
   ```

2. Start a session. Prefer detached JSON mode for automation:

   ```sh
   porthole start <AVD_NAME> --detach -q
   ```

3. Verify the screen:

   ```sh
   porthole screenshot -q
   porthole assert-screen baseline.png --threshold 0.02 -q
   porthole record run.mp4 --duration 10s -q
   ```

4. Drive input:

   ```sh
   porthole tap 0.5 0.9
   porthole scroll down
   porthole swipe 0.5 0.85 0.5 0.2
   porthole longpress 0.5 0.5
   porthole key 4
   porthole text "hello"
   ```

5. For Android TV, use remote buttons instead of touch:

   ```sh
   porthole remote dpad_down
   porthole focus-on "Library" --select
   porthole remote select
   porthole remote back
   ```

6. Read logs when behavior is unclear:

   ```sh
   curl "http://127.0.0.1:3200/api/logcat?lines=200"
   ```

7. Clean up:

   ```sh
   porthole kill -q
   ```

## Semantic UI

Prefer semantic checks before screenshot interpretation when possible:

```sh
porthole focused -q
porthole dump-ui --filter "Settings" -q
porthole wait-for "Continue" --timeout 10000 -q
porthole open-url "example://deep/link"
```

For TV AVDs, prefer `focus-on` / `focus_on` for named destinations. Use
`remote`, then `focused`, then assert the focused node's `text`, `resourceId`,
or `contentDesc` for manual focus work. For phones, `find_element` is exposed
through MCP and can tap the center of a matching node.

Note: `focused` is a D-pad/leanback concept. On phone profiles it usually
returns `null` — that is expected, not an error; use `dump-ui` or
`find_element` on phones instead.

## MCP Loop

When MCP is configured, use:

- `list_devices` to pick an AVD
- `boot_device` and `wait_for_boot` for cold starts
- `attach_device` before input and screenshots
- `screenshot` after each meaningful input step
- `assert_screen` when a baseline image is available
- `start_recording` and `stop_recording` when an MP4 artifact is useful
- `dump_ui`, `get_focused`, and `wait_for` for semantic assertions
- `get_crashes` after risky actions
- `focus_on` or `remote` for TV navigation
- `tap`, `swipe`, `scroll`, and `long_press` only for phone profiles
- `read_logcat` to diagnose crashes or focus issues
- `install_apk` to load a freshly built APK

Keep the loop tight: input, screenshot, compare, adjust.
