"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasViewport } from "../src/components/CanvasViewport";
import { HeaderBar } from "../src/components/HeaderBar";
import { extractText } from "../src/lib/text/extractText";
import { useGatewayConnection } from "../src/lib/gateway/useGatewayConnection";
import type { EventFrame } from "../src/lib/gateway/frames";
import {
  AgentCanvasProvider,
  getActiveProject,
  useAgentCanvasStore,
} from "../src/state/store";
import { createProjectDiscordChannel } from "../src/lib/projects/client";
import type { AgentTile, ProjectRuntime } from "../src/state/store";
import { CANVAS_BASE_ZOOM } from "../src/lib/canvasDefaults";

type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

const PROJECT_PROMPT_RE = /^Project path:[\s\S]*?repository\.\s*/i;
const MESSAGE_ID_RE = /\s*\[message_id:[^\]]+\]\s*/gi;

const stripUiMetadata = (text: string) => {
  if (!text) return text;
  let cleaned = text.replace(PROJECT_PROMPT_RE, "");
  cleaned = cleaned.replace(MESSAGE_ID_RE, "").trim();
  return cleaned;
};

type ChatHistoryMessage = Record<string, unknown>;

type ChatHistoryResult = {
  sessionKey: string;
  sessionId?: string;
  messages: ChatHistoryMessage[];
  thinkingLevel?: string;
};

const buildHistoryLines = (messages: ChatHistoryMessage[]) => {
  const lines: string[] = [];
  let lastAssistant: string | null = null;
  let lastRole: string | null = null;
  for (const message of messages) {
    const role = typeof message.role === "string" ? message.role : "other";
    const extracted = extractText(message);
    const text = stripUiMetadata(extracted?.trim() ?? "");
    if (!text) continue;
    if (role === "user") {
      lines.push(`> ${text}`);
      lastRole = "user";
    } else if (role === "assistant") {
      lines.push(text);
      lastAssistant = text;
      lastRole = "assistant";
    }
  }
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }
  return { lines: deduped, lastAssistant, lastRole };
};

const buildProjectMessage = (project: ProjectRuntime | null, message: string) => {
  const trimmed = message.trim();
  if (!project || !project.repoPath.trim()) {
    return trimmed;
  }
  return `Project path: ${project.repoPath}. Operate only within this repository.\n\n${trimmed}`;
};

const findTileBySessionKey = (
  projects: ProjectRuntime[],
  sessionKey: string
): { projectId: string; tileId: string } | null => {
  for (const project of projects) {
    const tile = project.tiles.find((entry) => entry.sessionKey === sessionKey);
    if (tile) {
      return { projectId: project.id, tileId: tile.id };
    }
  }
  return null;
};

