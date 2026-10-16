import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "../version.js";
import { SessionLink } from "./session-link.js";
import { register as registerLifecycle } from "./tools/lifecycle.js";
import { register as registerInput } from "./tools/input.js";
import { register as registerScreen } from "./tools/screen.js";
import { register as registerUi } from "./tools/ui.js";
import { register as registerApps } from "./tools/apps.js";
import { register as registerLogs } from "./tools/logs.js";

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "porthole", version: VERSION },
    {
      instructions: [
        "Attach to a device before using screen or input tools.",
        "Check control state before acting alongside a human.",
        "Narrate multi-step or destructive actions with say.",
        "If a human pauses control, observe activity and ask a question before continuing.",
        "Read annotations when the tool inbox hint reports new notes.",
      ].join("\n"),
    },
  );
  const link = new SessionLink();
  registerLifecycle(server, link);
  registerInput(server, link);
  registerScreen(server, link);
  registerUi(server, link);
  registerApps(server, link);
  registerLogs(server, link);
  return server;
}

export async function startMcpServer(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport());
}
