# Smooth Chat Streaming UX (Scroll, Rendering, Event Throttling)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository follows `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/.agent/PLANS.md`, and this document must be maintained in accordance with it.

## Purpose / Big Picture

When chatting with an agent, the UI should feel stable and “buttery” while the agent streams output. Today, streaming can trigger frequent renders, the transcript does not reliably follow streaming text, and scrolling behavior is under-specified (no “pinned to bottom” concept). After this change, users can (1) watch streaming output while the transcript reliably follows the agent when they are at the bottom, (2) scroll up without being yanked back down, and (3) jump back to the latest output with a clear affordance. Under the hood, the transcript should not re-parse or re-render the entire markdown history for each streamed delta, and live streaming updates should be throttled to a reasonable frame budget.

## Progress

- [x] (2026-02-07) Baseline: run unit tests, add a minimal repro harness for scroll + streaming updates where feasible, and document the current behavior. [M1]
- [x] (2026-02-07) Implement pinned-to-bottom scrolling semantics + “Jump to latest” affordance, including following live stream + live thinking when pinned. [M2]
- [x] (2026-02-07) Reduce rendering work while streaming by splitting “final transcript” from “live streaming” rendering and avoiding markdown parsing for live content. [M3]
- [x] (2026-02-07) Throttle and batch gateway-driven live updates (assistant stream + thinking trace + activity) to reduce reducer churn and layout thrash. [M4]
- [x] (2026-02-07) Reduce competing background polling while runs are active (especially `chat.history` polling), without regressing correctness. [M5]
- [x] (2026-02-07) Full validation: unit tests, typecheck, lint, and a manual streaming UX check in the browser. [M6]

## Surprises & Discoveries

- Observation: The repo’s lint rules forbid (a) calling setState from effects, and (b) accessing `ref.current` during render, which constrained how “unseen output” could be tracked in the transcript.
  Evidence: `npm run lint` failures pointing at `react-hooks/set-state-in-effect` and `react-hooks/refs`.

## Decision Log

- Decision: Use “near-bottom” scroll position (scrollHeight - scrollTop - clientHeight) with a small threshold as the primary pinned-to-bottom signal, rather than IntersectionObserver.
  Rationale: It is simpler, does not rely on browser observer behavior, and is easier to unit test under jsdom.
  Date/Author: 2026-02-07 / Codex

- Decision: Show “Jump to latest” whenever the user is not pinned to the bottom (instead of only when new output arrives while unpinned).
  Rationale: It matches common chat UX (a “jump to present” affordance whenever you scroll up) and avoids the need for effect-driven state or ref-based render reads that violate the repo’s lint rules.
  Date/Author: 2026-02-07 / Codex

## Outcomes & Retrospective

- Outcome: Transcript scrolling now follows streaming output when pinned, and provides a consistent “Jump to latest” button when unpinned.
  Notes: The live stream and live thinking render as isolated plain text regions, avoiding markdown parsing for streaming content.

- Outcome: Gateway event-driven live updates are now batched to one flush per animation frame, and activity marking is throttled.
  Notes: This reduces reducer churn and should reduce UI jank under high-frequency deltas.

- Outcome: History polling during active runs was reduced to focused running agent only, with a longer interval.
  Notes: This reduces background work while streaming.

## Context and Orientation

This project is a Next.js app (`next dev`) that connects to an OpenClaw gateway over WebSocket and renders a multi-agent chat “studio”.

Key files for chat UX:

- `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/app/page.tsx`: Main page. Sends chat (`chat.send`), stops runs (`chat.abort`), and handles gateway streaming events (`client.onEvent`). It mutates agent state via the reducer in the agent store.
- `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/features/agents/components/AgentChatPanel.tsx`: Focused agent chat UI. Renders transcript and composer, builds chat items from `outputLines` plus live `streamText` and `thinkingTrace`, and currently only auto-scrolls on “next output line after send”.
- `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/features/agents/components/chatItems.ts`: Converts raw `outputLines` plus live stream/thinking into display items (user/assistant/tool/thinking).
- `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/features/agents/state/store.tsx`: Agent reducer/state.
- `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/features/agents/state/runtimeEventBridge.ts`: Utility logic for merging runtime streams and history sync.

Terms used in this plan:

- “Pinned to bottom”: the user is at (or within a small threshold of) the bottom of the scrollable transcript. While pinned, the UI should auto-scroll to keep the newest output visible.
- “Live stream”: the currently-streaming assistant text (stored in `agent.streamText`) and the currently-streaming “thinking trace” (stored in `agent.thinkingTrace`).
- “Final transcript”: the saved `agent.outputLines` list, which contains prior user turns and finalized assistant/tool/thinking lines.

## Plan of Work

Milestone 1 establishes a baseline and the scaffolding needed to verify behavior repeatedly without guessing.

Milestone 2 implements the UX semantics for scrolling: detect pinned-to-bottom; follow output while pinned; do not auto-scroll while the user is reading older messages; and show an explicit “Jump to latest” button when new output arrives while unpinned.

Milestone 3 reduces rendering cost while streaming by splitting final transcript rendering from live streaming rendering. The final transcript should not re-render on every live delta, and live deltas should avoid markdown parsing until finalized.

Milestone 4 reduces state churn by batching/throttling live updates arriving from the gateway event stream, keeping the UI responsive under high-frequency deltas.

Milestone 5 reduces competing background work (notably history polling) while runs are active, preferring event-driven correctness and conservative backoff so the UI thread is not fighting network + parsing loops.

Milestone 6 runs all validation and includes a manual verification script for the chat UI.

## Concrete Steps

All commands are run from:

    cd /Users/georgepickett/.codex/worktrees/5070/openclaw-studio

