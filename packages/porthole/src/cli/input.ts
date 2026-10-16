import { Command } from "commander";
import { REMOTE_BUTTON_TO_KEYCODE, type RemoteButton } from "../keycodes.js";
import { sendSessionInput, postSessionJson } from "../control-client.js";
import { runCliAction } from "../cli-errors.js";
import { scrollGesture } from "../gesture.js";
import {
  sessionControlOpts,
  parseOptionalPort,
  parseNormalized,
  parsePositiveNumber,
  parsePositiveInteger,
  isScrollDirection,
  printResult,
} from "./shared.js";
export function register(program: Command): void {
  program
    .command("tap <x> <y>")
    .description("Touch at normalized 0..1 coordinates")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((x: string, y: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const nx = parseFloat(x);
        const ny = parseFloat(y);
        if (isNaN(nx) || isNaN(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
          throw new Error("Coordinates must be numbers in 0..1");
        }
        await sendSessionInput(
          { kind: "touch", phase: "down", x: nx, y: ny },
          sessionControlOpts(opts),
        );
        const session = await sendSessionInput(
          { kind: "touch", phase: "up", x: nx, y: ny },
          sessionControlOpts(opts),
        );
        printResult(
          opts.quiet,
          { ok: true, session, event: "tap" },
          `Tapped ${nx},${ny}`,
        );
      });
    });

  program
    .command("swipe <x1> <y1> <x2> <y2>")
    .description("Swipe between normalized 0..1 phone coordinates")
    .option("--duration <ms>", "Gesture duration in milliseconds")
    .option("--steps <count>", "Number of move events")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action(
      (
        x1: string,
        y1: string,
        x2: string,
        y2: string,
        opts: { duration?: string; steps?: string; port?: string; quiet?: boolean },
      ) => {
        void runCliAction(opts, async () => {
          const event = {
            kind: "gesture" as const,
            type: "swipe" as const,
            x1: parseNormalized(x1, "x1"),
            y1: parseNormalized(y1, "y1"),
            x2: parseNormalized(x2, "x2"),
            y2: parseNormalized(y2, "y2"),
            ...(opts.duration === undefined
              ? {}
              : { durationMs: parsePositiveNumber(opts.duration, "duration") }),
            ...(opts.steps === undefined
              ? {}
              : { steps: parsePositiveInteger(opts.steps, "steps") }),
          };
          const session = await sendSessionInput(event, {
            port: parseOptionalPort(opts.port),
          });
          printResult(opts.quiet, { ok: true, session, event }, "Swiped");
        });
      },
    );

  program
    .command("longpress <x> <y>")
    .alias("long-press")
    .description("Long-press normalized 0..1 phone coordinates")
    .option("--duration <ms>", "Hold duration in milliseconds")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action(
      (
        x: string,
        y: string,
        opts: { duration?: string; port?: string; quiet?: boolean },
      ) => {
        void runCliAction(opts, async () => {
          const event = {
            kind: "gesture" as const,
            type: "longpress" as const,
            x1: parseNormalized(x, "x"),
            y1: parseNormalized(y, "y"),
            ...(opts.duration === undefined
              ? {}
              : { durationMs: parsePositiveNumber(opts.duration, "duration") }),
          };
          const session = await sendSessionInput(event, {
            port: parseOptionalPort(opts.port),
          });
          printResult(opts.quiet, { ok: true, session, event }, "Long-pressed");
        });
      },
    );

  program
    .command("scroll <direction>")
    .description("Scroll a phone screen: up, down, left, or right")
    .option("--amount <value>", "Normalized scroll amount", "0.5")
    .option("--duration <ms>", "Gesture duration in milliseconds")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action(
      (
        direction: string,
        opts: { amount: string; duration?: string; port?: string; quiet?: boolean },
      ) => {
        void runCliAction(opts, async () => {
          if (!isScrollDirection(direction)) {
            throw new Error("Scroll direction must be up, down, left, or right");
          }
          const event = scrollGesture(
            direction,
            parseNormalized(opts.amount, "amount"),
            opts.duration === undefined
              ? undefined
              : parsePositiveNumber(opts.duration, "duration"),
          );
          const session = await sendSessionInput(event, {
            port: parseOptionalPort(opts.port),
          });
          printResult(
            opts.quiet,
            { ok: true, session, direction, event },
            `Scrolled ${direction}`,
          );
        });
      },
    );

  program
    .command("key <keycode>")
    .description("Send a single Android keyevent")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((keycode: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const code = parseInt(keycode, 10);
        if (isNaN(code)) {
          throw new Error("Keycode must be a number");
        }
        await sendSessionInput(
          { kind: "key", phase: "down", keycode: code },
          sessionControlOpts(opts),
        );
        const session = await sendSessionInput(
          { kind: "key", phase: "up", keycode: code },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, session, keycode: code }, `Key ${code} sent`);
      });
    });

  program
    .command("remote <button>")
    .description("D-pad / media remote button")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((button: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        if (!(button in REMOTE_BUTTON_TO_KEYCODE)) {
          throw new Error(
            `Unknown button: ${button}. Valid: ${Object.keys(REMOTE_BUTTON_TO_KEYCODE).join(", ")}`,
          );
        }
        const session = await sendSessionInput(
          { kind: "remote", button: button as RemoteButton },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, session, button }, `Remote: ${button}`);
      });
    });

  program
    .command("text <string>")
    .description("Type text")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((text: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const session = await sendSessionInput(
          { kind: "text", text },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, session, text }, `Typed "${text}"`);
      });
    });

  program
    .command("rotate <orientation>")
    .description("Rotate a phone session: portrait, landscape, left, or right")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((orientation: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const result = await postSessionJson(
          "/api/rotate",
          { orientation },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, ...result }, `Rotated ${orientation}`);
      });
    });

  program
    .command("emu <args...>")
    .description("Pass arguments to adb emu for the active session")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((args: string[], opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const result = await postSessionJson(
          "/api/emu",
          { args },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, ...result }, "Emulator command sent");
      });
    });
}
