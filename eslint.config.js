import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "vitest.config.ts",
      "playwright.config.ts",
      "e2e/",
      "packages/porthole-client/vite.config.ts",
      "examples/",
    ],
  },
);
