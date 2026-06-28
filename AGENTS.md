# AGENTS.md

## Project

We are building HipFlow Studio: a web-first songwriting and rap flow sketching app.

The product has:
- A transport bar with BPM, play, stop, loop state.
- A drum channel rack similar in workflow to a 16-step drum sequencer.
- A lyric/flow grid where each bar defaults to 16 cells.
- Lyric cells can be split and merged like spreadsheet/table cells.
- Audio timing and UI timing must be kept separate.
- The production frontend will be built later by another agent, so core logic must remain headless.

## Non-negotiable architecture

Use a pnpm TypeScript monorepo.

Packages:
- packages/core: pure TypeScript domain model, commands, reducer, validation.
- packages/audio: Tone.js/Web Audio implementation. No React dependency.
- packages/storage: Dexie/IndexedDB and JSON import/export.
- packages/ui-contract: controller, selectors, events, frontend-facing API.
- apps/web-debug: minimal debug UI only, not production UI.

## Coding rules

- Prefer pure functions in packages/core.
- Do not put UI logic in packages/core.
- Do not put React dependencies in packages/core or packages/audio.
- All commands must be serializable plain objects.
- All state snapshots must be serializable.
- Every split/merge operation must preserve bar timing invariants.
- Add tests for every reducer and grid command.
- Use Vitest for unit tests.
- Use strict TypeScript.
- Avoid unnecessary dependencies.

## Required checks

Before finishing a task, run:
- pnpm typecheck
- pnpm test
- pnpm lint if configured

If a command cannot be run, explain why and leave a clear TODO.
