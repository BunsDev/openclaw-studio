# Build Read-Only Beads Kanban MVP (Decision-Ready)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is governed by `.agent/PLANS.md` in the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this work, OpenClaw Studio will include a simple read-only Kanban board that looks and behaves like a Trello-style status board for Beads tasks. Operators will be able to open one page and see tasks grouped by status (`Ready`, `In Progress`, `Blocked`) with consistent card fields. Cards that require operator intervention will be explicitly marked as `Decision Needed` using an explicit Beads label instead of the current broad and noisy “needs attention” concept.

This is an MVP, so no writes are allowed from the board: no claim, close, assign, edit, drag-and-drop, or status mutation. The board is for visibility only.

## Progress

- [x] (2026-02-05 00:28Z) Collected real `br --json` command/output shapes for `ready`, `blocked`, `list --status open`, and `list --status in_progress` in a throwaway workspace and the primary repo Beads workspace.
- [x] (2026-02-05 00:30Z) Confirmed current Studio “needs attention” implementation is activity/error driven and does not reliably represent explicit decision-required state.
- [x] (2026-02-05 00:27Z) Created and linked milestone Beads issues for execution (`studio-1pv`, `studio-1q7`, `studio-33w`) and closed all three after verification.
- [x] (2026-02-05 00:30Z) Implemented server read-model pipeline (`src/lib/task-control-plane/br.server.ts`, `src/lib/task-control-plane/read-model.ts`) plus API route (`src/app/api/task-control-plane/route.ts`). [studio-1pv]
- [x] (2026-02-05 00:31Z) Implemented read-only Kanban page and columns at `/control-plane` (`src/app/control-plane/page.tsx`, `src/features/task-control-plane/components/TaskBoard.tsx`, `src/features/task-control-plane/components/TaskColumn.tsx`). [studio-1q7]
- [x] (2026-02-05 00:31Z) Added tests and completed full validation (`npm run lint`, `npm run typecheck`, `npm run test`) with all passing, including new task-control-plane unit coverage. [studio-33w]

## Surprises & Discoveries

- Observation: `br ready --json` can include `in_progress` items (for example when claimed by the current actor), so using `ready` output alone is not sufficient to define Kanban columns.
  Evidence: In a temporary Beads workspace, claiming an issue with `br update <id> --claim --json` moved it to `status: "in_progress"`, and `br ready --json` still returned that issue.

- Observation: `br blocked --json` returns open issues with explicit blocker metadata (`blocked_by`, `blocked_by_count`) but the issue status remains `open`, not `blocked`.
  Evidence: Existing repo Beads output includes blocked items with `status: "open"` plus `blocked_by` fields.

- Observation: Current Studio “needs attention” behavior is not equivalent to “decision needed.”
  Evidence: `awaitingUserInput` is not populated by runtime flows; existing attention UI is effectively “error or unseen activity.”

- Observation: This repository’s Vitest include pattern is `tests/unit/**/*.test.ts`, so `.test.tsx` files are not discovered.
  Evidence: Initial board test at `tests/unit/taskControlPlaneBoard.test.tsx` was skipped with “No test files found,” then passed after renaming to `.test.ts`.

## Decision Log

- Decision: The MVP Kanban will group tasks into `Ready`, `In Progress`, and `Blocked` columns computed from Beads JSON read models, not from existing Studio agent attention flags.
  Rationale: This aligns with Beads lifecycle semantics and avoids coupling board correctness to current chat activity heuristics.
  Date/Author: 2026-02-05 / Codex

- Decision: `Decision Needed` will be represented by an explicit Beads label (`decision-needed`) shown as a badge on cards, not inferred from generic activity.
  Rationale: Explicit labeling is deterministic, scales to many agents, and is directly compatible with a future unified decision inbox.
  Date/Author: 2026-02-05 / Codex

- Decision: Keep the MVP fully read-only with no board-triggered writes.
  Rationale: The user asked for simple status visibility first; this reduces scope and integration risk while still delivering value.
  Date/Author: 2026-02-05 / Codex

- Decision: Implement the board as a dedicated route (`/control-plane`) and feature slice rather than modifying the existing focused fleet screen in this milestone.
  Rationale: This isolates MVP risk and keeps the current operator workflow stable.
  Date/Author: 2026-02-05 / Codex

## Outcomes & Retrospective

Shipped outcome: OpenClaw Studio now includes a read-only control-plane board at `/control-plane` that renders Beads tasks in `Ready`, `In Progress`, and `Blocked` columns using Beads CLI JSON reads only. Cards display status metadata and a `Decision Needed` badge when `decision-needed` is present in labels. The board has no mutation controls, matching the MVP scope.

Validation outcome: all repository checks required by this plan passed after implementation (`lint`, `typecheck`, full `test`), and new unit tests for read-model mapping, CLI runner behavior, route handling, and board rendering are green.

