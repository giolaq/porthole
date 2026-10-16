import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import {
  defaultScreenshotPath,
  fetchSessionScreenshot,
  getSessionJson,
  postSessionJson,
  writeScreenshot,
} from "../control-client.js";
import { runCliAction } from "../cli-errors.js";
import { comparePngScreens, parseDiffRegion } from "../screen-diff.js";
import { recordSession } from "../recording.js";
import {
  sessionControlOpts,
  parseOptionalPort,
  parseRatio,
  parsePositiveInteger,
  parseDurationMs,
  formatRatio,
  printResult,
} from "./shared.js";
export function register(program: Command): void {
  program
    .command("screenshot")
    .description("Take a PNG screenshot from a running session")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-o, --output <file>", "Output path")
    .option("-q, --quiet", "JSON output")
    .action(
      (opts: { port?: string; device?: string; output?: string; quiet?: boolean }) => {
        void runCliAction(opts, async () => {
          const { session, png } = await fetchSessionScreenshot(sessionControlOpts(opts));
          const output = opts.output ?? defaultScreenshotPath(session.serial);
          await writeScreenshot(output, png);
          printResult(opts.quiet, { ok: true, path: output, session }, output);
        });
      },
    );

  program
    .command("assert-screen <baseline>")
    .description("Compare the current screenshot against a PNG baseline")
    .option("--threshold <ratio>", "Maximum mismatch ratio", "0.02")
    .option("--diff <file>", "Write a PNG diff image")
    .option("--region <x,y,w,h>", "Compare a pixel region")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action(
      (
        baseline: string,
        opts: {
          threshold: string;
          diff?: string;
          region?: string;
          port?: string;
          quiet?: boolean;
        },
      ) => {
        void runCliAction(opts, async () => {
          const { session, png } = await fetchSessionScreenshot({
            port: parseOptionalPort(opts.port),
          });
          const result = comparePngScreens(await readFile(baseline), png, {
            thresholdRatio: parseRatio(opts.threshold, "threshold"),
            region: opts.region === undefined ? undefined : parseDiffRegion(opts.region),
          });
          if (opts.diff && result.diffPng) {
            await writeFile(opts.diff, result.diffPng);
          }
          const payload = {
            ok: result.ok,
            mismatchRatio: result.mismatchRatio,
            diffPath: opts.diff,
            session,
          };
          printResult(
            opts.quiet,
            payload,
            result.ok
              ? `Screen matched (${formatRatio(result.mismatchRatio)})`
              : `Screen differed (${formatRatio(result.mismatchRatio)})`,
          );
          if (!result.ok) process.exitCode = 1;
        });
      },
    );

  program
    .command("record <output>")
    .description("Record the current H.264 stream to an MP4 file")
    .option("--duration <duration>", "Recording duration, e.g. 30s or 1500ms (bare = ms)")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action(
      (
        output: string,
        opts: { duration?: string; port?: string; device?: string; quiet?: boolean },
      ) => {
        void runCliAction(opts, async () => {
          const result = await recordSession({
            output,
            durationMs:
              opts.duration === undefined ? undefined : parseDurationMs(opts.duration),
            ...sessionControlOpts(opts),
          });
          printResult(opts.quiet, result, `Recorded ${result.path}`);
        });
      },
    );

  program
    .command("focused")
    .description("Print the currently focused UI node")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((opts: { port?: string; device?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const result = await getSessionJson("/api/focused", sessionControlOpts(opts));
        printResult(opts.quiet, result, JSON.stringify(result.response, null, 2));
      });
    });

  program
    .command("focus-on <text>")
    .description("Move TV D-pad focus to matching text")
    .option("--select", "Press select after focusing")
    .option("--max-steps <count>", "Maximum D-pad steps", "15")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action(
      (
        text: string,
        opts: { select?: boolean; maxSteps: string; port?: string; quiet?: boolean },
      ) => {
        void runCliAction(opts, async () => {
          const result = await postSessionJson(
            "/api/focus_on",
            {
              text,
              select: opts.select === true,
              maxSteps: parsePositiveInteger(opts.maxSteps, "max-steps"),
            },
            sessionControlOpts(opts),
          );
          printResult(opts.quiet, result, `Focused ${text}`);
        });
      },
    );

  program
    .command("dump-ui")
    .description("Dump the Android accessibility hierarchy")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("--filter <text>", "Filter by text/resource id/content description")
    .option("-q, --quiet", "JSON output")
    .action(
      (opts: { port?: string; device?: string; filter?: string; quiet?: boolean }) => {
        void runCliAction(opts, async () => {
          const query = opts.filter
            ? `?${new URLSearchParams({ filter: opts.filter }).toString()}`
            : "";
          const result = await getSessionJson(`/api/ui${query}`, {
            ...sessionControlOpts(opts),
          });
          printResult(opts.quiet, result, JSON.stringify(result.response, null, 2));
        });
      },
    );

  program
    .command("wait-for <text>")
    .description("Wait until text appears in the UI hierarchy")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("--timeout <ms>", "Timeout in milliseconds", "10000")
    .option("-q, --quiet", "JSON output")
    .action(
      (
        text: string,
        opts: { port?: string; device?: string; timeout: string; quiet?: boolean },
      ) => {
        void runCliAction(opts, async () => {
          const result = await postSessionJson(
            "/api/wait_for",
            { text, timeoutMs: Number(opts.timeout) },
            sessionControlOpts(opts),
          );
          printResult(opts.quiet, { ok: true, ...result }, `Found "${text}"`);
        });
      },
    );
}
