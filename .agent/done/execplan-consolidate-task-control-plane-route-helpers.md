# Consolidate Task Control Plane Route Helpers (Single-Record Coercion + Beads Init Error)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository has an ExecPlan format and requirements documented at `.agent/PLANS.md` (from the repository root). This document must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

The task control plane API routes under `src/app/api/task-control-plane` all rely on `br` JSON output through `createTaskControlPlaneBrRunner()` and share identical guardrails:

- The “Beads workspace not initialized…” error response string is duplicated across three routes.
- The “coerce the first record out of br JSON output” logic is duplicated across two routes (`show` and `priority`), differing only by the command name in the error message.

After this change, those shared behaviors will have a single source of truth in `src/lib/task-control-plane/br-runner.ts`, and the route handlers will become thinner and harder to drift.

## Progress

- [x] (2026-02-08) Introduce shared exports in `src/lib/task-control-plane/br-runner.ts` for the Beads init error message and br single-record coercion.
- [x] (2026-02-08) Update `src/app/api/task-control-plane/route.ts`, `src/app/api/task-control-plane/show/route.ts`, and `src/app/api/task-control-plane/priority/route.ts` to use the shared exports and delete local duplicates.
- [x] (2026-02-08) Run targeted unit tests for the three routes, then run `npm run test`, `npm run typecheck`, `npm run lint`.
- [ ] (2026-02-08) Move this ExecPlan to `.agent/done/` with a descriptive filename.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Put the shared helpers in `src/lib/task-control-plane/br-runner.ts` rather than creating a new module.
  Rationale: `br-runner.ts` is already the shared dependency imported by all task-control-plane routes; adding a small, focused export there avoids introducing a new “task-control-plane utils” concept/file.
  Date/Author: 2026-02-08 / Codex

## Outcomes & Retrospective

- Consolidated task-control-plane route guardrails into `src/lib/task-control-plane/br-runner.ts`:
  - `BEADS_WORKSPACE_NOT_INITIALIZED_ERROR_MESSAGE`
  - `coerceBrSingleRecord`
- Deleted duplicated `coerceSingleRecord` and inlined Beads init error strings from the task-control-plane API routes.
- Validation: `npm run test`, `npm run typecheck`, and `npm run lint` all passed.

## Context and Orientation

Relevant files:

- `src/lib/task-control-plane/br-runner.ts`: shared runner used by all task control plane routes; already exports `createTaskControlPlaneBrRunner()` and `isBeadsWorkspaceError()`.
- `src/app/api/task-control-plane/route.ts`: builds the board snapshot; returns a duplicated “Beads workspace not initialized…” error string.
- `src/app/api/task-control-plane/show/route.ts`: runs `br show <id> --json`; contains a local `coerceSingleRecord` helper and the duplicated Beads init error string.
- `src/app/api/task-control-plane/priority/route.ts`: runs `br update --priority ... --json`; contains a local `coerceSingleRecord` helper and the duplicated Beads init error string.

Existing tests:

- `tests/unit/taskControlPlaneRoute.test.ts`
- `tests/unit/taskControlPlaneShowRoute.test.ts`
- `tests/unit/taskControlPlanePriorityRoute.test.ts`

## Plan of Work

### Milestone 1: Add Shared Exports In `br-runner.ts`

At the end of this milestone, `src/lib/task-control-plane/br-runner.ts` exports:

1. `BEADS_WORKSPACE_NOT_INITIALIZED_ERROR_MESSAGE` (string)

   Exact value must remain:
   `Beads workspace not initialized for this project. Run: br init --prefix <scope>.`

2. `coerceBrSingleRecord(value: unknown, opts: { command: string; id: string }): Record<string, unknown>`

   Behavior must match the existing route-local helpers:
   - Accepts either an array (use the first element) or an object.
   - If the coerced record is missing, non-object, or an array, throw an error with the exact format:
     - For `command: "show"`: `Unexpected br show --json output for <id>.`
     - For `command: "update"`: `Unexpected br update --json output for <id>.`

Verification:

