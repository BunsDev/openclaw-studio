# Inline Task Control Plane Beads Runner Into `/api/task-control-plane`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository’s ExecPlan format requirements live at `.agent/PLANS.md` from the repository root. This document must be maintained in accordance with that file.

## Purpose / Big Picture

OpenClaw Studio includes a “Task Control Plane” view (`/control-plane`) powered by Beads (`br`) JSON output. Today, the API route `src/app/api/task-control-plane/route.ts` delegates Beads process execution and JSON parsing to a separate single-use server module `src/lib/task-control-plane/br.server.ts`.

After this refactor, the Beads runner logic will live directly in `src/app/api/task-control-plane/route.ts`, and `src/lib/task-control-plane/br.server.ts` will be removed. This reduces surface area and “places to look” without changing user-visible behavior. The route should still return the same HTTP status codes and payload shapes for success and error cases.

You can see this working by running unit tests and by starting the app (`npm run dev`) and loading `http://localhost:3000/control-plane`.

## Progress

- [x] (2026-02-06 16:57Z) Update unit tests to characterize the task control plane route while mocking `node:child_process` directly (no mocks of `br.server.ts`).
- [x] (2026-02-06 16:58Z) Inline `runBrJson` + `loadTaskControlPlaneRawData` into `src/app/api/task-control-plane/route.ts`, delete `src/lib/task-control-plane/br.server.ts`, and remove/replace the old unit tests that import it.
- [x] (2026-02-06 16:59Z) Run repo gates (`lint`, `test`, `typecheck`, `build`) and commit as one atomic refactor.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Delete `src/lib/task-control-plane/br.server.ts` and inline its logic into `src/app/api/task-control-plane/route.ts`.
  Rationale: The module is only used by one route (`src/app/api/task-control-plane/route.ts`) plus unit tests. Keeping it as a separate “library” boundary adds an extra concept without reuse.
  Date/Author: 2026-02-06 / Codex

## Outcomes & Retrospective

- `src/app/api/task-control-plane/route.ts` now owns the Beads `br` execution + JSON parsing logic (no intermediate wrapper module).
- Deleted `src/lib/task-control-plane/br.server.ts` and removed the associated unit tests that imported it.
- Route tests now mock `node:child_process.spawnSync` directly, which keeps behavior coverage intact after deleting the helper module.
- Repo gates were run successfully: `lint`, `test`, `typecheck`, `build`.

## Context and Orientation

The task control plane data flow is:

1. The page `src/app/control-plane/page.tsx` fetches JSON from `/api/task-control-plane`.
2. The route `src/app/api/task-control-plane/route.ts` loads raw issue lists from Beads (`br`) and converts them into a UI-friendly snapshot via `src/lib/task-control-plane/read-model.ts`.

The current Beads runner module is:

- `src/lib/task-control-plane/br.server.ts`: runs `br` via `node:child_process.spawnSync`, expects JSON on stdout, and provides two exports:
  - `runBrJson(command, options?)` for one command.
  - `loadTaskControlPlaneRawData({ cwd? })` which calls `br where`, `br list --status open`, `br list --status in_progress`, and `br blocked`.

The route currently imports `loadTaskControlPlaneRawData` from `br.server.ts` and maps errors to:

- HTTP 400 with a “Beads workspace not initialized” message when the error text contains “no beads directory found” or “not initialized”.
- HTTP 502 for other failures (with `{ error: <message> }`).

The refactor goal is to preserve this behavior while removing the extra file.

## Plan of Work

First, update tests to stop mocking `@/lib/task-control-plane/br.server` and instead mock `node:child_process.spawnSync` so tests cover the route behavior end-to-end (within unit-test constraints).

Then, copy the Beads runner logic into `src/app/api/task-control-plane/route.ts` as local helper functions and delete `src/lib/task-control-plane/br.server.ts`.

Finally, run the repo gates and commit as one atomic change.

## Concrete Steps

All commands below assume the working directory is the repo root: `/Users/georgepickett/.codex/worktrees/f6e9/openclaw-studio`.

### Milestone 1: Route Characterization Tests (Mock `spawnSync`)

At the end of this milestone, tests should fail if the route stops calling `br` commands in the expected way or if status code mapping changes.