const AgentCanvasPage = () => {
  const { client, status } = useGatewayConnection();

  const {
    state,
    dispatch,
    createTile,
    createProject,
    openProject,
    deleteProject,
    deleteTile,
    renameTile,
  } = useAgentCanvasStore();
  const project = getActiveProject(state);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showOpenProjectForm, setShowOpenProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectWarnings, setProjectWarnings] = useState<string[]>([]);
  const [openProjectWarnings, setOpenProjectWarnings] = useState<string[]>([]);
  const historyInFlightRef = useRef<Set<string>>(new Set());
  const historyPollsRef = useRef<Map<string, number>>(new Map());
  const stateRef = useRef(state);

  const tiles = project?.tiles ?? [];

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const handleNewAgent = useCallback(async () => {
    if (!project) return;
    const name = `Agent ${crypto.randomUUID().slice(0, 4)}`;
    const result = await createTile(project.id, name, "coding");
    if (!result) return;
    dispatch({ type: "selectTile", tileId: result.tile.id });
  }, [createTile, dispatch, project]);

  const loadTileHistory = useCallback(
    async (projectId: string, tileId: string) => {
      const currentProject = stateRef.current.projects.find(
        (entry) => entry.id === projectId
      );
      const tile = currentProject?.tiles.find((entry) => entry.id === tileId);
      const sessionKey = tile?.sessionKey?.trim();
      if (!tile || !sessionKey) return;
      if (historyInFlightRef.current.has(sessionKey)) return;

      historyInFlightRef.current.add(sessionKey);
      try {
        const result = await client.call<ChatHistoryResult>("chat.history", {
          sessionKey,
          limit: 200,
        });
        const { lines, lastAssistant, lastRole } = buildHistoryLines(
          result.messages ?? []
        );
        if (lines.length === 0) return;
        const currentLines = tile.outputLines;
        const isSame =
          lines.length === currentLines.length &&
          lines.every((line, index) => line === currentLines[index]);
        if (isSame) {
          if (tile.status === "running" && lastRole === "assistant") {
            dispatch({
              type: "updateTile",
              projectId,
              tileId,
              patch: { status: "idle", runId: null, streamText: null },
            });
          }
          return;
        }
        const patch: Partial<AgentTile> = {
          outputLines: lines,
          lastResult: lastAssistant ?? null,
        };
        if (tile.status === "running" && lastRole === "assistant") {
          patch.status = "idle";
          patch.runId = null;
          patch.streamText = null;
        }
        dispatch({
          type: "updateTile",
          projectId,
          tileId,
          patch,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load chat history.";
        console.error(msg);
      } finally {
        historyInFlightRef.current.delete(sessionKey);
      }
    },
    [client, dispatch]
  );

  const startHistoryPolling = useCallback(
    (projectId: string, tileId: string) => {
      const pollKey = `${projectId}:${tileId}`;
      const existing = historyPollsRef.current.get(pollKey);
      if (existing) {
        window.clearTimeout(existing);
        historyPollsRef.current.delete(pollKey);
      }

      let attempts = 0;
      const maxAttempts = 40;
      const poll = async () => {
        historyPollsRef.current.delete(pollKey);
        attempts += 1;
        await loadTileHistory(projectId, tileId);
        const currentProject = stateRef.current.projects.find(
          (entry) => entry.id === projectId
        );
        const tile = currentProject?.tiles.find((entry) => entry.id === tileId);
        if (!tile || tile.status !== "running") {
          return;
        }
        if (attempts >= maxAttempts) {
          return;
        }
        const timeoutId = window.setTimeout(poll, 1000);
        historyPollsRef.current.set(pollKey, timeoutId);
      };

      const timeoutId = window.setTimeout(poll, 1000);
      historyPollsRef.current.set(pollKey, timeoutId);
    },
    [loadTileHistory]
  );

  const handleSend = useCallback(
    async (tileId: string, sessionKey: string, message: string) => {
      if (!project) return;
      const trimmed = message.trim();
      if (!trimmed) return;
      const runId = crypto.randomUUID();
      const tile = project.tiles.find((entry) => entry.id === tileId);
      if (!tile) {
        dispatch({
          type: "appendOutput",
          projectId: project.id,
          tileId,
          line: "Error: Tile not found.",
        });
        return;
      }
      dispatch({
        type: "updateTile",
        projectId: project.id,
        tileId,
        patch: { status: "running", runId, streamText: "", draft: "" },
      });
      dispatch({
        type: "appendOutput",
        projectId: project.id,
        tileId,
        line: `> ${trimmed}`,
      });
      try {
        if (!sessionKey) {
          throw new Error("Missing session key for tile.");
        }
        if (!tile.sessionSettingsSynced) {
          await client.call("sessions.patch", {
            key: sessionKey,
            model: tile.model ?? null,
            thinkingLevel: tile.thinkingLevel ?? null,
          });
          dispatch({
            type: "updateTile",
            projectId: project.id,
            tileId,
            patch: { sessionSettingsSynced: true },
          });
        }
        await client.call("chat.send", {
          sessionKey,
          message: buildProjectMessage(project, trimmed),
          deliver: false,
          idempotencyKey: runId,
        });
        startHistoryPolling(project.id, tileId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gateway error";
        dispatch({
          type: "updateTile",
          projectId: project.id,
          tileId,
          patch: { status: "error", runId: null, streamText: null },
        });
        dispatch({
          type: "appendOutput",
          projectId: project.id,
          tileId,
          line: `Error: ${msg}`,
        });
      }
    },
    [client, dispatch, project, startHistoryPolling]
  );

  useEffect(() => {
    return () => {
      for (const timeoutId of historyPollsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      historyPollsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    if (!project) return;
    const tilesToLoad = project.tiles.filter(
      (tile) => tile.outputLines.length === 0 && tile.sessionKey?.trim()
    );
    if (tilesToLoad.length === 0) return;
    let cancelled = false;
    const loadHistory = async () => {
      for (const tile of tilesToLoad) {
        if (cancelled) return;
        await loadTileHistory(project.id, tile.id);
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [loadTileHistory, project, status]);

  const handleModelChange = useCallback(
    async (tileId: string, sessionKey: string, value: string | null) => {
      if (!project) return;
      dispatch({
        type: "updateTile",
        projectId: project.id,
        tileId,
        patch: { model: value, sessionSettingsSynced: false },
      });
      try {
        await client.call("sessions.patch", {
          key: sessionKey,
          model: value ?? null,
        });
        dispatch({
          type: "updateTile",
          projectId: project.id,
          tileId,
          patch: { sessionSettingsSynced: true },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to set model.";
        dispatch({
          type: "appendOutput",
          projectId: project.id,
          tileId,
          line: `Model update failed: ${msg}`,
        });
      }
    },
    [client, dispatch, project]
  );

  const handleThinkingChange = useCallback(
    async (tileId: string, sessionKey: string, value: string | null) => {
      if (!project) return;
      dispatch({
        type: "updateTile",
        projectId: project.id,
        tileId,
        patch: { thinkingLevel: value, sessionSettingsSynced: false },
      });
      try {
        await client.call("sessions.patch", {
          key: sessionKey,
          thinkingLevel: value ?? null,
        });
        dispatch({
          type: "updateTile",
          projectId: project.id,
          tileId,
          patch: { sessionSettingsSynced: true },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to set thinking level.";
        dispatch({
          type: "appendOutput",
          projectId: project.id,
          tileId,
          line: `Thinking update failed: ${msg}`,
        });
      }
    },
    [client, dispatch, project]
  );

  useEffect(() => {
    return client.onEvent((event: EventFrame) => {
      if (event.event !== "chat") return;
      const payload = event.payload as ChatEventPayload | undefined;
      if (!payload?.sessionKey) return;
      const match = findTileBySessionKey(state.projects, payload.sessionKey);
      if (!match) return;

      const role =
        payload.message && typeof payload.message === "object"
          ? (payload.message as Record<string, unknown>).role
          : null;
      if (role === "user") {
        return;
      }
      const nextTextRaw = extractText(payload.message);
      const nextText = nextTextRaw ? stripUiMetadata(nextTextRaw) : null;
      if (payload.state === "delta") {
        if (typeof nextText === "string") {
          dispatch({
            type: "setStream",
            projectId: match.projectId,
            tileId: match.tileId,
            value: nextText,
          });
          dispatch({
            type: "updateTile",
            projectId: match.projectId,
            tileId: match.tileId,
            patch: { status: "running" },
          });
        }
        return;
      }

      if (payload.state === "final") {
        if (typeof nextText === "string") {
          dispatch({
            type: "appendOutput",
            projectId: match.projectId,
            tileId: match.tileId,
            line: nextText,
          });
          dispatch({
            type: "updateTile",
            projectId: match.projectId,
            tileId: match.tileId,
            patch: { lastResult: nextText },
          });
        }
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: { status: "idle", runId: null, streamText: null },
        });
        return;
      }

      if (payload.state === "aborted") {
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: { status: "idle", runId: null, streamText: null },
        });
        dispatch({
          type: "appendOutput",
          projectId: match.projectId,
          tileId: match.tileId,
          line: "Run aborted.",
        });
        return;
      }

      if (payload.state === "error") {
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: { status: "error", runId: null, streamText: null },
        });
        dispatch({
          type: "appendOutput",
          projectId: match.projectId,
          tileId: match.tileId,
          line: payload.errorMessage ? `Error: ${payload.errorMessage}` : "Run error.",
        });
      }
    });
  }, [client, dispatch, state.projects]);

  const zoom = state.canvas.zoom;

  const handleZoomIn = useCallback(() => {
    dispatch({ type: "setCanvas", patch: { zoom: Math.min(2.2, zoom + 0.1) } });
  }, [dispatch, zoom]);

  const handleZoomOut = useCallback(() => {
    dispatch({ type: "setCanvas", patch: { zoom: Math.max(0.5, zoom - 0.1) } });
  }, [dispatch, zoom]);

  const handleZoomReset = useCallback(() => {
    dispatch({
      type: "setCanvas",
      patch: { zoom: CANVAS_BASE_ZOOM, offsetX: 0, offsetY: 0 },
    });
  }, [dispatch]);

  const handleCenterCanvas = useCallback(() => {
    dispatch({ type: "setCanvas", patch: { offsetX: 0, offsetY: 0 } });
  }, [dispatch]);

  const canvasPatch = useMemo(() => state.canvas, [state.canvas]);

  const handleProjectCreate = useCallback(async () => {
    if (!projectName.trim()) {
      setProjectWarnings(["Project name is required."]);
      return;
    }
    const result = await createProject(projectName.trim());
    if (!result) return;
    setProjectWarnings(result.warnings);
    setProjectName("");
    setShowProjectForm(false);
  }, [createProject, projectName]);

  const handleProjectOpen = useCallback(async () => {
    if (!projectPath.trim()) {
      setOpenProjectWarnings(["Project path is required."]);
      return;
    }
    const result = await openProject(projectPath.trim());
    if (!result) return;
    setOpenProjectWarnings(result.warnings);
    setProjectPath("");
    setShowOpenProjectForm(false);
  }, [openProject, projectPath]);

  const handleProjectDelete = useCallback(async () => {
    if (!project) return;
    const confirmation = window.prompt(
      `Type DELETE ${project.name} to confirm project deletion.`
    );
    if (confirmation !== `DELETE ${project.name}`) {
      return;
    }
    const result = await deleteProject(project.id);
    if (result?.warnings.length) {
      window.alert(result.warnings.join("\n"));
    }
  }, [deleteProject, project]);

  const handleCreateDiscordChannel = useCallback(async () => {
    if (!project) return;
    if (!state.selectedTileId) {
      window.alert("Select an agent tile first.");
      return;
    }
    const tile = project.tiles.find((entry) => entry.id === state.selectedTileId);
    if (!tile) {
      window.alert("Selected agent not found.");
      return;
    }
    try {
      const result = await createProjectDiscordChannel(project.id, {
        agentId: tile.agentId,
        agentName: tile.name,
      });
      const notice = `Created Discord channel #${result.channelName} for ${tile.name}.`;
      if (result.warnings.length) {
        window.alert(`${notice}\n${result.warnings.join("\n")}`);
      } else {
        window.alert(notice);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create Discord channel.";
      window.alert(message);
    }
  }, [project, state.selectedTileId]);

  const handleTileDelete = useCallback(
    async (tileId: string) => {
      if (!project) return;
      const result = await deleteTile(project.id, tileId);
      if (result?.warnings.length) {
        window.alert(result.warnings.join("\n"));
      }
    },
    [deleteTile, project]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <CanvasViewport
        tiles={tiles}
        transform={canvasPatch}
        selectedTileId={state.selectedTileId}
        canSend={status === "connected"}
        onSelectTile={(id) => dispatch({ type: "selectTile", tileId: id })}
        onMoveTile={(id, position) =>
          project
            ? dispatch({
                type: "updateTile",
                projectId: project.id,
                tileId: id,
                patch: { position },
              })
            : null
        }
        onResizeTile={(id, size) =>
          project
            ? dispatch({
                type: "updateTile",
                projectId: project.id,
                tileId: id,
                patch: { size },
              })
            : null
        }
        onDeleteTile={handleTileDelete}
        onRenameTile={(id, name) => {
          if (!project) return Promise.resolve(false);
          return renameTile(project.id, id, name).then((result) => {
            if (!result) return false;
            if ("error" in result) {
              window.alert(result.error);
              return false;
            }
            if (result.warnings.length > 0) {
              window.alert(result.warnings.join("\n"));
            }
            return true;
          });
        }}
        onDraftChange={(id, value) =>
          project
            ? dispatch({
                type: "updateTile",
                projectId: project.id,
                tileId: id,
                patch: { draft: value },
              })
            : null
        }
        onSend={handleSend}
        onModelChange={handleModelChange}
        onThinkingChange={handleThinkingChange}
        onUpdateTransform={(patch) => dispatch({ type: "setCanvas", patch })}
      />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-4 p-6">
        <div className="pointer-events-auto mx-auto w-full max-w-6xl">
          <HeaderBar
            projects={state.projects.map((entry) => ({ id: entry.id, name: entry.name }))}
            activeProjectId={state.activeProjectId}
            status={status}
            onProjectChange={(projectId) =>
              dispatch({
                type: "setActiveProject",
                projectId: projectId.trim() ? projectId : null,
              })
            }
            onCreateProject={() => {
              setProjectWarnings([]);
              setOpenProjectWarnings([]);
              setShowOpenProjectForm(false);
              setShowProjectForm((prev) => !prev);
            }}
            onOpenProject={() => {
              setProjectWarnings([]);
              setOpenProjectWarnings([]);
              setShowProjectForm(false);
              setShowOpenProjectForm((prev) => !prev);
            }}
            onDeleteProject={handleProjectDelete}
            onNewAgent={handleNewAgent}
            onCreateDiscordChannel={handleCreateDiscordChannel}
            canCreateDiscordChannel={Boolean(project && project.tiles.length > 0)}
            onCenterCanvas={handleCenterCanvas}
            zoom={state.canvas.zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
          />
        </div>

        {state.loading ? (
          <div className="pointer-events-auto mx-auto w-full max-w-4xl">
            <div className="glass-panel px-6 py-6 text-slate-700">Loading projects…</div>
          </div>
        ) : null}

        {showProjectForm ? (
          <div className="pointer-events-auto mx-auto w-full max-w-5xl">
            <div className="glass-panel px-6 py-6">
              <div className="flex flex-col gap-4">
                <div className="grid gap-4">
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Project name
                    <input
                      className="h-11 rounded-full border border-slate-300 bg-white/80 px-4 text-sm text-slate-900 outline-none"
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white"
                    type="button"
                    onClick={handleProjectCreate}
                  >
                    Create Project
                  </button>
                  <button
                    className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700"
                    type="button"
                    onClick={() => setShowProjectForm(false)}
                  >
                    Cancel
                  </button>
                </div>
                {projectWarnings.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
                    {projectWarnings.join(" ")}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {showOpenProjectForm ? (
          <div className="pointer-events-auto mx-auto w-full max-w-5xl">
            <div className="glass-panel px-6 py-6">
              <div className="flex flex-col gap-4">
                <div className="grid gap-4">
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Project path
                    <input
                      className="h-11 rounded-full border border-slate-300 bg-white/80 px-4 text-sm text-slate-900 outline-none"
                      value={projectPath}
                      onChange={(event) => setProjectPath(event.target.value)}
                      placeholder="/Users/you/repos/my-project"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white"
                    type="button"
                    onClick={handleProjectOpen}
                  >
                    Open Project
                  </button>
                  <button
                    className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700"
                    type="button"
                    onClick={() => setShowOpenProjectForm(false)}
                  >
                    Cancel
                  </button>
                </div>
                {openProjectWarnings.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
                    {openProjectWarnings.join(" ")}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {state.error ? (
          <div className="pointer-events-auto mx-auto w-full max-w-4xl">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {state.error}
            </div>
          </div>
        ) : null}

        {project ? null : (
          <div className="pointer-events-auto mx-auto w-full max-w-4xl">
            <div className="glass-panel px-6 py-8 text-slate-600">
              Create a project to begin.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Home() {
  return (
    <AgentCanvasProvider>
      <AgentCanvasPage />
    </AgentCanvasProvider>
  );
}
