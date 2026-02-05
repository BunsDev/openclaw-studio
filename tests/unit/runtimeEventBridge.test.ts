import { describe, expect, it } from "vitest";

import {
  buildHistoryLines,
  buildHistorySyncPatch,
  buildSummarySnapshotPatches,
  classifyGatewayEventKind,
  dedupeRunLines,
  getAgentSummaryPatch,
  getChatSummaryPatch,
  isReasoningRuntimeAgentStream,
  mergeHistoryWithPending,
  mergeRuntimeStream,
  resolveAssistantCompletionTimestamp,
  resolveLifecyclePatch,
  shouldPublishAssistantStream,
} from "@/features/agents/state/runtimeEventBridge";

describe("runtime event bridge helpers", () => {
  it("classifies gateway events by routing category", () => {
    expect(classifyGatewayEventKind("presence")).toBe("summary-refresh");
    expect(classifyGatewayEventKind("heartbeat")).toBe("summary-refresh");
    expect(classifyGatewayEventKind("chat")).toBe("runtime-chat");
    expect(classifyGatewayEventKind("agent")).toBe("runtime-agent");
    expect(classifyGatewayEventKind("unknown")).toBe("ignore");
  });

  it("detects reasoning-like runtime agent streams", () => {
    expect(isReasoningRuntimeAgentStream("reasoning")).toBe(true);
    expect(isReasoningRuntimeAgentStream("assistant.reasoning")).toBe(true);
    expect(isReasoningRuntimeAgentStream("thinking_stream")).toBe(true);
    expect(isReasoningRuntimeAgentStream("analysis")).toBe(true);
    expect(isReasoningRuntimeAgentStream("assistant")).toBe(false);
    expect(isReasoningRuntimeAgentStream("tool")).toBe(false);
    expect(isReasoningRuntimeAgentStream("lifecycle")).toBe(false);
  });

  it("merges assistant stream text deterministically", () => {
    expect(mergeRuntimeStream("", "delta")).toBe("delta");
    expect(mergeRuntimeStream("hello", "hello world")).toBe("hello world");
    expect(mergeRuntimeStream("hello", " world")).toBe("hello world");
    expect(mergeRuntimeStream("hello", "hello")).toBe("hello");
  });

  it("dedupes tool lines per run", () => {
    const first = dedupeRunLines(new Set<string>(), ["a", "b", "a"]);
    expect(first.appended).toEqual(["a", "b"]);
    const second = dedupeRunLines(first.nextSeen, ["b", "c"]);
    expect(second.appended).toEqual(["c"]);
  });

  it("resolves lifecycle transitions with run guards", () => {
    const started = resolveLifecyclePatch({
      phase: "start",
      incomingRunId: "run-1",
      currentRunId: null,
      lastActivityAt: 123,
    });
    expect(started.kind).toBe("start");
    if (started.kind !== "start") throw new Error("Expected start transition");
    expect(started.patch.status).toBe("running");
    expect(started.patch.runId).toBe("run-1");

    const ignored = resolveLifecyclePatch({
      phase: "end",
      incomingRunId: "run-2",
      currentRunId: "run-1",
      lastActivityAt: 456,
    });
    expect(ignored.kind).toBe("ignore");

    const ended = resolveLifecyclePatch({
      phase: "end",
      incomingRunId: "run-1",
      currentRunId: "run-1",
      lastActivityAt: 789,
    });
    expect(ended.kind).toBe("terminal");
    if (ended.kind !== "terminal") throw new Error("Expected terminal transition");
    expect(ended.patch.status).toBe("idle");
    expect(ended.patch.runId).toBeNull();
    expect(ended.clearRunTracking).toBe(true);
  });

  it("suppresses assistant stream publish when chat stream already owns it", () => {
    expect(
      shouldPublishAssistantStream({
        mergedRaw: "hello",
        rawText: "",
        hasChatEvents: true,
        currentStreamText: "already streaming",
      })
    ).toBe(false);
    expect(
      shouldPublishAssistantStream({
        mergedRaw: "hello",
        rawText: "",
        hasChatEvents: false,
        currentStreamText: "already streaming",
      })
    ).toBe(true);
    expect(
      shouldPublishAssistantStream({
        mergedRaw: "",
        rawText: "",
        hasChatEvents: false,
        currentStreamText: null,
      })
    ).toBe(false);
  });

  it("updates preview and activity from assistant chat", () => {
    const patch = getChatSummaryPatch(
      {
        runId: "run-1",
        sessionKey: "agent:main:studio:agent-1",
        state: "final",
        message: { role: "assistant", content: "Hello" },
      },
      123
    );

    expect(patch?.latestPreview).toBe("Hello");
    expect(patch?.lastActivityAt).toBe(123);
  });

  it("updates status from agent lifecycle events", () => {
    const patch = getAgentSummaryPatch(
      {
        runId: "run-2",
        stream: "lifecycle",
        data: { phase: "start" },
      },
      456
    );

    expect(patch?.status).toBe("running");
    expect(patch?.lastActivityAt).toBe(456);
  });

  it("resolves assistant completion timestamp only for final assistant messages", () => {
    expect(
      resolveAssistantCompletionTimestamp({
        role: "assistant",
        state: "delta",
        message: { timestamp: "2024-01-01T00:00:00.000Z" },
      })
    ).toBeNull();
    expect(
      resolveAssistantCompletionTimestamp({
        role: "user",
        state: "final",
        message: { timestamp: "2024-01-01T00:00:00.000Z" },
      })
    ).toBeNull();
    expect(
      resolveAssistantCompletionTimestamp({
        role: "assistant",
        state: "final",
        message: { timestamp: "2024-01-01T00:00:00.000Z" },
      })
    ).toBe(Date.parse("2024-01-01T00:00:00.000Z"));
    expect(
      resolveAssistantCompletionTimestamp({
        role: "assistant",
        state: "final",
        message: {},
        now: 1234,
      })
    ).toBe(1234);
  });

  it("builds summary patches from status and preview snapshots", () => {
    const patches = buildSummarySnapshotPatches({
      agents: [
        { agentId: "agent-1", sessionKey: "agent:agent-1:studio:session-a" },
        { agentId: "agent-2", sessionKey: "agent:agent-2:studio:session-a" },
      ],
      statusSummary: {
        sessions: {
          recent: [{ key: "agent:agent-1:studio:session-a", updatedAt: 111 }],
          byAgent: [
            {
              agentId: "agent-2",
              recent: [{ key: "agent:agent-2:studio:session-a", updatedAt: 222 }],
            },
          ],
        },
      },
      previewResult: {
        ts: 0,
        previews: [
          {
            key: "agent:agent-1:studio:session-a",
            status: "ok",
            items: [
              { role: "user", text: "Project path: /tmp\n\nhello there" },
              { role: "assistant", text: "assistant latest", timestamp: "not-a-date" },
            ],
          },
        ],
      },
    });

    expect(patches).toEqual([
      {
        agentId: "agent-1",
        patch: {
          lastActivityAt: 111,
          lastAssistantMessageAt: 111,
          latestPreview: "assistant latest",
          lastUserMessage: "hello there",
        },
      },
      {
        agentId: "agent-2",
        patch: {
          lastActivityAt: 222,
        },
      },
    ]);
  });

  it("returns no entries when snapshots produce no patch fields", () => {
    const patches = buildSummarySnapshotPatches({
      agents: [{ agentId: "agent-1", sessionKey: "agent:agent-1:studio:session-a" }],
      statusSummary: { sessions: { recent: [] } },
      previewResult: { ts: 0, previews: [] },
    });

    expect(patches).toEqual([]);
  });

  it("does not update assistant sort timestamp from summary while agent is running", () => {
    const patches = buildSummarySnapshotPatches({
      agents: [
        {
          agentId: "agent-1",
          sessionKey: "agent:agent-1:studio:session-a",
          status: "running",
        },
      ],
      statusSummary: {
        sessions: {
          recent: [{ key: "agent:agent-1:studio:session-a", updatedAt: 111 }],
        },
      },
      previewResult: {
        ts: 0,
        previews: [
          {
            key: "agent:agent-1:studio:session-a",
            status: "ok",
            items: [{ role: "assistant", text: "assistant latest", timestamp: 999 }],
          },
        ],
      },
    });

    expect(patches).toEqual([
      {
        agentId: "agent-1",
        patch: {
          lastActivityAt: 111,
          latestPreview: "assistant latest",
        },
      },
    ]);
  });

  it("extracts history lines with heartbeat filtering, thinking/tool lines, and dedupe", () => {
    const history = buildHistoryLines([
      { role: "user", content: "Read HEARTBEAT.md if it exists\nHeartbeat file path: /tmp/HEARTBEAT.md" },
      { role: "user", content: "Project path: /tmp/project\n\nhello there" },
      {
        role: "assistant",
        timestamp: "2024-01-01T00:00:00.000Z",
        content: [
          { type: "thinking", thinking: "step one" },
          { type: "text", text: "assistant final" },
        ],
      },
      {
        role: "assistant",
        timestamp: "2024-01-01T00:00:01.000Z",
        content: "assistant final",
      },
      {
        role: "toolResult",
        toolName: "shell",
        toolCallId: "call-1",
        details: { status: "ok" },
        text: "done",
      },
    ]);

    expect(history.lines).toEqual([
      "> hello there",
      "[[trace]]\n_step one_",
      "assistant final",
      "[[tool-result]] shell (call-1)\nok\n```text\ndone\n```",
    ]);
    expect(history.lastAssistant).toBe("assistant final");
    expect(history.lastAssistantAt).toBe(Date.parse("2024-01-01T00:00:01.000Z"));
    expect(history.lastRole).toBe("assistant");
    expect(history.lastUser).toBe("hello there");
  });

  it("merges history lines with pending output order and preserves empty-history behavior", () => {
    expect(mergeHistoryWithPending(["a", "c"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeHistoryWithPending([], ["a", "b"])).toEqual([]);
    expect(mergeHistoryWithPending(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("builds history sync patches for empty, unchanged, and merged cases", () => {
    expect(
      buildHistorySyncPatch({
        messages: [],
        currentLines: ["> hello"],
        loadedAt: 100,
        status: "idle",
        runId: null,
      })
    ).toEqual({ historyLoadedAt: 100 });

    const unchanged = buildHistorySyncPatch({
      messages: [
        {
          role: "assistant",
          timestamp: "2024-01-01T00:00:00.000Z",
          content: "done",
        },
      ],
      currentLines: ["done"],
      loadedAt: 200,
      status: "running",
      runId: null,
    });
    expect(unchanged).toEqual({
      historyLoadedAt: 200,
      lastAssistantMessageAt: Date.parse("2024-01-01T00:00:00.000Z"),
      status: "idle",
      runId: null,
      streamText: null,
      thinkingTrace: null,
    });

    const merged = buildHistorySyncPatch({
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          timestamp: "2024-01-01T00:00:02.000Z",
          content: "assistant final",
        },
      ],
      currentLines: ["> hello", "pending line"],
      loadedAt: 300,
      status: "running",
      runId: null,
    });
    expect(merged).toEqual({
      outputLines: ["> hello", "pending line", "assistant final"],
      lastResult: "assistant final",
      latestPreview: "assistant final",
      lastAssistantMessageAt: Date.parse("2024-01-01T00:00:02.000Z"),
      lastUserMessage: "hello",
      historyLoadedAt: 300,
      status: "idle",
      runId: null,
      streamText: null,
      thinkingTrace: null,
    });
  });
});
