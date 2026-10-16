import {
  discoverSession,
  getSessionJson,
  type ControlClientOptions,
} from "../control-client.js";
import { startDetachedSession } from "../cli/start-flow.js";
import type { PortholeSessionRecord } from "../state.js";
import { PortholeError } from "../actions/errors.js";

export class SessionLink {
  private current: PortholeSessionRecord | null = null;
  private lastReadAnnotationId = 0;
  private lastSeenAnswerAt = "";

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

  markAnnotationsRead(id: number): void {
    this.lastReadAnnotationId = Math.max(this.lastReadAnnotationId, id);
  }

  markAnswersRead(): void {
    this.lastSeenAnswerAt = new Date().toISOString();
  }

  async inboxHint(): Promise<string | undefined> {
    if (!this.current) return undefined;
    try {
      const [{ response: annotations }, { response: questions }] = await Promise.all([
        getSessionJson(
          `/api/annotations?since=${this.lastReadAnnotationId}`,
          this.options(),
        ),
        getSessionJson("/api/questions?status=answered", this.options()),
      ]);
      const noteCount =
        (annotations as { annotations?: unknown[] }).annotations?.length ?? 0;
      const answerCount = (
        (questions as { questions?: Array<{ answer?: { at: string } }> }).questions ?? []
      ).filter(
        (question) => question.answer && question.answer.at > this.lastSeenAnswerAt,
      ).length;
      const hints: string[] = [];
      if (noteCount)
        hints.push(`ℹ︎ ${noteCount} unread human notes — call get_annotations`);
      if (answerCount) hints.push(`ℹ︎ ${answerCount} open question answered`);
      return hints.join("\n") || undefined;
    } catch {
      return undefined;
    }
  }
}
