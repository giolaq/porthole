import type { ScrollDirection } from "../gesture.js";

export function sessionControlOpts(opts: { port?: string; device?: string }): {
  port?: number;
  device?: string;
} {
  return {
    port: parseOptionalPort(opts.port),
    device: opts.device,
  };
}

export function parseOptionalPort(port: string | undefined): number | undefined {
  return port === undefined ? undefined : parsePort(port);
}

export function parsePort(port: string): number {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  return parsed;
}

export function parseNormalized(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be a number in 0..1`);
  }
  return parsed;
}

export function parsePositiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

export function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

export function parseRatio(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be a number in 0..1`);
  }
  return parsed;
}

export function parseDurationMs(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(value);
  if (!match) throw new Error("duration must look like 1500ms, 30s, or 1500 (ms)");
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("duration must be a positive number");
  }
  // Bare numbers are milliseconds, matching every other --duration flag.
  return Math.round(amount * (match[2] === "s" ? 1000 : 1));
}

export function isScrollDirection(value: string): value is ScrollDirection {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

export function formatRatio(value: number): string {
  return `${(value * 100).toFixed(2)}% mismatch`;
}

export function printResult(
  quiet: boolean | undefined,
  json: unknown,
  text: string,
): void {
  if (quiet) {
    process.stdout.write(JSON.stringify(json) + "\n");
  } else {
    console.log(text);
  }
}
