# Add Agent-Scoped Cron Job Controls In Settings (List, Run Now, Delete)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `.agent/PLANS.md` from the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, when an agent is selected and the settings sidebar is opened, the user can see that agent’s cron jobs in a dedicated section directly below `New session`. Each cron row exposes two actions: a play action to run the job immediately and a trash action to delete the job entirely. The play action must trigger an immediate run (`cron.run` force mode), and the trash action must disable while the request is in flight and remove the job from the list once deletion succeeds.

The behavior is observable end-to-end in one UI flow: open settings for an agent that has cron jobs, verify the list, hover a row to reveal actions, click play and observe immediate execution, click trash and observe disabled state followed by row removal.

## Progress

- [x] (2026-02-04 21:43Z) Read `.agent/PLANS.md`, `.agent/README.md`, `README.md`, and `ARCHITECTURE.md`; mapped current cron flow in `src/app/page.tsx` and `src/app/api/cron/route.ts`.
- [x] (2026-02-04 21:43Z) Verified OpenClaw gateway cron APIs and payload shapes from `~/openclaw/src/gateway/server-methods/cron.ts` and related cron service files.
- [x] (2026-02-04 21:49Z) Implemented Milestone 1 test-first: added `tests/unit/cronGatewayClient.test.ts` and `tests/unit/cronSelectors.test.ts`, then implemented `src/lib/cron/gateway.ts`, `src/lib/cron/selectors.ts`, and gateway-aligned `src/lib/cron/types.ts`.
- [x] (2026-02-04 21:50Z) Implemented Milestone 2 test-first: extended `tests/unit/agentSettingsPanel.test.ts` for cron UI behavior and implemented the `Cron jobs` section with per-row play/trash controls in `src/features/agents/components/AgentSettingsPanel.tsx`.
- [x] (2026-02-04 21:53Z) Implemented Milestone 3: wired settings cron load/run/delete orchestration in `src/app/page.tsx`, migrated latest cron summary reads to gateway cron helpers, and removed obsolete local cron path files (`src/lib/cron/client.ts`, `src/app/api/cron/route.ts`).
- [x] (2026-02-04 21:54Z) Implemented Milestone 4: updated `README.md` and `ARCHITECTURE.md`; validated with targeted tests, full unit suite, lint, and typecheck.

## Surprises & Discoveries

- Observation: Studio currently reads cron jobs from a local API route (`GET /api/cron`) that parses a local filesystem file.
  Evidence: `src/app/api/cron/route.ts` reads `path.join(resolveStateDir(), "cron", "jobs.json")`; `src/app/page.tsx` uses `fetchCronJobs()` from `src/lib/cron/client.ts`.

- Observation: OpenClaw already exposes gateway RPC methods for listing, running now, and removing cron jobs.
  Evidence: `~/openclaw/src/gateway/server-methods/cron.ts` implements `cron.list`, `cron.run`, and `cron.remove`; CLI wiring in `~/openclaw/src/cli/cron-cli/register.cron-simple.ts` uses those same methods.

- Observation: Current Studio cron schedule type for one-shot jobs uses `{ kind: "at"; atMs: number }`, but OpenClaw cron service uses `{ kind: "at"; at: string }`.
  Evidence: `src/lib/cron/types.ts` vs `~/openclaw/src/cron/types.ts`.

- Observation: The remote path supplied by the user (`/home/ubuntu/.openclaw/cron/jobs.json`) is not present in this local worktree environment, so local file mutation cannot be validated as the canonical behavior for remote gateways.
  Evidence: local shell check returned no file at `/home/ubuntu/.openclaw/cron/jobs.json`.

- Observation: This worktree did not have dependencies installed initially, so the first test invocation failed before code-level assertions ran.
  Evidence: `npm run test -- tests/unit/cronGatewayClient.test.ts tests/unit/cronSelectors.test.ts` returned `sh: vitest: command not found`; running `npm install` resolved it.

- Observation: Moving to gateway-only cron removed all runtime references to the local cron API route.
  Evidence: after implementation, `rg -n "fetchCronJobs|/api/cron|lib/cron/client"` only matched docs before doc updates; no source references remained.

## Decision Log

- Decision: Use gateway RPC (`cron.list`, `cron.run`, `cron.remove`) as the execution path for list/run/delete instead of direct `jobs.json` mutation.
  Rationale: Gateway RPC is the source-of-truth API and works for both local and remote gateways, while direct file access only affects the Studio host.
  Date/Author: 2026-02-04 / Codex

