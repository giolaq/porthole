#!/usr/bin/env node
import { Command } from "commander";
import { VERSION } from "./index.js";
import { register as registerLifecycle } from "./cli/lifecycle.js";
import { register as registerInput } from "./cli/input.js";
import { register as registerInspect } from "./cli/inspect.js";
import { register as registerApps } from "./cli/apps.js";
import { register as registerCollab } from "./cli/collab.js";

const program = new Command();
if (Number(process.versions.node.split(".")[0] ?? "0") < 20) {
  console.error("porthole: Node.js 20 or newer is required.");
  process.exit(1);
}
program.name("porthole").description("Android emulator preview").version(VERSION);
registerLifecycle(program);
registerInput(program);
registerInspect(program);
registerApps(program);
registerCollab(program);
const commandOrder = [
  "list",
  "doctor",
  "start",
  "kill",
  "tap",
  "swipe",
  "longpress",
  "scroll",
  "key",
  "remote",
  "text",
  "screenshot",
  "assert-screen",
  "record",
  "rotate",
  "emu",
  "focused",
  "focus-on",
  "dump-ui",
  "wait-for",
  "open-url",
  "stop-app",
  "clear-app",
  "mcp",
  "activity",
  "control",
  "ask",
  "say",
];
(program.commands as Command[]).sort(
  (a, b) => commandOrder.indexOf(a.name()) - commandOrder.indexOf(b.name()),
);
program.parse();
