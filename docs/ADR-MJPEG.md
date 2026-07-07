# ADR: MJPEG Fallback

## Decision

Porthole implements `--mjpeg` with shared `adb exec-out screencap -p` polling
and `multipart/x-mixed-replace` PNG parts at roughly 3 fps.

## Context

Plan 2 asked for two options:

- A WASM H.264 decoder plus JPEG encoder.
- A no-dependency screencap poller.

The product requirement still says no native binaries, and `sharp` was removed
for the same reason. The WASM decoder path needs browser/Node compatibility and
CPU measurements on real hardware before it can be trusted. The screencap path
is slow but robust, dependency-free, and good enough for browsers without
WebCodecs.

## Consequences

- Browsers without WebCodecs get a live, controllable preview.
- `/stream.mjpeg` sends PNG frames with multipart boundaries.
- Frame rate is intentionally low. WebCodecs remains the default streaming path.
- A true H.264 WASM decoder can replace the poller later without changing the
  HTTP endpoint or client selection logic.