- Decision: Implement the play action with `cron.run` and `mode: "force"`.
  Rationale: The user asked to trigger the cron job immediately, and force mode bypasses due-time gating.
  Date/Author: 2026-02-04 / Codex

- Decision: Scope the settings cron list to jobs whose `agentId` equals the selected agent id.
  Rationale: The requested behavior is “cron jobs for specific agents” in the selected-agent settings panel.
  Date/Author: 2026-02-04 / Codex

- Decision: Keep action buttons hidden until hover/focus on desktop rows, but preserve keyboard accessibility and in-flight disabled semantics for both actions.
  Rationale: Meets UX requirement (hover play/trash) without sacrificing accessibility or duplicate-click safety.
  Date/Author: 2026-02-04 / Codex

- Decision: Remove the local cron API route and client wrapper once page orchestration migrated to gateway helpers.
  Rationale: Keeping both paths would increase drift risk and violate the gateway-first source-of-truth model.
  Date/Author: 2026-02-04 / Codex

## Outcomes & Retrospective

Implementation is complete. Agent settings now include an agent-scoped cron section with run-now and delete controls, and all cron reads/actions route through gateway methods (`cron.list`, `cron.run`, `cron.remove`) instead of local file APIs. The latest-update cron summary path now reuses gateway cron data.

Validation completed successfully:

- `npm run test -- tests/unit/cronGatewayClient.test.ts tests/unit/cronSelectors.test.ts`
- `npm run test -- tests/unit/agentSettingsPanel.test.ts`
- `npm run test` (full suite; 33 files / 129 tests passed)
- `npm run lint`
- `npm run typecheck`

Manual UI validation against a live gateway was not executed in this environment.

## Context and Orientation

OpenClaw Studio is a gateway-first Next.js app where runtime actions should flow through gateway methods, not local config files. The selected-agent settings sidebar is rendered by `src/features/agents/components/AgentSettingsPanel.tsx` and wired from `src/app/page.tsx`.

Current cron behavior in Studio is limited to summary display in chat preview logic: when a user message is classified as cron-related, `src/app/page.tsx` fetches jobs through `src/lib/cron/client.ts`, which calls `GET /api/cron`. That route (`src/app/api/cron/route.ts`) reads `~/.openclaw/cron/jobs.json` on the Studio host.

For this feature, we need per-agent list/run/delete controls in settings. OpenClaw gateway already supports this via:

- `cron.list` (returns jobs)
- `cron.run` (supports `mode: "force"`)
- `cron.remove` (deletes job)

Those methods are implemented in `~/openclaw/src/gateway/server-methods/cron.ts` and are therefore the stable integration point from Studio’s existing `GatewayClient` in `src/lib/gateway/GatewayClient.ts`.

Key files to touch in this plan:

- `src/lib/cron/types.ts`
- `src/lib/cron/client.ts` (likely replaced or narrowed)
- `src/lib/cron/` (new gateway helpers/selectors)
- `src/app/page.tsx`
- `src/features/agents/components/AgentSettingsPanel.tsx`
- `tests/unit/agentSettingsPanel.test.ts`
- `tests/unit/*` (new cron helper tests)
- `ARCHITECTURE.md`
- `README.md` (if user-facing cron settings behavior is documented there)

Beads note: `.beads/` is not present in this worktree, so no Beads issue creation is included.

## Plan of Work

### Milestone 1: Add gateway cron helpers and align cron types

Write failing unit tests first for a new gateway cron helper module. Then implement a typed client layer that calls `GatewayClient.call` with:

- `cron.list` (with `includeDisabled: true`)
- `cron.run` (with `{ id, mode: "force" }`)
- `cron.remove` (with `{ id }`)

Move agent-scoping and latest-job selection into testable pure selectors under `src/lib/cron/` so `src/app/page.tsx` no longer contains ad hoc cron filtering logic.

Update `src/lib/cron/types.ts` to match gateway schedule shape (`at` ISO string) and include fields needed by settings list rendering (`sessionTarget`, `wakeMode`, and `state` metadata).

### Milestone 2: Add cron jobs section to AgentSettingsPanel

Write failing component tests first, then extend `AgentSettingsPanel` to render a `Cron jobs` section directly below the existing `Session` section.

Each cron row should include:

- job name
- schedule summary
- payload preview
- disabled/enabled indicator if useful

On row hover/focus, render two icon buttons:

