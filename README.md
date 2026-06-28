# HipFlow Studio

HipFlow Studio is a web-first songwriting and rap flow sketching app. The first implementation focuses on a headless timing, drum, and lyric-grid engine so future UI agents can build screens through a small command API.

## Architecture

- `packages/core`: pure TypeScript domain model, command reducer, drum utilities, lyric split/merge rules, and project validation.
- `packages/audio`: framework-agnostic audio transport API with a Tone.js-backed implementation and pure scheduler tests.
- `packages/storage`: Dexie/IndexedDB repository plus JSON import/export.
- `packages/ui-contract`: `FlowStudioController`, app snapshots, events, and selectors for frontend agents.
- `apps/web-debug`: minimal Vite React UI for validating the engine. It is intentionally not the production UI.

The main invariant is that the lyric grid is stored in musical ticks, not visual columns. In 4/4, one bar is `3840` ticks and the default 16 cells are `240` ticks each. Split and merge operations must preserve full-bar coverage with no gaps or overlaps.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

`pnpm dev` starts the debug app.

## Frontend Contract

Frontend code should use `FlowStudioController.dispatch(command)` for all state changes and read state through snapshots/selectors. Production components should not reimplement split, merge, drum, or timing logic.
