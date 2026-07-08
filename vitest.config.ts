import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: [
        "packages/porthole/src/cli-errors.ts",
        "packages/porthole/src/crashes.ts",
        "packages/porthole/src/focus-navigation.ts",
        "packages/porthole/src/gesture.ts",
        "packages/porthole/src/input-validation.ts",
        "packages/porthole/src/keycodes.ts",
        "packages/porthole/src/port-check.ts",
        "packages/porthole/src/protocol.ts",
        "packages/porthole/src/screen-diff.ts",
        "packages/porthole/src/state.ts",
        "packages/porthole/src/ui-tree.ts",
        "packages/porthole/src/server/frame-convert.ts",
      ],
      exclude: ["packages/porthole/src/__tests__/**"],
      thresholds: {
        lines: 70,
      },
    },
  },
});
