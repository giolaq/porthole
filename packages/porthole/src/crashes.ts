export interface CrashRecord {
  ts: string;
  process: string;
  summary: string;
  stack: string;
}

export function parseCrashes(logcat: string, limit = 20): CrashRecord[] {
  const lines = logcat.split(/\r?\n/);
  const crashes: CrashRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (
      !line.includes("FATAL EXCEPTION") &&
      !line.includes("ANR in") &&
      !line.includes("Fatal signal")
    ) {
      continue;
    }

    const stack = [line];
    for (let j = i + 1; j < lines.length && stack.length < 80; j++) {
      const next = lines[j] ?? "";
      if (!next.trim()) break;
      if (
        next.includes("FATAL EXCEPTION") ||
        next.includes("ANR in") ||
        next.includes("Fatal signal")
      ) {
        break;
      }
      stack.push(next);
    }

    crashes.push({
      ts: line.slice(0, 18).trim(),
      process: extractProcess(stack.join("\n")),
      summary: summarize(stack),
      stack: stack.join("\n"),
    });
  }

  return crashes.slice(-limit);
}

function extractProcess(stack: string): string {
  return /Process:\s*([^,\s]+)/.exec(stack)?.[1] ?? "";
}

function summarize(stack: string[]): string {
  return (
    stack.find((line) => line.includes("Exception"))?.trim() ?? stack[0]?.trim() ?? ""
  );
}
