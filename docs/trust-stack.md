# Porthole trust assessment

| Layer         | Starting point                                                                                                                                                                                                                                            | Change in this PR                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code          | The shared control plane routes MCP operations through the session. CLI startup nevertheless imported the Vega engine module to boot a device.                                                                                                            | Separate Vega SDK discovery and device startup from the streaming engine.                                                                                               |
| Static checks | Strict TypeScript, ESLint, Vitest coverage and package-install smoke tests run on Linux, macOS and Windows with Node 20 and 22. Android integration and Playwright run on main pushes and manual dispatch. The engine import boundary depended on review. | Check operator imports in the existing lint job. Keep mocked SDK startup tests runnable without an emulator. Set the CI workflow token to contents-read.                |
| Instructions  | AGENTS.md covers conventions. CLAUDE.md includes it. The packaged Porthole skill describes using the product.                                                                                                                                             | Add one worker handoff, an acceptance test, independent verification and risk-based review to contributor instructions.                                                 |
| Human review  | The project has merged feature PRs and also accepts direct pushes. There was no PR template or CODEOWNERS file.                                                                                                                                           | Capture risk, review level, proof and skipped checks in the PR. Include a digest and protocol checklist on automated scrcpy pin PRs. The maintainer decides what ships. |

At assessment time GitHub reported no active rules on `main`, auto-merge
disabled, and read-only default workflow permissions. The scheduled scrcpy
pin job explicitly requests contents and PR writes to open update PRs.
Repository files alone cannot prevent a write-capable account from pushing to
main or merging. The owner must decide who can merge, which checks and
approvals to require, and where to provision workers without host credentials.

GitHub Issues had no open items to rank. The four phases of the current
development plan already have merged PRs (#17–#20).
