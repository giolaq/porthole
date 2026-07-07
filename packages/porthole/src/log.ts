export type LogNamespace = "engine" | "ws" | "http" | "device" | "mcp";

export function debugLog(namespace: LogNamespace, message: string): void {
  const enabled = process.env["PORTHOLE_DEBUG"];
  if (!enabled) return;
  const namespaces = new Set(enabled.split(",").map((value) => value.trim()));
  if (!namespaces.has("*") && !namespaces.has(namespace)) return;
  process.stderr.write(`[porthole:${namespace}] ${message}\n`);
}
