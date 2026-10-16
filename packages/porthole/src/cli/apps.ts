import { Command } from "commander";
import { postSessionJson } from "../control-client.js";
import { runCliAction } from "../cli-errors.js";
import { sessionControlOpts, printResult } from "./shared.js";
export function register(program: Command): void {
  program
    .command("open-url <url>")
    .description("Open an Android deep link or URL")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((url: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const result = await postSessionJson(
          "/api/open_url",
          { url },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, ...result }, `Opened ${url}`);
      });
    });

  program
    .command("launch <package>")
    .description("Launch an installed app package")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((packageName: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const result = await postSessionJson(
          "/api/launch",
          { packageName },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, ...result }, `Launched ${packageName}`);
      });
    });

  program
    .command("stop-app <package>")
    .description("Force-stop an app package")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((packageName: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const result = await postSessionJson(
          "/api/stop_app",
          { packageName },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, ...result }, `Stopped ${packageName}`);
      });
    });

  program
    .command("clear-app <package>")
    .description("Clear an app package's data")
    .option("-p, --port <port>", "Session port")
    .option("-d, --device <serial>", "Target device serial")
    .option("-q, --quiet", "JSON output")
    .action((packageName: string, opts: { port?: string; quiet?: boolean }) => {
      void runCliAction(opts, async () => {
        const result = await postSessionJson(
          "/api/clear_app",
          { packageName },
          sessionControlOpts(opts),
        );
        printResult(opts.quiet, { ok: true, ...result }, `Cleared ${packageName}`);
      });
    });
}
