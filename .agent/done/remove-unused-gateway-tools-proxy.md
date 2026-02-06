# Remove unused gateway tools proxy endpoint

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `/Users/georgepickett/openclaw-studio/.agent/PLANS.md`.

## Purpose / Big Picture

OpenClaw Studio currently includes an HTTP API route (`/api/gateway/tools`) intended to proxy requests to the gateway’s `/tools/invoke` endpoint. The Studio UI does not call this route, and agent file editing in the UI uses the gateway WebSocket methods `agents.files.get` / `agents.files.set` instead. Keeping an unused endpoint (plus its helper and tests) increases surface area and creates documentation drift: the architecture doc currently describes the unused flow as if it were the real one.

After this change, the unused endpoint and its helper are removed, tests are updated accordingly, and `ARCHITECTURE.md` reflects the actual agent-file IO path used by the UI. A developer can verify success by running the unit tests and ensuring the app still typechecks/lints.

## Progress

- [x] (2026-02-06 02:28Z) Created Beads issues for milestones. [bd-2cw, bd-1ld]
- [x] (2026-02-06 02:28Z) Milestone 1: Deleted the unused `/api/gateway/tools` route + `toGatewayHttpUrl` helper, and updated tests. [bd-2cw]
- [x] (2026-02-06 02:33Z) Milestone 2: Updated `ARCHITECTURE.md`, fixed verification failures, and verified via `npm test`, `npm run lint`, and `npm run typecheck`. [bd-1ld]

## Surprises & Discoveries

- Observation: `npm run typecheck` failed initially because `tsconfig.json` included `.next/types/**/*.ts`, and stale generated route validator types still referenced the deleted API route.
  Evidence: TypeScript error from `.next/types/validator.ts` importing the removed route module.

- Observation: `src/lib/studio/settings.ts` and `src/lib/studio/coordinator.ts` no longer support persisted studio `sessions`, but unit tests still asserted session normalization/patch behavior.
  Evidence: `tests/unit/studioSettings.test.ts` and `tests/unit/studioSettingsCoordinator.test.ts` failures referencing `.sessions` and `resolveStudioSessionId`.

## Decision Log

- Decision: Remove `src/app/api/gateway/tools/route.ts` and `src/lib/gateway/url.ts`, and update docs/tests accordingly.
  Rationale: The route has no in-repo callers, the helper is only used by the unused route, and the current docs describe a flow that the UI does not use. Deleting the unused path reduces conceptual surface area and removes a misleading “two ways to edit agent files” story.
  Date/Author: 2026-02-06 (Codex).

## Outcomes & Retrospective

Removed the unused gateway tools proxy endpoint and aligned docs/tests with actual runtime behavior.

Deleted:

- `src/app/api/gateway/tools/route.ts`
- `src/lib/gateway/url.ts`
- `tests/unit/toolsInvokeUrl.test.ts`

Updated:

- `tests/unit/studioSettings.test.ts` (removed URL conversion coverage and removed stale studio sessions expectations)
- `tests/unit/studioSettingsCoordinator.test.ts` (removed stale studio sessions patch coverage)
- `ARCHITECTURE.md` (agent file edits documented as WS `agents.files.get`/`agents.files.set`, removed `/api/gateway/tools` + `/tools/invoke` references)
- `tsconfig.json` (excluded `.next` from `tsc --noEmit` to avoid stale generated typecheck failures)

Verification:

- `npm test`
- `npm run lint`
- `npm run typecheck`

## Context and Orientation

Agent file edits in the Studio UI are performed over the gateway WebSocket using:

- `/Users/georgepickett/openclaw-studio/src/features/agents/state/useAgentFilesEditor.ts` (calls `agents.files.get` and `agents.files.set` via `GatewayClient.call`).

However, the repository also includes an HTTP API route that proxies to gateway HTTP `/tools/invoke`:

- `/Users/georgepickett/openclaw-studio/src/app/api/gateway/tools/route.ts`
- `/Users/georgepickett/openclaw-studio/src/lib/gateway/url.ts` (`toGatewayHttpUrl`)

There are no call sites for `/api/gateway/tools` in `src/` or `tests/`. The only usage of `toGatewayHttpUrl` is the unused route and unit tests.

`/Users/georgepickett/openclaw-studio/ARCHITECTURE.md` currently documents agent file edits as going through `/api/gateway/tools` and `/tools/invoke`, which is not how the UI currently works.