- play button: run now
- trash button: delete job

Both actions must support in-flight disabled state keyed by job id. Delete button must become disabled immediately when clicked and remain disabled until the request completes.

### Milestone 3: Wire settings cron state and actions in page.tsx

Write failing tests first for any new extracted selectors/helpers that support this milestone, then wire runtime behavior in `src/app/page.tsx`.

Add settings-scoped cron UI state (jobs, loading, error, busy action ids) and fetch jobs when settings opens for an agent. Filter jobs to selected `agentId` and pass them into `AgentSettingsPanel`.

Implement handlers:

- run now: call gateway `cron.run` force, then reload that agent’s jobs so one-shot/deleted-after-run jobs reflect current state.
- delete: disable action, call gateway `cron.remove`, remove job from local list on success, and reconcile with a follow-up refresh.

Also migrate existing cron summary retrieval in `updateSpecialLatestUpdate` to use the same gateway cron list helper so cron data comes from one source. Remove obsolete local cron route/client code if no longer referenced.

### Milestone 4: Validation and docs

Run targeted tests, full unit suite, lint, and typecheck. Then manually validate the settings flow with a connected gateway and at least one cron job attached to the selected agent.

Update docs to reflect that cron management in Studio settings is gateway-backed and agent-scoped.

## Concrete Steps

Run all commands from:
`/Users/georgepickett/.codex/worktrees/9101/openclaw-studio`

1. Create failing tests for Milestone 1.

    npm run test -- tests/unit/cronGatewayClient.test.ts tests/unit/cronSelectors.test.ts

   Add test cases:

   - `lists_jobs_via_cron_list_include_disabled_true`
   - `runs_job_now_with_force_mode`
   - `removes_job_by_id`
   - `filters_jobs_to_selected_agent`
   - `resolves_latest_agent_job_by_updated_at`

2. Implement Milestone 1 helpers and type updates.

   Edit/create:

   - `src/lib/cron/types.ts`
   - `src/lib/cron/gateway.ts` (new)
   - `src/lib/cron/selectors.ts` (new)

   Re-run Milestone 1 tests until passing.

3. Create failing tests for Milestone 2.

    npm run test -- tests/unit/agentSettingsPanel.test.ts

   Add test cases:

   - `renders_cron_jobs_section_below_session`
   - `invokes_run_now_and_disables_play_while_pending`
   - `invokes_delete_and_disables_trash_while_pending`
   - `shows_empty_cron_state_when_agent_has_no_jobs`

4. Implement Milestone 2 settings panel UI.

   Edit:

   - `src/features/agents/components/AgentSettingsPanel.tsx`

   Re-run panel tests.

5. Create failing tests for Milestone 3 helper behavior.

    npm run test -- tests/unit/cronSelectors.test.ts tests/unit/agentSettingsPanel.test.ts

   Add/extend tests for any new helper used by `src/app/page.tsx` (for example, sorting rules or per-agent list reconciliation after delete/run).

6. Implement Milestone 3 runtime wiring.

   Edit:

   - `src/app/page.tsx`
   - `src/lib/cron/client.ts` (remove or repurpose)
   - `src/app/api/cron/route.ts` (remove if unused)

   Re-run targeted tests.

7. Run full verification.

    npm run test
    npm run lint
    npm run typecheck

8. Manual behavior validation.

    npm run dev

   In the browser:

   - Connect to gateway.
   - Select an agent with cron jobs.
   - Open settings and verify cron list appears below `New session`.
   - Hover a row, click play, confirm immediate run behavior.
   - Click trash, confirm button disables and row is removed after success.

9. Update docs.

   Edit:

   - `ARCHITECTURE.md`
   - `README.md` (if cron settings behavior is user-facing there)

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first: `tests/unit/cronGatewayClient.test.ts`, `tests/unit/cronSelectors.test.ts` with the named test cases above.
2. Implementation: add gateway cron helper and selectors plus type alignment.
3. Verification: `npm run test -- tests/unit/cronGatewayClient.test.ts tests/unit/cronSelectors.test.ts` passes.
4. Commit: `Milestone 1: add gateway cron helpers and selectors`.

Milestone 2 verification workflow:

1. Tests to write first: extend `tests/unit/agentSettingsPanel.test.ts` with cron section/action cases.
2. Implementation: render cron section below session with hover actions and disabled states.
3. Verification: `npm run test -- tests/unit/agentSettingsPanel.test.ts` passes.
4. Commit: `Milestone 2: add cron jobs UI section with run/delete controls`.

