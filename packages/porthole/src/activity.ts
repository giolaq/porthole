import type { ActivityEvent } from "./protocol.js";

export type NewActivityEvent = Omit<ActivityEvent, "id" | "ts">;

export class ActivityBus {
  private readonly events: ActivityEvent[] = [];
  private readonly listeners = new Set<(event: ActivityEvent) => void>();
  private nextId = 1;

  publish(input: NewActivityEvent): ActivityEvent {
    const event: ActivityEvent = {
      ...input,
      id: this.nextId++,
      ts: new Date().toISOString(),
      params: input.params ? sanitizeParams(input.params) : undefined,
    };
    this.events.push(event);
    if (this.events.length > 500) this.events.shift();
    for (const listener of this.listeners) listener(event);
    return event;
  }

  since(id = 0, limit = 100, deviceId?: string): ActivityEvent[] {
    const count = Math.max(0, Math.min(limit, 500));
    if (count === 0) return [];
    return this.events
      .filter((event) => event.id > id && (!deviceId || event.deviceId === deviceId))
      .slice(-count);
  }

  subscribe(cb: (event: ActivityEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (/^(data|contents?|bytes|png|file)$/i.test(key)) continue;
    if (typeof value === "string") clean[key] = value.slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean" || value === null)
      clean[key] = value;
    else if (Array.isArray(value))
      clean[key] = value
        .slice(0, 20)
        .map((item) => (typeof item === "string" ? item.slice(0, 200) : item));
  }
  return clean;
}
