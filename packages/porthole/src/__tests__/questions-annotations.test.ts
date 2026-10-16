import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { QuestionStore } from "../questions.js";
import { AnnotationStore } from "../annotations.js";
import { FakeEngine } from "./helpers/fake-engine.js";

describe("question store", () => {
  it("wakes a pending question when a human answers", async () => {
    const store = new QuestionStore();
    const question = store.ask("device", { kind: "agent", id: "mcp" }, "Continue?", [
      "Yes",
      "No",
    ]);
    const waiting = store.wait(question.id, 1000);
    store.answer(question.id, "Yes", { kind: "human", id: "browser" });
    const result = await waiting;
    expect(result.status).toBe("answered");
    expect(result.answer?.text).toBe("Yes");
    expect(store.list("device", "open")).toEqual([]);
  });
});

describe("annotation store", () => {
  it("keeps a PNG crop and dismisses the note", async () => {
    const store = new AnnotationStore();
    const png = await new FakeEngine().screenshot();
    const note = store.add(
      "device",
      { kind: "human" },
      { x: 0, y: 0, w: 1, h: 1 },
      "Border clipped",
      png,
    );
    expect(store.since("device", 0)).toHaveLength(1);
    expect(PNG.sync.read(Buffer.from(store.image(note.id))).width).toBe(1);
    store.dismiss(note.id);
    expect(store.since("device", 0)).toEqual([]);
  });
});
