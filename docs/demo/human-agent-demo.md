# Human and agent, one device: five-minute demo

## Prepare once

Use a booted Android TV AVD with the [movie shelf app](../../examples/rn-tvos-app/README.md)
installed as a release APK (`npx expo run:android --variant release --device`
from the app directory). Build Porthole with `npm run build`, then use the
local CLI and register that build with Claude Code from the repository root:

```sh
export PATH="$PWD/node_modules/.bin:$PATH"
claude mcp add porthole -- node "$PWD/packages/porthole/dist/cli.js" mcp
```

The general MCP setup is in the [README](../../README.md#mcp-setup).
Use a Porthole build from this branch; the published 0.4.0 package does not
contain these collaboration features.

If more than one device is attached, pass `-d <serial>` to the reset script and
all CLI commands. Keep the same device selected in the browser.

## 0:00–0:45 — Open the shared view

```sh
porthole start <TV_AVD>
```

The browser opens. Open **Activity** to show the empty feed in a fresh
session. Reset and launch the movie shelf before each take:

```sh
scripts/demo-reset.sh
```

The reset hands control back and adds app actions to the feed. Start the video
capture in another terminal and leave it running during the walkthrough:

```sh
porthole record demo.mp4 --duration 300s
```

The recorder writes the MP4 when five minutes have elapsed. It records the TV
stream; capture the browser separately if the feed and hand-off UI must also
appear in the final video.

## 0:45–1:45 — Agent navigates in view

In Claude Code, say:

> Open the movie app and focus Interstellar. First call `attach_device` and
> `get_control_state`. Say what you are about to do, then use the TV remote or
> `focus_on` and verify with `get_focused` and `screenshot`.

If it is not already foreground, have the agent run
`porthole launch com.giolaq.rntvosapp` through its shell tool. The expected
MCP sequence is `attach_device` → `get_control_state` → `say` → `focus_on`
(which sends remote input) → `get_focused` → `screenshot`. The feed shows the
agent's intent and actions; the TV remote highlights each agent press as the
focus moves to **Interstellar**.

## 1:45–2:45 — Human takes control

Click **🤖 Agent can act**. It changes to **✋ You have control**. Use the
browser remote to navigate to **Dune**. Then ask the agent:

> Press D-pad right once, then continue from the card I selected.

The agent's `remote` call receives `PAUSED_BY_HUMAN` (HTTP 423). It should
stop input, call `get_recent_activity`, and ask:

> You moved to Dune — continue from there?

That question should be sent with `ask_human`, not only written in chat. The
question banner appears over the browser preview.

## 2:45–3:45 — Answer and annotate

Answer **Yes** in the browser question banner. Click **✋ You have control**
to hand control back. Click **Annotate**, drag a rectangle around the edge of
the Dune card, and enter `border clipped here`. Click **Annotate** again to
leave drawing mode. The note is attached to a captured screen region.

## 3:45–5:00 — Agent checks the evidence

In Claude Code, say:

> Read my annotation, inspect its image, take a new screenshot, compare it
> with the approved baseline if one is available, check for crashes, and
> summarize what you found. Do not claim a visual regression without a
> baseline or a clear observation.

Expected calls: `get_annotations` with `includeImages: true`, `screenshot`,
`assert_screen` if an approved baseline exists, and `get_crashes`. The agent
summarizes the observation and any mismatch in the shared activity context.
After five minutes, `porthole record` writes `demo.mp4`.
