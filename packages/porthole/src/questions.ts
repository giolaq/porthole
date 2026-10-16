import { randomUUID } from "node:crypto";
import type { Actor, HumanQuestion } from "./protocol.js";
import type { ActivityBus } from "./activity.js";
import { PortholeError } from "./actions/errors.js";

export class QuestionStore {
  private readonly questions = new Map<string, HumanQuestion>();
  private readonly listeners = new Set<(question: HumanQuestion) => void>();
  constructor(private readonly activity?: ActivityBus) {}

  ask(
    deviceId: string,
    askedBy: Actor,
    text: string,
    options?: string[],
    timeoutMs = 300_000,
  ): HumanQuestion {
    if (!text.trim())
      throw new PortholeError("BAD_REQUEST", "Question text is required.", 400);
    const id = randomUUID();
    const question: HumanQuestion = {
      id,
      deviceId,
      askedBy,
      text: text.slice(0, 2000),
      options: options?.slice(0, 10).map((value) => value.slice(0, 200)),
      createdAt: new Date().toISOString(),
      status: "open",
    };
    this.questions.set(id, question);
    this.activity?.publish({
      deviceId,
      actor: askedBy,
      action: "ask_human",
      params: { text: question.text },
      outcome: "ok",
    });
    this.notify(question);
    const timeout = Math.max(1, Math.min(1_800_000, timeoutMs));
    const timer = setTimeout(() => {
      if (question.status === "open") {
        question.status = "expired";
        this.notify(question);
      }
    }, timeout);
    timer.unref();
    return question;
  }

  get(id: string): HumanQuestion {
    const question = this.questions.get(id);
    if (!question) throw new PortholeError("NOT_FOUND", "Question not found.", 404);
    return question;
  }

  list(deviceId: string, status?: HumanQuestion["status"]): HumanQuestion[] {
    return [...this.questions.values()].filter(
      (question) =>
        question.deviceId === deviceId && (!status || question.status === status),
    );
  }

  answer(id: string, text: string, by: Actor): HumanQuestion {
    const question = this.get(id);
    if (question.status !== "open")
      throw new PortholeError("BAD_REQUEST", "Question is no longer open.", 400);
    if (!text.trim())
      throw new PortholeError("BAD_REQUEST", "Answer text is required.", 400);
    question.answer = { text: text.slice(0, 2000), by, at: new Date().toISOString() };
    question.status = "answered";
    this.activity?.publish({
      deviceId: question.deviceId,
      actor: by,
      action: "answer",
      params: { questionId: id, text: question.answer.text },
      outcome: "ok",
    });
    this.notify(question);
    return question;
  }

  subscribe(cb: (question: HumanQuestion) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async wait(id: string, waitMs: number): Promise<HumanQuestion> {
    const current = this.get(id);
    if (current.status !== "open" || waitMs <= 0) return current;
    return new Promise((resolve) => {
      const off = this.subscribe((question) => {
        if (question.id === id && question.status !== "open") {
          clearTimeout(timer);
          off();
          resolve(question);
        }
      });
      const timer = setTimeout(
        () => {
          off();
          resolve(this.get(id));
        },
        Math.min(30_000, waitMs),
      );
    });
  }

  private notify(question: HumanQuestion): void {
    for (const listener of this.listeners) listener(question);
  }
}
