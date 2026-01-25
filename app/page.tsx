"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { ProjectRuntime } from "../src/state/store";

type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
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
  const {
    client,
    status,
    gatewayUrl,
    token,
    setGatewayUrl,
    setToken,
  } = useGatewayConnection();

  const { state, dispatch, createTile, createProject, deleteProject } =
    useAgentCanvasStore();
  const project = getActiveProject(state);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectWarnings, setProjectWarnings] = useState<string[]>([]);

  const tiles = project?.tiles ?? [];
  const tileCount = tiles.length;

  const handleNewAgent = useCallback(() => {
    if (!project) return;
    const tile = createTile(project.id);
    const offset = tileCount * 36;
    dispatch({
      type: "addTile",
      projectId: project.id,
      tile: {
        ...tile,
        position: { x: 80 + offset, y: 80 + offset },
      },
    });
    dispatch({ type: "selectTile", tileId: tile.id });
  }, [createTile, dispatch, project, tileCount]);

  const handleSend = useCallback(
    async (tileId: string, sessionKey: string, message: string) => {
      if (!project) return;
      const trimmed = message.trim();
      if (!trimmed) return;
      const runId = crypto.randomUUID();
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
        await client.call("chat.send", {
          sessionKey,
          message: buildProjectMessage(project, trimmed),
          deliver: false,
          idempotencyKey: runId,
        });
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
    [client, dispatch, project]
  );

  const handleModelChange = useCallback(
    async (tileId: string, sessionKey: string, value: string | null) => {
      if (!project) return;
      dispatch({
        type: "updateTile",
        projectId: project.id,
        tileId,
        patch: { model: value },
      });
      try {
        await client.call("sessions.patch", {
          key: sessionKey,
          model: value ?? null,
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
        patch: { thinkingLevel: value },
      });
      try {
        await client.call("sessions.patch", {
          key: sessionKey,
          thinkingLevel: value ?? null,
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

      const nextText = extractText(payload.message);
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
    dispatch({ type: "setCanvas", patch: { zoom: 1, offsetX: 0, offsetY: 0 } });
  }, [dispatch]);

  const handleCenterCanvas = useCallback(() => {
    dispatch({ type: "setCanvas", patch: { offsetX: 0, offsetY: 0 } });
  }, [dispatch]);

  const canvasPatch = useMemo(() => state.canvas, [state.canvas]);

  const handleProjectCreate = useCallback(async () => {
    if (!projectName.trim() || !projectPath.trim()) {
      setProjectWarnings(["Project name and path are required."]);
      return;
    }
    const result = await createProject(projectName.trim(), projectPath.trim());
    if (!result) return;
    setProjectWarnings(result.warnings);
    setProjectName("");
    setProjectPath("");
    setShowProjectForm(false);
  }, [createProject, projectName, projectPath]);

  const handleProjectDelete = useCallback(async () => {
    if (!project) return;
    const confirmed = window.confirm(`Delete project "${project.name}"?`);
    if (!confirmed) return;
    await deleteProject(project.id);
  }, [deleteProject, project]);

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
        onDeleteTile={(id) =>
          project
            ? dispatch({ type: "removeTile", projectId: project.id, tileId: id })
            : null
        }
        onRenameTile={(id, name) =>
          project
            ? dispatch({
                type: "updateTile",
                projectId: project.id,
                tileId: id,
                patch: { name },
              })
            : null
        }
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
              setShowProjectForm((prev) => !prev);
            }}
            onDeleteProject={handleProjectDelete}
            onNewAgent={handleNewAgent}
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
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Project name
                    <input
                      className="h-11 rounded-full border border-slate-300 bg-white/80 px-4 text-sm text-slate-900 outline-none"
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Repo path (absolute)
                    <input
                      className="h-11 rounded-full border border-slate-300 bg-white/80 px-4 text-sm text-slate-900 outline-none"
                      value={projectPath}
                      onChange={(event) => setProjectPath(event.target.value)}
                      placeholder="/Users/you/project"
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