Remaining gap: unified inbox behavior is still future work. This MVP intentionally stops at deterministic read-only visibility and explicit decision markers.

## Context and Orientation

This repository is a Next.js App Router app. Existing UI and gateway logic live under `src/features/agents` and `src/lib/gateway`, but task control plane work should remain isolated in a new feature area.

Relevant files and modules:

- `.agent/PLANS.md`: rules for this ExecPlan format and implementation workflow.
- `.agent/done/task-control-plane-spec.md`: source design for local-first Beads control plane and read-only UI direction.
- `src/app/api/studio/route.ts`: example Node route error-handling style (`{ error }` JSON + logger).
- `src/lib/fs.server.ts`: example server utility pattern for command execution and actionable errors.
- `src/lib/http.ts`: standard `fetchJson` helper used by client pages.
- `tests/unit/*.test.ts`: Vitest conventions and naming style.

Definitions used in this plan:

- Beads (`br`): local-first issue tracker CLI used by agents and operators.
- Read model: a derived, normalized JSON snapshot assembled from one or more raw command outputs.
- Decision-needed card: a task card containing label `decision-needed`; this is a forward-compatible marker for the future decision inbox.

## Plan of Work

Milestone 1 establishes a stable server-side read model from `br --json` commands. Create a Node-only runner that executes Beads commands, parses JSON, and raises actionable errors (for missing `.beads`, command failure, or malformed JSON). Build a pure mapper that merges outputs into three board columns.

Column derivation logic for MVP:

- `In Progress`: from `br list --json --status in_progress --limit 0`.
- `Blocked`: from `br blocked --json --limit 0`.
- `Ready`: from `br list --json --status open --limit 0`, excluding any IDs present in `Blocked`.

This avoids ambiguity in `br ready` output and gives deterministic column membership.

Milestone 2 exposes this snapshot through `GET /api/task-control-plane` and creates a new page at `/control-plane` that renders Trello-like columns and cards. Cards show stable metadata (ID, title, priority, updated time, assignee if present, labels) and render a `Decision Needed` badge when label `decision-needed` exists. No write controls are rendered.

Milestone 3 adds tests and validates behavior end-to-end for this MVP. Tests are written first (failing), implementation is completed, then tests pass. Final validation confirms UI readability and route-level failure behavior.

## Concrete Steps

Run all commands from repo root:

    cd /Users/georgepickett/.codex/worktrees/7c6c/openclaw-studio

Create milestone Beads issues for this ExecPlan (if this worktree scope is initialized for Beads; otherwise initialize first):

    br where --json
    br init --prefix studio
    br create "Milestone 1: Build Beads read model for Kanban" --type task --priority 1 --description "Server runner + mapping for ready/in_progress/blocked columns" --json
    br create "Milestone 2: Add read-only control-plane Kanban page" --type task --priority 1 --description "Render Trello-style columns with decision-needed badge" --json
    br create "Milestone 3: Add tests and validate MVP" --type task --priority 2 --description "Test-first read-model coverage and route/UI validation" --json
    br dep add <milestone2_id> <milestone1_id>
    br dep add <milestone3_id> <milestone2_id>

Implement milestone 1 files:

- `src/lib/task-control-plane/br.server.ts`
- `src/lib/task-control-plane/read-model.ts`
- `tests/unit/taskControlPlaneReadModel.test.ts`

Implement milestone 2 files:

- `src/app/api/task-control-plane/route.ts`
- `src/features/task-control-plane/components/TaskBoard.tsx`
- `src/features/task-control-plane/components/TaskColumn.tsx`
- `src/app/control-plane/page.tsx`

Implement milestone 3 tests and validation:

- `tests/unit/taskControlPlaneBrRunner.test.ts` (if runner logic is non-trivial and mockable)
- `tests/unit/taskControlPlaneReadModel.test.ts` (expanded fixtures)
- Optional: `tests/e2e/task-control-plane.spec.ts` with route mocking if stable in CI

Run targeted and full validation:

    npm run test -- tests/unit/taskControlPlaneReadModel.test.ts
    npm run test -- tests/unit/taskControlPlaneBrRunner.test.ts
    npm run lint
    npm run typecheck
    npm run test

Run the app and manually verify the board:

    npm run dev

Then open `http://localhost:3000/control-plane` and verify columns/cards match current Beads state.

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first (must fail before implementation):
   - `tests/unit/taskControlPlaneReadModel.test.ts`
   - Test cases:
     - `buildReadModel_returnsEmptyColumnsWhenNoTasks`
     - `buildReadModel_partitionsOpenBlockedAndInProgress`
     - `buildReadModel_marksDecisionNeededFromLabel`
     - `buildReadModel_handlesMissingOptionalFields`
2. Implementation:
   - Add `br` runner and pure mapper.
3. Verification:
   - Run `npm run test -- tests/unit/taskControlPlaneReadModel.test.ts` and ensure all new tests pass.
