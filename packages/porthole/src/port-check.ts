import { createServer } from "node:net";
import { readState, type PortholeSessionRecord } from "./state.js";

export async function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

export function portInUseMessage(
  port: number,
  session: PortholeSessionRecord | undefined,
): string {
  if (session) {
    return (
      `Port ${port} is already used by the Porthole session for ` +
      `${session.avdName} (${session.url}, pid=${session.pid}).\n` +
      `Open that preview, or start on another port with -p ${port + 1}, ` +
      `or stop it with \`porthole kill\`.`
    );
  }
  return `Port ${port} is already in use. Try another port with -p ${port + 1}.`;
}

export async function ensurePortFree(port: number, host: string): Promise<string | null> {
  if (await isPortFree(port, host)) return null;
  const state = await readState();
  return portInUseMessage(
    port,
    state.sessions.find((session) => session.port === port),
  );
}
