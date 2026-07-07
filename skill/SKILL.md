# Porthole Agent Skill

Use Porthole when you need to inspect or control an Android emulator from an
agent workflow. Porthole supports Android emulator AVDs only; do not use it for
iOS, physical Android devices, or audio.

## Workflow

1. List devices:

   ```sh
   porthole list -q
   ```

2. Start a session. Prefer detached JSON mode for automation:

   ```sh
   porthole start <AVD_NAME> --detach -q
   ```

3. Verify the screen:

   ```sh
   porthole screenshot -q
   ```

4. Drive input:

   ```sh
   porthole tap 0.5 0.9
   porthole key 4
   porthole text "hello"
   ```

5. For Android TV, use remote buttons instead of touch:

   ```sh
   porthole remote dpad_down
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

## MCP Loop

When MCP is configured, use:

- `list_devices` to pick an AVD
- `boot_device` and `wait_for_boot` for cold starts
- `attach_device` before input and screenshots
- `screenshot` after each meaningful input step
- `remote` for TV navigation
- `tap` only for phone profiles
- `read_logcat` to diagnose crashes or focus issues
- `install_apk` to load a freshly built APK

Keep the loop tight: input, screenshot, compare, adjust.