4. Commit:
   - Commit with message `Milestone 1: Build task control plane read model`.

Milestone 2 verification workflow:

1. Tests to write first (must fail before implementation):
   - Add or expand component/API tests as practical for board rendering and API error shape.
   - Assertions:
     - API returns `{ snapshot }` on success.
     - API returns `{ error }` with non-200 status on command failure.
     - Board renders three columns and card counts from fixture snapshot.
     - Decision-needed cards display a visible `Decision Needed` badge.
2. Implementation:
   - Add API route and read-only board UI page/components.
3. Verification:
   - Run targeted tests, then `npm run typecheck`.
4. Commit:
   - Commit with message `Milestone 2: Add read-only control-plane Kanban page`.

Milestone 3 verification workflow:

1. Tests to write first (must fail before implementation):
   - Add remaining regression tests for malformed JSON, missing Beads workspace, and empty states.
2. Implementation:
   - Improve error handling and empty-state UX messages.
3. Verification:
   - Run `npm run lint`, `npm run typecheck`, and `npm run test`.
   - Run app and manually confirm `/control-plane` behavior with current local Beads data.
4. Commit:
   - Commit with message `Milestone 3: Validate control-plane MVP and harden errors`.

MVP acceptance criteria:

- `/control-plane` exists and renders a read-only Kanban with `Ready`, `In Progress`, and `Blocked` columns.
- Cards display Beads task ID, title, and status-derived column membership.
- Cards with label `decision-needed` show a `Decision Needed` badge.
- No board action mutates Beads state.
- API and UI show actionable errors when `.beads` is missing or `br` fails.

## Idempotence and Recovery

The read-model and UI changes are additive and safe to rerun. If Beads is not initialized in the active scope, the API route should return a clear error and the UI should show setup guidance instead of crashing.

If a command-output assumption proves incorrect, capture one raw payload sample in test fixtures, adjust the mapper, and rerun tests. Do not add fallback write paths or direct SQLite reads.

If a milestone fails halfway, rerun targeted tests after each fix; only proceed when the milestone verification command set passes.

## Artifacts and Notes

Execution evidence:

- Beads milestone status:

    br status --json
    {
      "summary": {
        "total_issues": 3,
        "open_issues": 0,
        "in_progress_issues": 0,
        "closed_issues": 3
      }
    }

- Targeted new tests:

    npm run test -- tests/unit/taskControlPlaneReadModel.test.ts tests/unit/taskControlPlaneBrRunner.test.ts tests/unit/taskControlPlaneBoard.test.ts tests/unit/taskControlPlaneRoute.test.ts
    Test Files 4 passed, Tests 12 passed

- Full project validation:

    npm run lint
    npm run typecheck
    npm run test
    Test Files 37 passed, Tests 148 passed

## Interfaces and Dependencies

Implement these interfaces:

- In `src/lib/task-control-plane/read-model.ts`:

    export type TaskControlPlaneColumn = "ready" | "in_progress" | "blocked";

    export type TaskControlPlaneCard = {
      id: string;
      title: string;
      column: TaskControlPlaneColumn;
      status: string;
      priority: number | null;
      updatedAt: string | null;
      assignee: string | null;
      labels: string[];
      decisionNeeded: boolean;
      blockedBy: string[];
    };

    export type TaskControlPlaneSnapshot = {
      generatedAt: string;
      scopePath: string | null;
      columns: {
        ready: TaskControlPlaneCard[];
        inProgress: TaskControlPlaneCard[];
        blocked: TaskControlPlaneCard[];
      };
      warnings: string[];
    };

    export function buildTaskControlPlaneSnapshot(input: {
      openIssues: unknown;
      inProgressIssues: unknown;
      blockedIssues: unknown;
      scopePath?: string | null;
    }): TaskControlPlaneSnapshot;

- In `src/lib/task-control-plane/br.server.ts`:

    export async function loadTaskControlPlaneRawData(options?: {
      cwd?: string;
    }): Promise<{
      scopePath: string | null;
      openIssues: unknown;
      inProgressIssues: unknown;
      blockedIssues: unknown;
    }>;

Dependencies and constraints:

- Use Beads CLI only (`br ... --json`); do not read `.beads` SQLite directly.
- Use Node runtime route handlers (`export const runtime = "nodejs"`).
- Use existing logger and HTTP error style conventions.
- Keep `.beads/` local-only and never stage/commit Beads artifacts.

Plan Change Note (2026-02-05): Created this pending ExecPlan from the task control-plane spec and incorporated updated product direction that “needs attention” should evolve toward explicit “decision needed” signaling. The MVP now uses deterministic status columns plus a `decision-needed` label badge as the bridge to a future unified inbox.
Plan Change Note (2026-02-05): Marked all milestones complete with Beads IDs, recorded final validation evidence, and finalized retrospective after shipping `/control-plane` read-only Kanban MVP.