- Run `npm run test -- tests/unit/taskControlPlaneShowRoute.test.ts` and `npm run test -- tests/unit/taskControlPlanePriorityRoute.test.ts` (they should still pass before any route changes, since adding exports is non-breaking).

Commit after verification with message: `Milestone 1: Add shared task control plane br helpers`.

### Milestone 2: Migrate The API Routes To Use The Shared Exports

At the end of this milestone, the route handlers no longer define local `coerceSingleRecord` helpers and no longer embed the Beads init error string.

1. In `src/app/api/task-control-plane/show/route.ts`:
   - Delete local `coerceSingleRecord`.
   - Import and use `coerceBrSingleRecord`.
   - Import and use `BEADS_WORKSPACE_NOT_INITIALIZED_ERROR_MESSAGE` for the Beads init error response.

2. In `src/app/api/task-control-plane/priority/route.ts`:
   - Delete local `coerceSingleRecord`.
   - Import and use `coerceBrSingleRecord`.
   - Import and use `BEADS_WORKSPACE_NOT_INITIALIZED_ERROR_MESSAGE` for the Beads init error response.

3. In `src/app/api/task-control-plane/route.ts`:
   - Import and use `BEADS_WORKSPACE_NOT_INITIALIZED_ERROR_MESSAGE` for the Beads init error response.

Verification:

- Run:
  - `npm run test -- tests/unit/taskControlPlaneRoute.test.ts`
  - `npm run test -- tests/unit/taskControlPlaneShowRoute.test.ts`
  - `npm run test -- tests/unit/taskControlPlanePriorityRoute.test.ts`

Commit after verification with message: `Milestone 2: Reuse shared helpers in task control plane routes`.

### Milestone 3: Full Validation Sweep + Drift Check

1. Run:
   - `npm run test`
   - `npm run typecheck`
   - `npm run lint`

2. Drift check:
   - Run `rg -n "Beads workspace not initialized for this project" src/app/api/task-control-plane` and confirm there are no inlined copies left.
   - Run `rg -n "coerceSingleRecord" src/app/api/task-control-plane` and confirm the local helpers are gone.

Commit after verification with message: `Milestone 3: Validate task control plane helper consolidation`.

### Milestone 4: Archive The ExecPlan

Move `.agent/execplan-pending.md` to `.agent/done/execplan-consolidate-task-control-plane-route-helpers.md` (or similarly descriptive name).

Commit the done ExecPlan file if the repository convention is to track `.agent/done/*`.

## Concrete Steps

All commands should be run from the repository root:

  cd /Users/georgepickett/openclaw-studio

Suggested order:

1. Edit `src/lib/task-control-plane/br-runner.ts` to add the exports.
2. Run targeted tests:

   npm run test -- tests/unit/taskControlPlaneShowRoute.test.ts
   npm run test -- tests/unit/taskControlPlanePriorityRoute.test.ts

3. Edit the three route handlers to use the shared exports.
4. Run:

   npm run test -- tests/unit/taskControlPlaneRoute.test.ts
   npm run test -- tests/unit/taskControlPlaneShowRoute.test.ts
   npm run test -- tests/unit/taskControlPlanePriorityRoute.test.ts
   npm run test
   npm run typecheck
   npm run lint

## Validation and Acceptance

Acceptance is satisfied when:

1. `npm run test` passes.
2. `npm run typecheck` passes.
3. `npm run lint` passes.
4. The Beads init error string and br single-record coercion behavior exist in exactly one shared source (`src/lib/task-control-plane/br-runner.ts`) and are reused by the task-control-plane routes.

## Idempotence and Recovery

This is a refactor-only change; it is safe to retry. If any unit test relies on exact error message text, preserve the existing strings exactly and adjust the shared helper signature instead of adding “fallback” or alternate messages.

## Artifacts and Notes

Files expected to change:

- `src/lib/task-control-plane/br-runner.ts`
- `src/app/api/task-control-plane/route.ts`
- `src/app/api/task-control-plane/show/route.ts`
- `src/app/api/task-control-plane/priority/route.ts`
