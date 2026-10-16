import { Command } from "commander";
import { getSessionJson, postSessionJson } from "../control-client.js";
import { runCliAction } from "../cli-errors.js";
import type { ActivityEvent, ControlState, HumanQuestion } from "../protocol.js";
import { printResult, sessionControlOpts, parseDurationMs } from "./shared.js";

type Options = { port?: string; device?: string; quiet?: boolean; follow?: boolean };

export function register(program: Command): void {
  program
    .command("activity")
    .description("Show recent session activity")
    .option("--follow", "Follow new activity")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON lines")
    .action((opts: Options) => {
      void runCliAction(opts, async () => {
        let since = 0;
        do {
          const query = new URLSearchParams({
            since: String(since),
            limit: "100",
            wait: opts.follow ? "30000" : "0",
          });
          const { response } = await getSessionJson(
            `/api/activity?${query}`,
            sessionControlOpts(opts),
          );
          const events = (response as { events: ActivityEvent[] }).events;
          for (const event of events) {
            since = Math.max(since, event.id);
            if (opts.quiet) process.stdout.write(JSON.stringify(event) + "\n");
            else
              console.log(
                `${event.ts} ${event.actor.kind}${event.actor.id ? `:${event.actor.id}` : ""} ${event.action} ${event.outcome}`,
              );
          }
        } while (opts.follow);
      });
    });

  program
    .command("control [holder]")
    .description("Show or change who can control the device")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((holder: string | undefined, opts: Options) => {
      void runCliAction(opts, async () => {
        if (holder && holder !== "shared" && holder !== "human")
          throw new Error("holder must be shared or human");
        const { response } = holder
          ? await postSessionJson("/api/control", { holder }, sessionControlOpts(opts))
          : await getSessionJson("/api/control", sessionControlOpts(opts));
        const state = response as ControlState;
        printResult(opts.quiet, state, `Control: ${state.holder}`);
      });
    });

  program
    .command("ask <question>")
    .description("Ask the human watching the session a question")
    .option(
      "--option <value>",
      "Answer option (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option("--timeout <duration>", "Wait duration, e.g. 60s", "300s")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((question: string, opts: Options & { option: string[]; timeout: string }) => {
      void runCliAction(opts, async () => {
        const { response } = await postSessionJson(
          "/api/questions",
          {
            text: question,
            options: opts.option,
            timeoutMs: parseDurationMs(opts.timeout),
          },
          sessionControlOpts(opts),
        );
        const created = response as HumanQuestion;
        let current = created;
        while (current.status === "open") {
          current = (
            await getSessionJson(
              `/api/questions/${encodeURIComponent(created.id)}?wait=30000`,
              sessionControlOpts(opts),
            )
          ).response as HumanQuestion;
        }
        const result =
          current.status === "answered"
            ? { answered: true, answer: current.answer?.text }
            : { answered: false, reason: "timeout" };
        printResult(
          opts.quiet,
          result,
          current.answer?.text ?? "No answer before timeout.",
        );
      });
    });

  program
    .command("say <message>")
    .description("Post a note to the activity feed")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((message: string, opts: Options) => {
      void runCliAction(opts, async () => {
        await postSessionJson("/api/say", { message }, sessionControlOpts(opts));
        printResult(opts.quiet, { ok: true }, "Note sent");
      });
    });
}
