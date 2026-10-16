# ADR: One control plane for human and agent operators

## Context

Before plan 4, operators reached the emulator through three paths:

| Operator           | Path                                        | Shared the live session? |
| ------------------ | ------------------------------------------- | ------------------------ |
| Browser human      | WebSocket input and HTTP API → `Session`    | Yes                      |
| CLI or shell agent | HTTP API → `Session`                        | Yes                      |
| MCP agent          | Separate `ScrcpyEngine` and process globals | No                       |

The MCP path could push a second scrcpy server to the same device. Its actions
were invisible in the browser, bypassed HTTP validation, and could not use the
browser session's multi-device or Vega support. Input, UI, app, and log logic
also existed in two places.

```text
Before

Browser ── WS/HTTP ──┐
CLI ───── HTTP ───────┼── Session ── Engine ── device
                     │
MCP ── own state ─────┴────────────── Engine ── same device
```

## Decision

The browser, CLI, and MCP use one live `Session`. An `actions/` layer owns
device operations and validation behind a narrow `SessionHandle`; HTTP routes
call these actions. MCP talks to that session through the HTTP control client,
starting a detached session when needed. Every request carries an `Actor`
identity, and a bounded `ActivityBus` publishes action outcomes to the browser
and to clients that query recent activity.

The same session also owns the control holder, human questions, and screen
annotations. When a human holds control, agent input receives a retryable
`PAUSED_BY_HUMAN` error. Questions and annotations remain available so the
operators can coordinate while input is paused.

```text
After

Browser ── WS/HTTP ──┐
CLI ───── HTTP ───────┼── HTTP routes ── actions ── Session ── Engine ── device
MCP ───── HTTP ───────┘       │                       │
                         Actor identity        ActivityBus
                                                   │
                                      browser feed / activity API
```

## Alternatives considered

- **Keep an MCP-owned engine.** This preserves the duplicate device connection
  and leaves agent actions outside the browser session.
- **Embed an HTTP server inside MCP.** This would still create another session
  lifecycle and a competing port. Connecting MCP to the existing or detached
  session keeps one owner for each device.
- **Use MCP elicitation alone for questions.** The installed SDK supports
  elicitation, but the human watching the browser is not necessarily the MCP
  client user. Session-backed questions put the answer in the same place as the
  video and work for CLI operators too.

## Consequences

- One engine and one scrcpy connection serve all operators of a device.
- Validation, error codes, actor attribution, and activity reporting are
  consistent across HTTP, CLI, and MCP actions.
- MCP requires the local session server. Its link can discover an existing
  server or start one, adding a small local HTTP hop to each tool call.
- Activity is an in-memory ring, so restarting the session clears its history.
  Control state, pending questions, and annotations also live with that session.
- The existing LAN token still protects non-local access; actor identity is
  attribution, not authentication.
