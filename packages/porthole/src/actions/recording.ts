import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { H264Recorder } from "../recording.js";
import { encodeVideoPacket } from "../protocol.js";
import type { ActionContext, SessionHandle } from "./context.js";
import { actionEngine } from "./context.js";
import { PortholeError } from "./errors.js";
import { runAction } from "./run.js";

interface ActiveRecording {
  recorder: H264Recorder;
  path: string;
  startedAt: number;
  active: boolean;
}

const recordings = new WeakMap<SessionHandle, Map<string, ActiveRecording>>();

function forSession(session: SessionHandle): Map<string, ActiveRecording> {
  let entries = recordings.get(session);
  if (!entries) {
    entries = new Map();
    recordings.set(session, entries);
  }
  return entries;
}

export async function startRecording(
  ctx: ActionContext,
  path?: string,
): Promise<{ path: string }> {
  return runAction(ctx, "start_recording", { path }, async () => {
    if (ctx.session.isVega?.()) {
      throw new PortholeError(
        "NOT_SUPPORTED_ON_VEGA",
        "Recording is not supported on Vega.",
        400,
      );
    }
    const engine = actionEngine(ctx);
    const entries = forSession(ctx.session);
    if (entries.has(ctx.deviceId)) {
      throw new PortholeError("RECORDING_ACTIVE", "Recording already active.", 409);
    }
    if (!engine.metadata || engine.metadata.codec !== "h264") {
      throw new PortholeError(
        "DEVICE_NOT_READY",
        "H.264 stream is not ready.",
        503,
        true,
      );
    }
    const output =
      path ?? join(process.cwd(), `porthole-${ctx.deviceId}-${Date.now()}.mp4`);
    const entry: ActiveRecording = {
      recorder: new H264Recorder(engine.metadata.width, engine.metadata.height),
      path: output,
      startedAt: Date.now(),
      active: true,
    };
    entries.set(ctx.deviceId, entry);
    engine.onVideoChunk((chunk) => {
      if (entry.active)
        entry.recorder.addPacket(new Uint8Array(encodeVideoPacket(chunk, ctx.deviceId)));
    });
    return { path: output };
  });
}

export async function stopRecording(
  ctx: ActionContext,
): Promise<{ path: string; durationMs: number; bytes: number; samples: number }> {
  return runAction(ctx, "stop_recording", undefined, async () => {
    const entries = forSession(ctx.session);
    const entry = entries.get(ctx.deviceId);
    if (!entry) throw new PortholeError("BAD_REQUEST", "No active recording.", 400);
    entry.active = false;
    entries.delete(ctx.deviceId);
    const durationMs = Date.now() - entry.startedAt;
    try {
      const mp4 = entry.recorder.finalize(durationMs);
      await writeFile(entry.path, mp4);
      return {
        path: entry.path,
        durationMs,
        bytes: mp4.byteLength,
        samples: entry.recorder.sampleCount,
      };
    } catch (error) {
      throw new PortholeError(
        "BAD_REQUEST",
        error instanceof Error ? error.message : String(error),
        400,
      );
    }
  });
}
