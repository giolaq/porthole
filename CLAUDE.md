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
  packages/
    porthole/               CLI + server + engine + MCP (src/)
      assets/scrcpy-server  downloaded at install (gitignored, sha256-pinned)
      scripts/download-scrcpy-server.mjs   pin + checksum live here
    porthole-client/        React preview UI (src/)
  docs/
    PRD.md                  source of truth for requirements & milestones
  skill/
    SKILL.md                optional agent skill
```

The `scrcpy-server` jar is NOT committed. It is fetched from the pinned
Genymobile/scrcpy GitHub release by a `postinstall` script and verified by
SHA-256. Bump version + checksum together in `download-scrcpy-server.mjs`.

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
- Respect non-goals in `docs/PRD.md` §4: no iOS, no physical devices, no audio.
- Pure-logic unit tests (config.ini parsing, keycodes, CLI args) need no emulator.
- Published package name: `portholejs` (bin: `porthole`).
