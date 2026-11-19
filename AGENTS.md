# Porthole

A window into your Android emulator — streams phone and TV AVDs to the browser with full input control.

Full requirements and milestones live in `docs/PRD.md`. This file covers conventions only.

## Tech stack

- TypeScript (strict), Node ≥ 20
- ADB/scrcpy via `@yume-chan/*` packages — verify current APIs on npm before use
- HTTP + WS: `http` + `ws`
- Web client: React + Vite, WebCodecs VideoDecoder → canvas
- MCP: `@modelcontextprotocol/sdk`, stdio transport
- Testing: Vitest
- Lint/format: ESLint + Prettier
- Package manager: npm workspaces

## Repository layout

```
porthole/
  package.json              npm workspaces root
  assets/
    porthole-logo.png       project logo
  packages/
    porthole/               CLI + server + engine + MCP (src/)
      assets/scrcpy-server  downloaded at install (gitignored, SHA-256 verified)
      scripts/download-scrcpy-server.mjs
    porthole-client/        React preview UI (src/)
  docs/
    PRD.md                  source of truth for requirements & milestones
    CODEX_PLAN_4.md         current development plan
  e2e/                      browser end-to-end tests
  examples/rn-tvos-app/     demo TV app
  skills/porthole/SKILL.md  packaged agent skill
  action.yml                GitHub Action entrypoint
```

## Build & test commands

```sh
npm install               # install all workspaces
npm run build             # build all packages
npm run test              # vitest (unit tests, no emulator needed)
npm run lint              # eslint + prettier check
npm run typecheck         # tsc --noEmit
```

Integration tests (require a booted emulator) are gated behind `PORTHOLE_EMU=1`.

## Conventions

- Build one milestone at a time; M(n) must be green before starting M(n+1).
- `strict: true` everywhere; no `any` without justification.
- Filenames: kebab-case. Small, single-purpose modules.
- Engine details must not leak past the `Engine` interface into CLI/client/MCP.
- Before using any `@yume-chan/*` API, verify it against current npm docs — do not rely on memorized signatures.
- Do not commit `scrcpy-server`; it is downloaded at install time by `packages/porthole/scripts/download-scrcpy-server.mjs` and SHA-256 verified.
- Respect non-goals in `docs/PRD.md` §4: no iOS, no physical devices, no audio.
- Pure-logic unit tests (config.ini parsing, keycodes, CLI args) need no emulator.
- Published package name: `portholejs` (bin: `porthole`).

## From request to pull request

The manager takes one issue or request, defines a CI-runnable acceptance test
and hands it to one coding agent. Give the worker a disposable sandbox, a
clean checkout, its own context and a way to terminate it. Keep GitHub writes
with the manager. Workers need source read access and local workspace writes.
Keep host home directories, browser sessions, CLI logins, signing keys, and
release tokens outside the sandbox.

The worker writes and runs the acceptance test before implementation and
observes the expected failure. After implementing the change, rerun the same
test, verify it passes and try a failure case. Return the diff, commands,
actual results and any skips or blockers with reasons.

The manager checks the diff, independently verifies the proof and opens a PR.
After every push, recheck the PR head SHA. Before final reporting, confirm the
head again and wait for GitHub CI on the latest PR commit to finish. Record the
head SHA, CI check link and actual outcomes, including skips or blockers with
reasons. Use the PR checklist for acceptance criteria when the request has no
issue. Keep merges with a human.

Choose the highest applicable review level. Escalate uncertainty to the owner.

| Radius                                                                | Review | Evidence                                                                                                                                         |
| --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Green (docs, local non-runtime changes)                               | AI 1   | Focused check and diff review. Check examples for accidental credentials.                                                                        |
| Yellow (runtime or interface changes)                                 | AI 2   | Build, coverage, lint, types and a failure case. Exercise changed boundaries with invalid input. Run Playwright for changed browser flows.       |
| Yellow (cross-package or multi-operator behavior)                     | AI 3   | AI 2 plus an independent trace through each affected operator, including an adverse case. Run emulator integration for affected device behavior. |
| Red (auth, destructive device actions, release or permission changes) | Human  | AI 3 evidence where applicable, explicit failure and security checks, and human approval before merge.                                           |

For live Android proof use an isolated AVD with `PORTHOLE_EMU=1 npm test`.
Browser proof uses `PORTHOLE_E2E=1 npm run test:e2e` with a running session.
Record unavailable checks in the PR. Ask the owner before changing CI,
permissions, credentials, dependencies or release settings. When a reviewer
corrects a recurring mistake, fix the code, add a deterministic lint rule or
test, then update the relevant rule here.