1. Tests to write/update:

   Update `tests/unit/taskControlPlaneRoute.test.ts` to:

   - Stop importing and mocking `loadTaskControlPlaneRawData` from `@/lib/task-control-plane/br.server`.
   - Mock `node:child_process` and override `spawnSync` similarly to the existing pattern in `tests/unit/taskControlPlaneBrRunner.test.ts`.
   - Keep mocking `@/lib/task-control-plane/read-model` and `@/lib/logger` so the test focuses on the route’s behavior.

   Add/modify tests to cover:

   - Success: `GET()` returns HTTP 200 and returns `{ snapshot }`.
     Arrange `spawnSync` to return valid JSON for four calls in order: `br where`, `br list --status open`, `br list --status in_progress`, `br blocked`.
     Assert `spawnSync` was called with the expected argv (include `--json`), and assert `buildTaskControlPlaneSnapshot` was called with the parsed raw data shape.

   - Beads-not-initialized: route returns HTTP 400 with the friendly “Beads workspace not initialized…” message.
     Arrange `spawnSync` for the first call to return `status: 1` and stdout JSON like `{ "error": "no beads directory found" }`.
     Assert status 400, error message contains “Beads workspace not initialized”, and logger was called.

   - Other failures: route returns HTTP 502 with `{ error: <message> }`.
     Arrange `spawnSync` to throw an error message that does not match the beads workspace predicate (for example, return `status: 1` and stdout JSON `{ "error": "boom" }`).
     Assert status 502 and error is “boom”.

2. Tests to remove/replace:

   Since `src/lib/task-control-plane/br.server.ts` will be deleted in milestone 2, `tests/unit/taskControlPlaneBrRunner.test.ts` must be removed or rewritten so it no longer imports from that module. The simplest consolidation is to delete `tests/unit/taskControlPlaneBrRunner.test.ts` and rely on the route tests above for coverage.

3. Verification:

   Run:

     npm run test

   Confirm tests pass.

### Milestone 2: Inline Beads Runner Into the Route and Delete `br.server.ts`

At the end of this milestone, the route directly runs Beads and parses JSON, and the `br.server.ts` file no longer exists.

1. Implementation:

   Edit `src/app/api/task-control-plane/route.ts`:

   - Add a `node:child_process` import.
   - Copy the helper logic from `src/lib/task-control-plane/br.server.ts` into this route module as local (non-exported) helpers:
     - `runBrJson(command, options?)`
     - `loadTaskControlPlaneRawData({ cwd? })`
     - Any small private helpers they need (`extractErrorMessage`, JSON parsing, scope parsing).
   - Keep the existing `isBeadsWorkspaceError` mapping and the response shapes unchanged.
   - Keep `buildTaskControlPlaneSnapshot` in `src/lib/task-control-plane/read-model.ts` unchanged and continue to call it from the route.

   Delete `src/lib/task-control-plane/br.server.ts`.

   Update any imports under `src/` and `tests/` that referenced `@/lib/task-control-plane/br.server` so they no longer exist.

2. Verification:

   Run:

     npm run test
     npm run typecheck

   Confirm both pass.

### Milestone 3: Gates and Commit

1. Run the full gates:

     npm run lint
     npm run test
     npm run typecheck
     npm run build

2. Commit:

   Commit everything as one atomic commit with a message like: `refactor: inline task control plane beads runner`.

## Validation and Acceptance

Acceptance criteria:

- `src/lib/task-control-plane/br.server.ts` is deleted and has no remaining references in the repo.
- `/api/task-control-plane` behavior is preserved:
  - returns 200 with `{ snapshot }` on success
  - returns 400 with the “Beads workspace not initialized…” message on beads init errors
  - returns 502 for other failures
- Tests cover the route behavior by mocking `node:child_process.spawnSync` (not by mocking a deleted helper module).
- `npm run lint`, `npm run test`, `npm run typecheck`, and `npm run build` all succeed.

## Idempotence and Recovery

This is a behavior-preserving refactor. If the refactor introduces issues, revert by restoring `src/lib/task-control-plane/br.server.ts` and switching `src/app/api/task-control-plane/route.ts` back to importing `loadTaskControlPlaneRawData`, then re-run the gates.

## Artifacts and Notes

- None yet.

## Interfaces and Dependencies

After this refactor:

- `src/app/api/task-control-plane/route.ts` is the only module responsible for invoking `br` and parsing its JSON output.
- `src/lib/task-control-plane/read-model.ts` remains the only module responsible for turning raw Beads issues into a UI snapshot.
