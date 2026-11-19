import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const engineImport = String.raw`(?:^|/)engine(?:/|$)|^@yume-chan(?:/|$)`;
const engineImportSelector = engineImport.replaceAll("/", String.raw`\u002f`);
const engineImportMessage =
  "Use the Porthole API instead of importing engine modules directly.";

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
    files: [
      "packages/porthole/src/{cli,cli-errors}.{ts,tsx}",
      "packages/porthole/src/{cli,mcp}/**/*.{ts,tsx}",
      "packages/porthole-client/src/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: engineImport, message: engineImportMessage }] },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=/${engineImportSelector}/]`,
          message: engineImportMessage,
        },
        {
          selector: `ImportExpression[source.type="TemplateLiteral"][source.expressions.length=0][source.quasis.0.value.cooked=/${engineImportSelector}/]`,
          message: engineImportMessage,
        },
      ],
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
