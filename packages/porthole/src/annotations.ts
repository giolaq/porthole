import { PNG } from "pngjs";
import type { Actor, HumanAnnotation } from "./protocol.js";
import type { ActivityBus } from "./activity.js";
import { PortholeError } from "./actions/errors.js";

export type AnnotationRect = HumanAnnotation["rect"];

export class AnnotationStore {
  private readonly entries: Array<{ note: HumanAnnotation; png: Uint8Array }> = [];
  private readonly listeners = new Set<(annotation: HumanAnnotation) => void>();
  private nextId = 1;
  constructor(private readonly activity?: ActivityBus) {}

  add(
    deviceId: string,
    by: Actor,
    rect: AnnotationRect,
    note: string,
    screenshot: Uint8Array,
  ): HumanAnnotation {
    if (!note.trim())
      throw new PortholeError("BAD_REQUEST", "Annotation note is required.", 400);
    if (
      ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.w <= 0 ||
      rect.h <= 0 ||
      rect.x + rect.w > 1 ||
      rect.y + rect.h > 1
    ) {
      throw new PortholeError(
        "BAD_REQUEST",
        "rect must fit within normalized 0..1 coordinates.",
        400,
      );
    }
    const crop = cropPng(screenshot, rect);
    const annotation: HumanAnnotation = {
      id: this.nextId++,
      deviceId,
      by,
      rect,
      note: note.slice(0, 2000),
      createdAt: new Date().toISOString(),
      dismissed: false,
    };
    this.entries.push({ note: annotation, png: crop });
    this.activity?.publish({
      deviceId,
      actor: by,
      action: "annotation",
      params: { note: annotation.note, ...rect },
      outcome: "ok",
    });
    this.notify(annotation);
    return annotation;
  }

  since(deviceId: string, id = 0): HumanAnnotation[] {
    return this.entries
      .map((entry) => entry.note)
      .filter((note) => note.deviceId === deviceId && note.id > id && !note.dismissed);
  }

  image(id: number): Uint8Array {
    const entry = this.entries.find((value) => value.note.id === id);
    if (!entry) throw new PortholeError("NOT_FOUND", "Annotation not found.", 404);
    return entry.png;
  }

  dismiss(id: number): HumanAnnotation {
    const entry = this.entries.find((value) => value.note.id === id);
    if (!entry) throw new PortholeError("NOT_FOUND", "Annotation not found.", 404);
    entry.note.dismissed = true;
    this.notify(entry.note);
    return entry.note;
  }

  subscribe(cb: (annotation: HumanAnnotation) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private notify(annotation: HumanAnnotation): void {
    for (const listener of this.listeners) listener(annotation);
  }
}

function cropPng(bytes: Uint8Array, rect: AnnotationRect): Uint8Array {
  const original = PNG.sync.read(Buffer.from(bytes));
  const left = Math.min(original.width - 1, Math.floor(rect.x * original.width));
  const top = Math.min(original.height - 1, Math.floor(rect.y * original.height));
  const width = Math.max(
    1,
    Math.min(original.width - left, Math.ceil(rect.w * original.width)),
  );
  const height = Math.max(
    1,
    Math.min(original.height - top, Math.ceil(rect.h * original.height)),
  );
  const crop = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = ((top + y) * original.width + left + x) * 4;
      const target = (y * width + x) * 4;
      crop.data.set(original.data.subarray(source, source + 4), target);
    }
  }
  return new Uint8Array(PNG.sync.write(crop));
}