Baseline commands:

    npm test
    npm run typecheck
    npm run lint

Dev server:

    npm run dev

Then open:

    http://localhost:3000

and connect the gateway via the Connection panel.

## Validation and Acceptance

Acceptance is met when all of the following are true:

1. While an agent is streaming output, if the transcript is pinned to the bottom, the view follows the streaming content (assistant stream and thinking trace) without stutter and without requiring a new finalized line to be appended.
2. If the user scrolls up during a stream, the transcript does not auto-scroll; instead, a “Jump to latest” affordance appears when new output arrives. Clicking it scrolls to the bottom and resumes following.
3. Streaming updates do not cause the entire transcript history to re-render or re-parse markdown. Only the live region updates during streaming.
4. Gateway event handling is throttled/batched so that high-frequency deltas do not cause excessive reducer churn (measured qualitatively via smoother typing and less UI lag, and by code structure that flushes updates at most once per animation frame).
5. Background `chat.history` polling is reduced during active streams (for example, polling only the focused running agent, using a longer interval, or triggering only on known event gaps), and correctness is preserved (final messages still appear even if chat events are missing).

For each milestone, follow this verification workflow:

### Milestone 1 (Baseline / Repro)

1. Tests to write: none (baseline), but add at least one unit test for the helper used to detect “near bottom” scrolling.
2. Implementation: add a small pure helper (for example, `isNearBottom({ scrollTop, scrollHeight, clientHeight }, thresholdPx)`), and use it later.
3. Verification: run `npm test` and confirm it passes.
4. Commit: commit with message `Milestone 1: Add scroll pinning helper + baseline tests`.

### Milestone 2 (Pinned Scroll + Jump Button)

1. Tests to write: unit tests for the near-bottom helper and a component-level test that “Jump to latest” appears when unpinned and new output arrives.
2. Implementation:
   - In `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/features/agents/components/AgentChatPanel.tsx`, teach `AgentChatTranscript` to:
     - Track whether the user is pinned to bottom (near-bottom threshold).
     - Auto-scroll on (a) newly appended output lines, and (b) live stream/thinking changes when pinned.
     - When unpinned and new output arrives, set a “has unseen output” flag and render a “Jump to latest” button overlay inside the transcript container.
     - When the user scrolls back to bottom or clicks “Jump”, clear the unseen flag.
3. Verification: run `npm test`.
4. Commit: `Milestone 2: Add pinned chat scrolling + jump to latest`.

### Milestone 3 (Live Region Rendering + Avoid Live Markdown)

1. Tests to write: update/add unit tests around chat item building so final transcript items are stable and live items are not computed by rescanning `outputLines` on every delta.
2. Implementation:
   - In `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/features/agents/components/chatItems.ts`, introduce a function that builds “final transcript” items from `outputLines` only.
   - Update `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/features/agents/components/AgentChatPanel.tsx` to render:
     - Final transcript items (markdown) in a memoized component that only depends on `outputLines` and feature toggles.
     - Live thinking + live assistant stream as a separate “live region” at the end using plain text rendering (preserving whitespace), converting to markdown only once finalized into `outputLines`.
3. Verification: run `npm test`.
4. Commit: `Milestone 3: Split final transcript from live streaming rendering`.

### Milestone 4 (Throttle/Batch Live Updates)

1. Tests to write: unit tests for the throttling/batching helper (for example, ensuring multiple rapid updates flush as one).
2. Implementation:
   - In `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/app/page.tsx`, buffer gateway “assistant” stream updates and “reasoning/thinking” updates into refs and flush into the agent store at most once per animation frame.
   - Prefer a single `dispatch({ type: "updateAgent", ... })` per flush per agent rather than multiple dispatches per delta.
   - Throttle `markActivity` so it does not dispatch on every single event; it should still update often enough to reflect liveness (for example, 2-4 times per second).
3. Verification: `npm test`, then manual check: stream output should still appear promptly.
4. Commit: `Milestone 4: Throttle and batch live gateway updates`.

### Milestone 5 (Reduce History Polling While Running)

1. Tests to write: none required if difficult, but prefer adding a unit test for whichever scheduling logic is introduced (for example, “poll focused agent only”).
2. Implementation:
   - In `/Users/georgepickett/.codex/worktrees/5070/openclaw-studio/src/app/page.tsx`, reduce `chat.history` polling:
     - Poll only the focused agent while it is running, or
     - Increase the interval / add backoff, and
     - Trigger a forced history sync when a gateway event gap is detected (if exposed), or when lifecycle ends without chat events and no final text was appended.
3. Verification: manual check while a run is streaming; UI should remain responsive, and final output should still appear.
4. Commit: `Milestone 5: Reduce chat history polling during active runs`.

### Milestone 6 (Full Validation)

1. Verification:
   - Run `npm test` and expect all tests to pass.
   - Run `npm run typecheck` and expect success.
   - Run `npm run lint` and expect success.
   - Run `npm run dev`, connect to a gateway, and confirm acceptance items 1-5.
2. Commit: `Milestone 6: Validate smoother chat UX end-to-end`.

## Idempotence and Recovery

All changes are additive and can be applied repeatedly. If a milestone introduces regressions, revert by `git revert <commit>` per milestone commit. Avoid deleting directories or large refactors; keep changes scoped to chat UI and gateway event handling.

## Artifacts and Notes

Expected user-visible behaviors (manual):

    - Start a run, stay at bottom: transcript follows streaming text.
    - Scroll up mid-stream: transcript stays put; “Jump to latest” appears.
    - Click “Jump to latest”: transcript snaps to bottom and resumes following.

Plan revisions:

    - 2026-02-07: Adjusted “Jump to latest” semantics to show whenever unpinned to satisfy lint rules and align with typical chat UX.
