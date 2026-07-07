export interface CliErrorOptions {
  quiet?: boolean;
}

export async function runCliAction(
  opts: CliErrorOptions,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env["PORTHOLE_DEBUG"]) {
      console.error(error);
    } else if (opts.quiet) {
      process.stderr.write(JSON.stringify({ error: message }) + "\n");
    } else {
      process.stderr.write(`porthole: ${message}\n`);
    }
    process.exit(1);
  }
}
