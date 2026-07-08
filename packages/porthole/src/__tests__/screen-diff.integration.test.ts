import { describe, expect, it } from "vitest";
import { fetchSessionScreenshot } from "../control-client.js";
import { comparePngScreens } from "../screen-diff.js";

const describeIfEmulator = process.env.PORTHOLE_EMU === "1" ? describe : describe.skip;

// Screenshot round-trips on the software-rendered CI emulator routinely
// exceed vitest's 5s default, hence the explicit per-test timeout.
const EMULATOR_TEST_TIMEOUT_MS = 60_000;

describeIfEmulator("screen diff integration", () => {
  it(
    "passes against a just-taken screenshot at zero threshold",
    async () => {
      const { png } = await fetchSessionScreenshot();
      const result = comparePngScreens(png, png, { thresholdRatio: 0 });

      expect(result.ok).toBe(true);
      expect(result.mismatchRatio).toBe(0);
    },
    EMULATOR_TEST_TIMEOUT_MS,
  );
});