Milestone 3 verification workflow:

1. Tests to write first: helper-focused tests that cover agent scoping/reconciliation used by page orchestration.
2. Implementation: wire load/run/delete in `src/app/page.tsx`, migrate cron summary reads to gateway helper, remove obsolete local cron fetch path if unused.
3. Verification: targeted tests pass, then `npm run test` passes.
4. Commit: `Milestone 3: wire agent-scoped cron run/delete orchestration`.

Milestone 4 verification workflow:

1. Tests to write first: none required if docs-only.
2. Implementation: documentation updates and final cleanup.
3. Verification: `npm run lint` and `npm run typecheck` pass.
4. Commit: `Milestone 4: document agent-scoped cron settings flow`.

Behavioral acceptance criteria:

- In agent settings, a `Cron jobs` section appears below the `Session` section.
- The section lists cron jobs for the selected agent.
- Hovering/focusing a cron row reveals play and trash actions.
- Clicking play triggers immediate gateway cron execution (`cron.run` force mode).
- Clicking trash disables the trash action while in flight and removes the job from UI after successful delete.
- Deletion is persisted by gateway cron store behavior (equivalent to removing the entry from cron store on gateway host).
- Existing latest-update cron summary behavior continues to function with gateway-backed data.

## Idempotence and Recovery

This implementation is safe to iterate on because UI rendering and gateway method wrappers are additive and testable.

Runtime risk exists only for real cron actions during manual testing:

- `run now` executes real cron payloads.
- `delete` removes real cron jobs.

For safe retries, use a disposable test cron job and/or a non-production state directory when validating behavior. If a delete is accidental, recovery is by recreating the cron job via existing OpenClaw cron add flow.

If code changes fail partway, revert only the touched files for the current milestone and rerun that milestone’s targeted tests before proceeding.

## Artifacts and Notes

Expected gateway calls from Studio after implementation:

    client.call("cron.list", { includeDisabled: true })
    client.call("cron.run", { id: "<job-id>", mode: "force" })
    client.call("cron.remove", { id: "<job-id>" })

Expected targeted test output pattern:

    npm run test -- tests/unit/cronGatewayClient.test.ts tests/unit/agentSettingsPanel.test.ts
    ✓ cronGatewayClient > runs_job_now_with_force_mode
    ✓ AgentSettingsPanel > invokes_delete_and_disables_trash_while_pending

Manual acceptance notes to capture during implementation:

- Screenshot or short transcript showing cron row hover with play/trash.
- Evidence that a deleted row disappears without page reload.
- Evidence that run-now triggers immediate gateway-side run effect.

## Interfaces and Dependencies

No new third-party dependencies are required.

Planned interface additions:

- `src/lib/cron/types.ts` should model gateway cron job shape, including:

  - schedule `at` string support
  - `sessionTarget`
  - `wakeMode`
  - `state` metadata fields used for display/sorting

- `src/lib/cron/gateway.ts` (new) should export typed helpers:

  - `listCronJobs(client: GatewayClient, opts?: { includeDisabled?: boolean }): Promise<{ jobs: CronJobSummary[] }>`
  - `runCronJobNow(client: GatewayClient, id: string): Promise<{ ok: boolean; ran?: boolean }>`
  - `removeCronJob(client: GatewayClient, id: string): Promise<{ ok: boolean; removed: boolean }>`

- `src/lib/cron/selectors.ts` (new) should export pure helpers:

  - `filterCronJobsForAgent(jobs: CronJobSummary[], agentId: string): CronJobSummary[]`
  - `resolveLatestCronJobForAgent(jobs: CronJobSummary[], agentId: string): CronJobSummary | null`

- `src/features/agents/components/AgentSettingsPanel.tsx` props should gain cron-specific inputs/callbacks (jobs list, loading/error state, run/delete handlers, and per-job action busy state) and remain presentational.

- `src/app/page.tsx` should own orchestration state for cron loading and action in-flight tracking for the currently opened settings agent.

Plan revision note (2026-02-04): Initial ExecPlan created from current Studio code plus direct OpenClaw gateway cron API inspection. Chose gateway RPC over local cron file mutation to preserve remote-gateway correctness and align with architecture.
Plan revision note (2026-02-04): Completed all milestones, recorded final validation evidence, and captured the removal of the local cron API path in favor of gateway-only cron orchestration.
