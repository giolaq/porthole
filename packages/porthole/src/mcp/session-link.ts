import { discoverSession, type ControlClientOptions } from "../control-client.js";
import { startDetachedSession } from "../cli/start-flow.js";
import type { PortholeSessionRecord } from "../state.js";
import { PortholeError } from "../actions/errors.js";

export class SessionLink {
  private current: PortholeSessionRecord | null = null;

  async attach(serial: string, port?: number): Promise<PortholeSessionRecord> {
    try {
      this.current = await discoverSession({ device: serial, port });
    } catch {
      await startDetachedSession({
        devices: [serial],
        port,
        preview: false,
        quiet: true,
      });
      this.current = await discoverSession({ device: serial, port });
    }
    return this.current;
  }

  options(): ControlClientOptions {
    if (!this.current) {
      throw new PortholeError(
        "NO_DEVICE",
        "No active session. Call attach_device first.",
        503,
      );
    }
    return {
      port: this.current.port,
      device: this.current.serial,
      actor: { kind: "agent", id: "mcp" },
    };
  }

  serial(): string | undefined {
    return this.current?.serial;
  }
  session(): PortholeSessionRecord | null {
    return this.current;
  }
}
