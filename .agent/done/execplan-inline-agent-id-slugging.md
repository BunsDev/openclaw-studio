# Consolidate Agent Naming Helpers Into `agentConfig`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `.agent/PLANS.md` in this repository.

## Purpose / Big Picture

Agent id generation currently depends on a tiny shared helper module (`src/lib/ids/slugify.ts`), and the repo also contains a dead `src/lib/names/agentNames.ts` helper that is not used anywhere. Both increase conceptual surface area for little or no payoff.

After this change, agent id slugging is owned directly by the gateway config mutation boundary (`src/lib/gateway/agentConfig.ts`), the dead `agentNames.ts` helper is removed, and unit tests continue to prove the same behaviors (including the “empty slug” error case).

You can see it working by running the normal gates (`npm run lint`, `npm run test`, `npm run typecheck`, `npm run build`) and by verifying there are no remaining imports of `@/lib/ids/slugify` or `@/lib/names/agentNames`.

## Progress

- [x] (2026-02-06 17:56Z) Add/adjust unit tests to cover agent id slugging and the “empty slug” error through `createGatewayAgent`.
- [x] (2026-02-06 17:56Z) Inline `slugifyName` into `src/lib/gateway/agentConfig.ts`, remove `src/lib/ids/slugify.ts`, and update imports/tests.
- [x] (2026-02-06 17:56Z) Delete dead `src/lib/names/agentNames.ts`.
- [x] (2026-02-06 17:57Z) Run `npm run lint`, `npm run test`, `npm run typecheck`, and `npm run build`.
- [x] (2026-02-06 17:57Z) Commit, then move this ExecPlan to `.agent/done/` with a descriptive filename.

## Surprises & Discoveries

- Observation: `createGatewayAgent` always calls `config.get` before it computes the new id, so “empty slug” errors happen after the initial config fetch (but still before any `config.patch`).
  Evidence: unit test needed to stub `config.get` and assert `config.patch` was not called.

## Decision Log

- Decision: Move slugging logic into `src/lib/gateway/agentConfig.ts` and delete `src/lib/ids/slugify.ts`.
  Rationale: `slugifyName` is only used by `createGatewayAgent` and is part of the gateway config mutation boundary; keeping it as a separate shared module adds a concept without reuse.
  Date/Author: 2026-02-06 / Codex

- Decision: Delete `src/lib/names/agentNames.ts`.
  Rationale: It has no callers in `src` or `tests` and is dead code.
  Date/Author: 2026-02-06 / Codex

## Outcomes & Retrospective

- Inlined the `slugifyName` behavior directly into `src/lib/gateway/agentConfig.ts` and deleted `src/lib/ids/slugify.ts`.
- Deleted dead `src/lib/names/agentNames.ts`.
- Moved slugging and “empty slug” coverage into `tests/unit/gatewayConfigPatch.test.ts` and deleted `tests/unit/slugifyName.test.ts`.

Result: fewer helper modules and fewer standalone tests, with the behavior still protected at the gateway config mutation boundary; all gates passed.

## Context and Orientation

The gateway config mutation helpers live at `src/lib/gateway/agentConfig.ts`. `createGatewayAgent` generates an agent id from the provided name and patches the gateway config via `config.get` and `config.patch`. The id is currently derived with:

- `src/lib/ids/slugify.ts` which exports `slugifyName(name: string): string`.

There is also an unused helper:

- `src/lib/names/agentNames.ts` exporting `normalizeAgentName(input: string)`.

Evidence (expected before starting work):

  - `rg -n "@/lib/ids/slugify" -S src tests` matches only `src/lib/gateway/agentConfig.ts` and `tests/unit/slugifyName.test.ts`.
  - `rg -n "@/lib/names/agentNames|agentNames" -S src tests` returns no matches.

## Plan of Work

First, shift the slugging tests to the behavior that matters: id generation during `createGatewayAgent`. This keeps the slugging behavior protected without needing a separate exported helper module just for unit testing.

Then, inline the slugging implementation into `src/lib/gateway/agentConfig.ts` (as a private function), remove the old import, and delete `src/lib/ids/slugify.ts`.

Finally, delete `src/lib/names/agentNames.ts` (dead code), run the full gates, commit, and archive this ExecPlan.

## Concrete Steps

All commands assume the working directory is:

  /Users/georgepickett/.codex/worktrees/f6e9/openclaw-studio

1. Update tests first.

   Edit `tests/unit/gatewayConfigPatch.test.ts` and add two new assertions:

   - Creating an agent with name `My Project` yields `entry.id === "my-project"`.
   - Creating an agent with name `!!!` rejects with the error message `Name produced an empty folder name.`

   Then delete `tests/unit/slugifyName.test.ts`.

   Run:

    npm run test -- tests/unit/gatewayConfigPatch.test.ts

   Confirm tests fail before the implementation changes if you removed `slugify.ts` too early.

2. Inline slugging into `src/lib/gateway/agentConfig.ts`.

   - Copy the existing `slugifyName` implementation from `src/lib/ids/slugify.ts` into `src/lib/gateway/agentConfig.ts` as a private helper (do not export it).
   - Remove the import of `slugifyName` from `@/lib/ids/slugify`.
   - Keep the behavior identical, including the thrown error message.

3. Delete the now-dead helper file `src/lib/ids/slugify.ts`.

4. Delete the dead helper file `src/lib/names/agentNames.ts`.

5. Verify there are no remaining imports:

    rg -n "@/lib/ids/slugify|@/lib/names/agentNames" -S src tests || true

6. Run full gates:

    npm run lint
    npm run test
    npm run typecheck
    npm run build

## Validation and Acceptance

Acceptance criteria:

- `npm run lint`, `npm run test`, `npm run typecheck`, and `npm run build` all succeed.
- `tests/unit/gatewayConfigPatch.test.ts` covers both normal slugging and the “empty slug” error.
- `tests/unit/slugifyName.test.ts` is removed.
- `src/lib/ids/slugify.ts` and `src/lib/names/agentNames.ts` are removed.
- `rg -n "@/lib/ids/slugify|@/lib/names/agentNames" -S src tests` returns no matches.

## Idempotence and Recovery

This is safe to retry:

- If tests fail, re-run only the relevant test file while iterating:

    npm run test -- tests/unit/gatewayConfigPatch.test.ts

- If you need to rollback, revert the commit for this change; there are no data migrations.

## Artifacts and Notes

- (record any failure output if you have to adjust the plan while implementing)

## Interfaces and Dependencies

No new dependencies.

`createGatewayAgent` in `src/lib/gateway/agentConfig.ts` must continue to slug agent names into ids using the existing rules:

- lowercased
- non-alphanumeric sequences become `-`
- leading/trailing `-` trimmed
- throws `Name produced an empty folder name.` if the result is empty