## Plan of Work

First, create Beads issues for the milestones (if Beads is initialized) to track the work locally.

Second, delete the unused API route and its helper, and remove or update any tests that only exist to cover those modules.

Third, update `ARCHITECTURE.md` to accurately describe agent file IO as using `agents.files.get` / `agents.files.set` over WebSocket, and remove references to `/api/gateway/tools` and `/tools/invoke` as the Studio mechanism for agent files.

Finally, run unit tests, lint, and typecheck. If everything passes, commit and then move this ExecPlan to `.agent/done/` with a descriptive filename.

## Concrete Steps

1. (Optional, if Beads is in use) Create Beads issues for milestones.

   Example (replace with real IDs):

     br create "Milestone 1: Remove unused gateway tools proxy" --type task --priority 2 --description "Delete /api/gateway/tools route + toGatewayHttpUrl helper and adjust unit tests."
     br create "Milestone 2: Update architecture docs + verify" --type task --priority 2 --description "Update ARCHITECTURE.md to reflect agents.files.get/set WS flow; run npm test/lint/typecheck; commit."
     br dep add <milestone-2-id> <milestone-1-id>

2. Confirm there are no in-repo call sites for the route:

     rg -n "/api/gateway/tools" -S src tests

   Expect no matches.

3. Delete the unused API route:

   - Delete `/Users/georgepickett/openclaw-studio/src/app/api/gateway/tools/route.ts`

4. Delete the helper that only exists for the removed route:

   - Delete `/Users/georgepickett/openclaw-studio/src/lib/gateway/url.ts`

5. Remove/update unit tests that only exist for the deleted helper:

   - Delete `/Users/georgepickett/openclaw-studio/tests/unit/toolsInvokeUrl.test.ts`
   - In `/Users/georgepickett/openclaw-studio/tests/unit/studioSettings.test.ts`, remove the `toGatewayHttpUrl` import and the `describe("gateway url conversion", ...)` block.

6. Update `ARCHITECTURE.md` to match reality:

   - Replace references to `/Users/georgepickett/openclaw-studio/src/app/api/gateway/tools/route.ts` with the actual agent file editor path `/Users/georgepickett/openclaw-studio/src/features/agents/state/useAgentFilesEditor.ts`.
   - Replace the “Agent file edits call `/api/gateway/tools`” flow with “Agent file edits call `agents.files.get` / `agents.files.set` over WebSocket via `GatewayClient`”.
   - Remove references to `/tools/invoke` tool allowlists as the Studio mechanism for agent file edits.

7. Run verification from the repo root:

     npm test
     npm run lint
     npm run typecheck

   All commands must succeed.

8. Commit with a message like:

     git commit -am "Remove unused gateway tools proxy"

   If `ARCHITECTURE.md` changes are the only unstaged changes at this point, include them in the commit as well.

9. If using Beads, close issues and flush local state:

     br close <milestone-1-id> --reason "Tests pass, committed"
     br close <milestone-2-id> --reason "Docs updated, tests pass, committed"
     br sync --flush-only

10. Move this ExecPlan to done:

   - Rename to `.agent/done/remove-unused-gateway-tools-proxy.md`

## Validation and Acceptance

Acceptance is met when:

1. `/Users/georgepickett/openclaw-studio/src/app/api/gateway/tools/route.ts` and `/Users/georgepickett/openclaw-studio/src/lib/gateway/url.ts` no longer exist.
2. `ARCHITECTURE.md` no longer claims agent file edits go through `/api/gateway/tools` or `/tools/invoke`, and instead documents the WS method flow used by the UI.
3. `npm test`, `npm run lint`, and `npm run typecheck` all pass.

## Idempotence and Recovery

This change is safe to repeat because it only removes unused code and updates docs/tests. If removal turns out to break a real external dependency on `/api/gateway/tools`, the rollback is to restore the deleted route and helper from git history and revert the documentation changes in `ARCHITECTURE.md`.

## Interfaces and Dependencies

No public UI component props should change. The agent file editor is expected to continue using gateway WebSocket methods `agents.files.get` and `agents.files.set` via `GatewayClient.call`, as implemented in `/Users/georgepickett/openclaw-studio/src/features/agents/state/useAgentFilesEditor.ts`.
