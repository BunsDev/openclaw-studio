"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
// (ReactFlowInstance import removed)
import { CanvasFlow } from "@/features/canvas/components/CanvasFlow";
import { AgentInspectPanel } from "@/features/canvas/components/AgentInspectPanel";
import { HeaderBar } from "@/features/canvas/components/HeaderBar";
import { WorkspaceSettingsPanel } from "@/features/canvas/components/WorkspaceSettingsPanel";
import { MAX_TILE_HEIGHT, MIN_TILE_SIZE } from "@/lib/canvasTileDefaults";
import { screenToWorld, worldToScreen } from "@/features/canvas/lib/transform";
import {
  extractText,
  extractThinking,
  formatThinkingMarkdown,
  isTraceMarkdown,
  extractToolLines,
} from "@/lib/text/message-extract";
import { isHeartbeatPrompt, isUiMetadataPrefix, stripUiMetadata } from "@/lib/text/message-metadata";
import { useGatewayConnection } from "@/lib/gateway/useGatewayConnection";
import type { EventFrame } from "@/lib/gateway/frames";
import type { GatewayModelChoice } from "@/lib/gateway/models";
import {
  AgentCanvasProvider,
  getActiveProject,
  useAgentCanvasStore,
} from "@/features/canvas/state/store";
import {
  type AgentEventPayload,
  type ChatEventPayload,
  getAgentSummaryPatch,
  getChatSummaryPatch,
} from "@/features/canvas/state/summary";
import {
  createProjectDiscordChannel,
  fetchProjectCleanupPreview,
  runProjectCleanup,
  fetchCronJobs,
} from "@/lib/projects/client";
import { createRandomAgentName, normalizeAgentName } from "@/lib/names/agentNames";
import { buildAgentInstruction } from "@/lib/text/message-metadata";
import { filterArchivedItems } from "@/lib/projects/archive";
import type { AgentTile, ProjectRuntime } from "@/features/canvas/state/store";
import type { CronJobSummary } from "@/lib/projects/types";
import { logger } from "@/lib/logger";
import { parseAgentIdFromSessionKey } from "@/lib/projects/sessionKey";
import { buildAvatarDataUrl } from "@/lib/avatars/multiavatar";
// (CANVAS_BASE_ZOOM import removed)

type ChatHistoryMessage = Record<string, unknown>;

type ChatHistoryResult = {
  sessionKey: string;
  sessionId?: string;
  messages: ChatHistoryMessage[];
  thinkingLevel?: string;
};

type GatewayConfigSnapshot = {
  config?: {
    agents?: {
      defaults?: {
        model?: string | { primary?: string; fallbacks?: string[] };
        models?: Record<string, { alias?: string }>;
      };
    };
  };
};

type SessionPreviewItem = {
  role: "user" | "assistant" | "tool" | "system" | "other";
  text: string;
};

type SessionsPreviewEntry = {
  key: string;
  status: "ok" | "empty" | "missing" | "error";
  items: SessionPreviewItem[];
};

type SessionsPreviewResult = {
  ts: number;
  previews: SessionsPreviewEntry[];
};

type SessionsListEntry = {
  key: string;
  updatedAt?: number | null;
  displayName?: string;
  origin?: { label?: string | null; provider?: string | null } | null;
};

type SessionsListResult = {
  sessions?: SessionsListEntry[];
};

type SessionStatusSummary = {
  key: string;
  updatedAt: number | null;
};

type StatusSummary = {
  sessions?: {
    recent?: SessionStatusSummary[];
    byAgent?: Array<{ agentId: string; recent: SessionStatusSummary[] }>;
  };
};

const SPECIAL_UPDATE_HEARTBEAT_RE = /\bheartbeat\b/i;
const SPECIAL_UPDATE_CRON_RE = /\bcron\b/i;

const resolveSpecialUpdateKind = (message: string) => {
  const lowered = message.toLowerCase();
  const heartbeatIndex = lowered.search(SPECIAL_UPDATE_HEARTBEAT_RE);
  const cronIndex = lowered.search(SPECIAL_UPDATE_CRON_RE);
  if (heartbeatIndex === -1 && cronIndex === -1) return null;
  if (heartbeatIndex === -1) return "cron";
  if (cronIndex === -1) return "heartbeat";
  return cronIndex > heartbeatIndex ? "cron" : "heartbeat";
};

const formatEveryMs = (everyMs: number) => {
  if (everyMs % 3600000 === 0) {
    return `${everyMs / 3600000}h`;
  }
  if (everyMs % 60000 === 0) {
    return `${everyMs / 60000}m`;
  }
  if (everyMs % 1000 === 0) {
    return `${everyMs / 1000}s`;
  }
  return `${everyMs}ms`;
};

const formatCronSchedule = (schedule: CronJobSummary["schedule"]) => {
  if (schedule.kind === "every") {
    return `Every ${formatEveryMs(schedule.everyMs)}`;
  }
  if (schedule.kind === "cron") {
    return schedule.tz ? `Cron: ${schedule.expr} (${schedule.tz})` : `Cron: ${schedule.expr}`;
  }
  return `At: ${new Date(schedule.atMs).toLocaleString()}`;
};

const buildCronDisplay = (job: CronJobSummary) => {
  const payloadText =
    job.payload.kind === "systemEvent" ? job.payload.text : job.payload.message;
  const lines = [job.name, formatCronSchedule(job.schedule), payloadText].filter(Boolean);
  return lines.join("\n");
};

const buildHistoryLines = (messages: ChatHistoryMessage[]) => {
  const lines: string[] = [];
  let lastAssistant: string | null = null;
  let lastRole: string | null = null;
  let lastUser: string | null = null;
  for (const message of messages) {
    const role = typeof message.role === "string" ? message.role : "other";
    const extracted = extractText(message);
    const text = stripUiMetadata(extracted?.trim() ?? "");
    const thinking =
      role === "assistant" ? formatThinkingMarkdown(extractThinking(message) ?? "") : "";
    const toolLines = extractToolLines(message);
    if (!text && !thinking && toolLines.length === 0) continue;
    if (role === "user") {
      if (text && isHeartbeatPrompt(text)) {
        continue;
      }
      if (text) {
        lines.push(`> ${text}`);
        lastUser = text;
      }
      lastRole = "user";
    } else if (role === "assistant") {
      if (thinking) {
        lines.push(thinking);
      }
      if (toolLines.length > 0) {
        lines.push(...toolLines);
      }
      if (text) {
        lines.push(text);
        lastAssistant = text;
      }
      lastRole = "assistant";
    } else if (toolLines.length > 0) {
      lines.push(...toolLines);
    } else if (text) {
      lines.push(text);
    }
  }
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }
  return { lines: deduped, lastAssistant, lastRole, lastUser };
};

const findLatestHeartbeatResponse = (messages: ChatHistoryMessage[]) => {
  let awaitingHeartbeatReply = false;
  let latestResponse: string | null = null;
  for (const message of messages) {
    const role = typeof message.role === "string" ? message.role : "";
    if (role === "user") {
      const text = stripUiMetadata(extractText(message) ?? "").trim();
      awaitingHeartbeatReply = isHeartbeatPrompt(text);
      continue;
    }
    if (role === "assistant" && awaitingHeartbeatReply) {
      const text = stripUiMetadata(extractText(message) ?? "").trim();
      if (text) {
        latestResponse = text;
      }
    }
  }
  return latestResponse;
};

const mergeHistoryWithPending = (historyLines: string[], currentLines: string[]) => {
  if (currentLines.length === 0) return historyLines;
  if (historyLines.length === 0) return historyLines;
  const merged = [...historyLines];
  let cursor = 0;
  for (const line of currentLines) {
    let foundIndex = -1;
    for (let i = cursor; i < merged.length; i += 1) {
      if (merged[i] === line) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex !== -1) {
      cursor = foundIndex + 1;
      continue;
    }
    merged.splice(cursor, 0, line);
    cursor += 1;
  }
  return merged;
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

const findTileByRunId = (
  projects: ProjectRuntime[],
  runId: string
): { projectId: string; tileId: string } | null => {
  for (const project of projects) {
    const tile = project.tiles.find((entry) => entry.runId === runId);
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
    refreshStore,
    deleteTile,
    restoreTile,
    renameTile,
    updateTile,
  } = useAgentCanvasStore();
  const activeProject = getActiveProject(state);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const historyInFlightRef = useRef<Set<string>>(new Set());
  const stateRef = useRef(state);
  const summaryRefreshRef = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [gatewayModels, setGatewayModels] = useState<GatewayModelChoice[]>([]);
  const [gatewayModelsError, setGatewayModelsError] = useState<string | null>(null);
  const [inspectTileId, setInspectTileId] = useState<string | null>(null);
  const [headerOffset, setHeaderOffset] = useState(0);
  const thinkingDebugRef = useRef<Set<string>>(new Set());
  const chatRunSeenRef = useRef<Set<string>>(new Set());
  const specialUpdateRef = useRef<Map<string, string>>(new Map());
  const specialUpdateInFlightRef = useRef<Set<string>>(new Set());
  // flowInstance removed (zoom controls live in the bottom-right ReactFlow Controls).

  const visibleProjects = useMemo(
    () => filterArchivedItems(state.projects, showArchived),
    [state.projects, showArchived]
  );
  const hasArchivedTiles = useMemo(
    () => state.projects.some((entry) => entry.tiles.some((tile) => tile.archivedAt)),
    [state.projects]
  );
  const project = useMemo(() => {
    if (activeProject && (showArchived || !activeProject.archivedAt)) {
      return activeProject;
    }
    return visibleProjects[0] ?? null;
  }, [activeProject, showArchived, visibleProjects]);
  const tiles = useMemo(
    () => filterArchivedItems(project?.tiles ?? [], showArchived),
    [project?.tiles, showArchived]
  );
  const faviconSeed = useMemo(() => {
    const firstTile = project?.tiles[0];
    const seed = firstTile?.avatarSeed ?? firstTile?.agentId ?? "";
    return seed.trim() || null;
  }, [project?.tiles]);
  const faviconHref = useMemo(
    () => (faviconSeed ? buildAvatarDataUrl(faviconSeed) : null),
    [faviconSeed]
  );
  const workspacePath = project?.repoPath?.trim() ?? "";
  const needsWorkspace = state.needsWorkspace || !workspacePath;
  const inspectTile = useMemo(() => {
    if (!inspectTileId || !project) return null;
    return project.tiles.find((entry) => entry.id === inspectTileId) ?? null;
  }, [inspectTileId, project]);
  const errorMessage = state.error ?? gatewayModelsError;

  useEffect(() => {
    const selector = 'link[data-agent-favicon="true"]';
    const existing = document.querySelector(selector) as HTMLLinkElement | null;
    if (!faviconHref) {
      existing?.remove();
      return;
    }
    if (existing) {
      if (existing.href !== faviconHref) {
        existing.href = faviconHref;
      }
      return;
    }
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = faviconHref;
    link.setAttribute("data-agent-favicon", "true");
    document.head.appendChild(link);
  }, [faviconHref]);

  const resolveConfiguredModelKey = useCallback(
    (raw: string, models?: Record<string, { alias?: string }>) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      if (trimmed.includes("/")) return trimmed;
      if (models) {
        const target = Object.entries(models).find(
          ([, entry]) => entry?.alias?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (target?.[0]) return target[0];
      }
      return `anthropic/${trimmed}`;
    },
    []
  );

  const buildAllowedModelKeys = useCallback(
    (snapshot: GatewayConfigSnapshot | null) => {
      const allowedList: string[] = [];
      const allowedSet = new Set<string>();
      const defaults = snapshot?.config?.agents?.defaults;
      const modelDefaults = defaults?.model;
      const modelAliases = defaults?.models;
      const pushKey = (raw?: string | null) => {
        if (!raw) return;
        const resolved = resolveConfiguredModelKey(raw, modelAliases);
        if (!resolved) return;
        if (allowedSet.has(resolved)) return;
        allowedSet.add(resolved);
        allowedList.push(resolved);
      };
      if (typeof modelDefaults === "string") {
        pushKey(modelDefaults);
      } else if (modelDefaults && typeof modelDefaults === "object") {
        pushKey(modelDefaults.primary ?? null);
        for (const fallback of modelDefaults.fallbacks ?? []) {
          pushKey(fallback);
        }
      }
      if (modelAliases) {
        for (const key of Object.keys(modelAliases)) {
          pushKey(key);
        }
      }
      return allowedList;
    },
    [resolveConfiguredModelKey]
  );

  const summarizeThinkingMessage = useCallback((message: unknown) => {
    if (!message || typeof message !== "object") {
      return { type: typeof message };
    }
    const record = message as Record<string, unknown>;
    const summary: Record<string, unknown> = { keys: Object.keys(record) };
    const content = record.content;
    if (Array.isArray(content)) {
      summary.contentTypes = content.map((item) => {
        if (item && typeof item === "object") {
          const entry = item as Record<string, unknown>;
          return typeof entry.type === "string" ? entry.type : "object";
        }
        return typeof item;
      });
    } else if (typeof content === "string") {
      summary.contentLength = content.length;
    }
    if (typeof record.text === "string") {
      summary.textLength = record.text.length;
    }
    for (const key of ["analysis", "reasoning", "thinking"]) {
      const value = record[key];
      if (typeof value === "string") {
        summary[`${key}Length`] = value.length;
      } else if (value && typeof value === "object") {
        summary[`${key}Keys`] = Object.keys(value as Record<string, unknown>);
      }
    }
    return summary;
  }, []);

  const resolveCronJobForTile = useCallback((jobs: CronJobSummary[], tile: AgentTile) => {
    if (!jobs.length) return null;
    const agentId = tile.agentId?.trim();
    const filtered = agentId ? jobs.filter((job) => job.agentId === agentId) : jobs;
    const active = filtered.length > 0 ? filtered : jobs;
    return [...active].sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0] ?? null;
  }, []);

  const updateSpecialLatestUpdate = useCallback(
    async (projectId: string, tile: AgentTile, message: string) => {
      const key = `${projectId}:${tile.id}`;
      const kind = resolveSpecialUpdateKind(message);
      if (!kind) {
        if (tile.latestOverride || tile.latestOverrideKind) {
          dispatch({
            type: "updateTile",
            projectId,
            tileId: tile.id,
            patch: { latestOverride: null, latestOverrideKind: null },
          });
        }
        return;
      }
      if (specialUpdateInFlightRef.current.has(key)) return;
      specialUpdateInFlightRef.current.add(key);
      try {
        if (kind === "heartbeat") {
          const agentId = tile.agentId?.trim() || parseAgentIdFromSessionKey(tile.sessionKey);
          if (!agentId) {
            dispatch({
              type: "updateTile",
              projectId,
              tileId: tile.id,
              patch: { latestOverride: null, latestOverrideKind: null },
            });
            return;
          }
          const sessions = await client.call<SessionsListResult>("sessions.list", {
            agentId,
            includeGlobal: false,
            includeUnknown: false,
            limit: 48,
          });
          const entries = Array.isArray(sessions.sessions) ? sessions.sessions : [];
          const heartbeatSessions = entries.filter((entry) => {
            const label = entry.origin?.label;
            return typeof label === "string" && label.toLowerCase() === "heartbeat";
          });
          const candidates = heartbeatSessions.length > 0 ? heartbeatSessions : entries;
          const sorted = [...candidates].sort(
            (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
          );
          const sessionKey = sorted[0]?.key;
          if (!sessionKey) {
            dispatch({
              type: "updateTile",
              projectId,
              tileId: tile.id,
              patch: { latestOverride: null, latestOverrideKind: null },
            });
            return;
          }
          const history = await client.call<ChatHistoryResult>("chat.history", {
            sessionKey,
            limit: 200,
          });
          const content = findLatestHeartbeatResponse(history.messages ?? []) ?? "";
          dispatch({
            type: "updateTile",
            projectId,
            tileId: tile.id,
            patch: {
              latestOverride: content || null,
              latestOverrideKind: content ? "heartbeat" : null,
            },
          });
          return;
        }
        const cronResult = await fetchCronJobs();
        const job = resolveCronJobForTile(cronResult.jobs, tile);
        const content = job ? buildCronDisplay(job) : "";
        dispatch({
          type: "updateTile",
          projectId,
          tileId: tile.id,
          patch: {
            latestOverride: content || null,
            latestOverrideKind: content ? "cron" : null,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load latest cron/heartbeat update.";
        logger.error(message);
      } finally {
        specialUpdateInFlightRef.current.delete(key);
      }
    },
    [client, dispatch, resolveCronJobForTile]
  );

  const refreshHeartbeatLatestUpdate = useCallback(() => {
    const projects = stateRef.current.projects;
    for (const project of projects) {
      for (const tile of project.tiles) {
        void updateSpecialLatestUpdate(project.id, tile, "heartbeat");
      }
    }
  }, [updateSpecialLatestUpdate]);

  const computeNewTilePosition = useCallback(
    (tileSize: { width: number; height: number }) => {
      if (!project) {
        return { x: 80, y: 200 };
      }

      if (viewportSize.width === 0 || viewportSize.height === 0) {
        const offset = project.tiles.length * 36;
        return { x: 80 + offset, y: 200 + offset };
      }

      const safeTop = 140;
      const edgePadding = 24;
      const step = 80;
      const maxRings = 12;
      const zoom = state.canvas.zoom;

      const effectiveSize = {
        width: Math.max(tileSize.width, MIN_TILE_SIZE.width),
        height: Math.max(tileSize.height, MIN_TILE_SIZE.height),
      };

      const minCenterY = safeTop + (effectiveSize.height * zoom) / 2;
      const screenCenter = {
        x: viewportSize.width / 2,
        y: Math.max(viewportSize.height / 2, minCenterY),
      };
      const worldCenter = screenToWorld(state.canvas, screenCenter);
      const base = {
        x: worldCenter.x - effectiveSize.width / 2,
        y: worldCenter.y - effectiveSize.height / 2,
      };

      const rectsOverlap = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number },
        padding = 0
      ) => {
        const ax = a.x - padding;
        const ay = a.y - padding;
        const aw = a.width + padding * 2;
        const ah = a.height + padding * 2;
        const bx = b.x;
        const by = b.y;
        const bw = b.width;
        const bh = b.height;
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
      };

      const candidateFits = (candidate: { x: number; y: number }) => {
        const screen = worldToScreen(state.canvas, candidate);
        const tileWidth = effectiveSize.width * zoom;
        const tileHeight = effectiveSize.height * zoom;
        return (
          screen.x >= edgePadding &&
          screen.y >= safeTop &&
          screen.x + tileWidth <= viewportSize.width - edgePadding &&
          screen.y + tileHeight <= viewportSize.height - edgePadding
        );
      };

      const candidateOverlaps = (candidate: { x: number; y: number }) => {
        const rect = {
          x: candidate.x,
          y: candidate.y,
          width: effectiveSize.width,
          height: effectiveSize.height,
        };
        return project.tiles.some((tile) =>
          rectsOverlap(
            rect,
            {
              x: tile.position.x,
              y: tile.position.y,
              width: Math.max(tile.size.width, MIN_TILE_SIZE.width),
              height: Math.max(tile.size.height, MIN_TILE_SIZE.height),
            },
            24
          )
        );
      };

      for (let ring = 0; ring <= maxRings; ring += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          for (let dy = -ring; dy <= ring; dy += 1) {
            if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) {
              continue;
            }
            const candidate = {
              x: base.x + dx * step,
              y: base.y + dy * step,
            };
            if (!candidateFits(candidate)) continue;
            if (!candidateOverlaps(candidate)) return candidate;
          }
        }
      }

      return base;
    },
    [project, state.canvas, viewportSize]
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const update = () => {
      setHeaderOffset(node.offsetHeight || 0);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inspectTileId) return;
    if (state.selectedTileId && state.selectedTileId !== inspectTileId) {
      setInspectTileId(null);
    }
  }, [inspectTileId, state.selectedTileId]);

  useEffect(() => {
    if (inspectTileId && !inspectTile) {
      setInspectTileId(null);
    }
  }, [inspectTileId, inspectTile]);

  useEffect(() => {
    if (status !== "connected") {
      setGatewayModels([]);
      setGatewayModelsError(null);
      return;
    }
    let cancelled = false;
    const loadModels = async () => {
      let configSnapshot: GatewayConfigSnapshot | null = null;
      try {
        configSnapshot = await client.call<GatewayConfigSnapshot>("config.get", {});
      } catch (err) {
        logger.error("Failed to load gateway config.", err);
      }
      try {
        const result = await client.call<{ models: GatewayModelChoice[] }>(
          "models.list",
          {}
        );
        if (cancelled) return;
        const catalog = Array.isArray(result.models) ? result.models : [];
        const allowedKeys = buildAllowedModelKeys(configSnapshot);
        if (allowedKeys.length === 0) {
          setGatewayModels(catalog);
          setGatewayModelsError(null);
          return;
        }
        const filtered = catalog.filter((entry) =>
          allowedKeys.includes(`${entry.provider}/${entry.id}`)
        );
        const filteredKeys = new Set(
          filtered.map((entry) => `${entry.provider}/${entry.id}`)
        );
        const extras: GatewayModelChoice[] = [];
        for (const key of allowedKeys) {
          if (filteredKeys.has(key)) continue;
          const [provider, id] = key.split("/");
          if (!provider || !id) continue;
          extras.push({ provider, id, name: key });
        }
        setGatewayModels([...filtered, ...extras]);
        setGatewayModelsError(null);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load models.";
        setGatewayModelsError(message);
        setGatewayModels([]);
        logger.error("Failed to load gateway models.", err);
      }
    };
    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [buildAllowedModelKeys, client, status]);

  const loadSummarySnapshot = useCallback(async () => {
    const projects = stateRef.current.projects;
    const tiles = projects.flatMap((entry) => entry.tiles);
    const sessionKeys = Array.from(
      new Set(
        tiles
          .map((tile) => tile.sessionKey)
          .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
      )
    ).slice(0, 64);
    if (sessionKeys.length === 0) return;
    try {
      const [statusSummary, previewResult] = await Promise.all([
        client.call<StatusSummary>("status", {}),
        client.call<SessionsPreviewResult>("sessions.preview", {
          keys: sessionKeys,
          limit: 8,
          maxChars: 240,
        }),
      ]);
      const previewMap = new Map<string, SessionsPreviewEntry>();
      for (const entry of previewResult.previews ?? []) {
        previewMap.set(entry.key, entry);
      }
      const activityByKey = new Map<string, number>();
      const addActivity = (entries?: SessionStatusSummary[]) => {
        if (!entries) return;
        for (const entry of entries) {
          if (!entry?.key || typeof entry.updatedAt !== "number") continue;
          activityByKey.set(entry.key, entry.updatedAt);
        }
      };
      addActivity(statusSummary.sessions?.recent);
      for (const group of statusSummary.sessions?.byAgent ?? []) {
        addActivity(group.recent);
      }
      for (const project of projects) {
        for (const tile of project.tiles) {
          const patch: Partial<AgentTile> = {};
          const activity = activityByKey.get(tile.sessionKey);
          if (typeof activity === "number") {
            patch.lastActivityAt = activity;
          }
          const preview = previewMap.get(tile.sessionKey);
          if (preview?.items?.length) {
            const lastAssistant = [...preview.items]
              .reverse()
              .find((item) => item.role === "assistant");
            const lastUser = [...preview.items]
              .reverse()
              .find((item) => item.role === "user");
            if (lastAssistant?.text) {
              const cleaned = stripUiMetadata(lastAssistant.text);
              patch.latestPreview = cleaned;
            }
            if (lastUser?.text) {
              patch.lastUserMessage = stripUiMetadata(lastUser.text);
            }
          }
          if (Object.keys(patch).length > 0) {
            dispatch({
              type: "updateTile",
              projectId: project.id,
              tileId: tile.id,
              patch,
            });
          }
        }
      }
    } catch (err) {
      logger.error("Failed to load summary snapshot.", err);
    }
  }, [client, dispatch]);

  useEffect(() => {
    if (status !== "connected") return;
    void loadSummarySnapshot();
  }, [loadSummarySnapshot, status]);

  useEffect(() => {
    if (status !== "connected") return;
    const unsubscribe = client.onEvent((event: EventFrame) => {
      if (event.event !== "presence" && event.event !== "heartbeat") return;
      if (event.event === "heartbeat") {
        setHeartbeatTick((prev) => prev + 1);
        refreshHeartbeatLatestUpdate();
      }
      if (summaryRefreshRef.current !== null) {
        window.clearTimeout(summaryRefreshRef.current);
      }
      summaryRefreshRef.current = window.setTimeout(() => {
        summaryRefreshRef.current = null;
        void loadSummarySnapshot();
      }, 750);
    });
    return () => {
      if (summaryRefreshRef.current !== null) {
        window.clearTimeout(summaryRefreshRef.current);
        summaryRefreshRef.current = null;
      }
      unsubscribe();
    };
  }, [client, loadSummarySnapshot, status]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setViewportSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (showArchived) return;
    if (activeProject && activeProject.archivedAt) {
      const fallback = state.projects.find((entry) => !entry.archivedAt) ?? null;
      if ((fallback?.id ?? null) !== state.activeProjectId) {
        dispatch({ type: "setActiveProject", projectId: fallback?.id ?? null });
      }
    }
  }, [activeProject, dispatch, showArchived, state.activeProjectId, state.projects]);

  useEffect(() => {
    if (!state.selectedTileId) return;
    if (tiles.some((tile) => tile.id === state.selectedTileId)) return;
    dispatch({ type: "selectTile", tileId: null });
  }, [dispatch, state.selectedTileId, tiles]);

  useEffect(() => {
    for (const project of state.projects) {
      for (const tile of project.tiles) {
        const lastMessage = tile.lastUserMessage?.trim() ?? "";
        const kind = resolveSpecialUpdateKind(lastMessage);
        const key = `${project.id}:${tile.id}`;
        const marker = kind === "heartbeat" ? `${lastMessage}:${heartbeatTick}` : lastMessage;
        const previous = specialUpdateRef.current.get(key);
        if (previous === marker) continue;
        specialUpdateRef.current.set(key, marker);
        void updateSpecialLatestUpdate(project.id, tile, lastMessage);
      }
    }
  }, [heartbeatTick, state.projects, updateSpecialLatestUpdate]);

  const handleNewAgent = useCallback(async () => {
    if (!project || project.archivedAt) return;
    if (needsWorkspace) {
      setShowWorkspaceSettings(true);
      return;
    }
    const name = createRandomAgentName();
    const result = await createTile(project.id, name, "coding");
    if (!result) return;

    const nextPosition = computeNewTilePosition(result.tile.size);
    dispatch({
      type: "updateTile",
      projectId: project.id,
      tileId: result.tile.id,
      patch: { position: nextPosition },
    });
    dispatch({ type: "selectTile", tileId: result.tile.id });
  }, [computeNewTilePosition, createTile, dispatch, needsWorkspace, project]);

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
      const loadedAt = Date.now();
      try {
        const result = await client.call<ChatHistoryResult>("chat.history", {
          sessionKey,
          limit: 200,
        });
        const { lines, lastAssistant, lastRole, lastUser } = buildHistoryLines(
          result.messages ?? []
        );
        if (lines.length === 0) {
          dispatch({
            type: "updateTile",
            projectId,
            tileId,
            patch: { historyLoadedAt: loadedAt },
          });
          return;
        }
        const currentLines = tile.outputLines;
        const mergedLines = mergeHistoryWithPending(lines, currentLines);
        const isSame =
          mergedLines.length === currentLines.length &&
          mergedLines.every((line, index) => line === currentLines[index]);
        if (isSame) {
          const patch: Partial<AgentTile> = { historyLoadedAt: loadedAt };
          if (!tile.runId && tile.status === "running" && lastRole === "assistant") {
            patch.status = "idle";
            patch.runId = null;
            patch.streamText = null;
            patch.thinkingTrace = null;
          }
          dispatch({
            type: "updateTile",
            projectId,
            tileId,
            patch,
          });
          return;
        }
        const patch: Partial<AgentTile> = {
          outputLines: mergedLines,
          lastResult: lastAssistant ?? null,
          ...(lastAssistant ? { latestPreview: lastAssistant } : {}),
          ...(lastUser ? { lastUserMessage: lastUser } : {}),
          historyLoadedAt: loadedAt,
        };
        if (!tile.runId && tile.status === "running" && lastRole === "assistant") {
          patch.status = "idle";
          patch.runId = null;
          patch.streamText = null;
          patch.thinkingTrace = null;
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

  const handleLoadHistory = useCallback(
    async (tileId: string) => {
      if (!project) return;
      await loadTileHistory(project.id, tileId);
    },
    [loadTileHistory, project]
  );

  const handleInspectTile = useCallback(
    (tileId: string) => {
      setInspectTileId(tileId);
      dispatch({ type: "selectTile", tileId });
    },
    [dispatch]
  );

  const shouldAutoLoadHistory = useCallback((tile: AgentTile) => {
    if (!tile.sessionKey?.trim()) return false;
    return !tile.historyLoadedAt;
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    if (!project) return;
    for (const tile of tiles) {
      if (!shouldAutoLoadHistory(tile)) continue;
      void loadTileHistory(project.id, tile.id);
    }
  }, [loadTileHistory, project, shouldAutoLoadHistory, status, tiles]);

  const handleSend = useCallback(
    async (tileId: string, sessionKey: string, message: string) => {
      if (!project) return;
      if (needsWorkspace) {
        window.alert("Set a workspace path before sending instructions.");
        return;
      }
      const trimmed = message.trim();
      if (!trimmed) return;
      const isResetCommand = /^\/(reset|new)(\s|$)/i.test(trimmed);
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
      if (isResetCommand) {
        dispatch({
          type: "updateTile",
          projectId: project.id,
          tileId,
          patch: { outputLines: [], streamText: null, thinkingTrace: null, lastResult: null },
        });
      }
      dispatch({
        type: "updateTile",
        projectId: project.id,
        tileId,
        patch: {
          status: "running",
          runId,
          streamText: "",
          thinkingTrace: null,
          draft: "",
          lastUserMessage: trimmed,
          lastActivityAt: Date.now(),
        },
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
          message: buildAgentInstruction({
            workspacePath: tile.workspacePath,
            message: trimmed,
          }),
          deliver: false,
          idempotencyKey: runId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gateway error";
        dispatch({
          type: "updateTile",
          projectId: project.id,
          tileId,
          patch: { status: "error", runId: null, streamText: null, thinkingTrace: null },
        });
        dispatch({
          type: "appendOutput",
          projectId: project.id,
          tileId,
          line: `Error: ${msg}`,
        });
      }
    },
    [client, dispatch, needsWorkspace, project]
  );

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
      if (payload.runId) {
        chatRunSeenRef.current.add(payload.runId);
      }
      const match = findTileBySessionKey(state.projects, payload.sessionKey);
      if (!match) return;

      const project = state.projects.find((entry) => entry.id === match.projectId);
      const tile = project?.tiles.find((entry) => entry.id === match.tileId);
      const summaryPatch = getChatSummaryPatch(payload);
      if (summaryPatch) {
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: summaryPatch,
        });
      }
      const role =
        payload.message && typeof payload.message === "object"
          ? (payload.message as Record<string, unknown>).role
          : null;
      if (role === "user") {
        return;
      }
      const nextTextRaw = extractText(payload.message);
      const nextText = nextTextRaw ? stripUiMetadata(nextTextRaw) : null;
      const nextThinking = extractThinking(payload.message ?? payload);
      const toolLines = extractToolLines(payload.message ?? payload);
      const isToolRole = role === "tool" || role === "toolResult";
      if (payload.state === "delta") {
        if (typeof nextTextRaw === "string" && isUiMetadataPrefix(nextTextRaw.trim())) {
          return;
        }
        if (nextThinking) {
          dispatch({
            type: "updateTile",
            projectId: match.projectId,
            tileId: match.tileId,
            patch: { thinkingTrace: nextThinking, status: "running" },
          });
        }
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
        if (payload.runId) {
          chatRunSeenRef.current.delete(payload.runId);
        }
        if (
          !nextThinking &&
          role === "assistant" &&
          !thinkingDebugRef.current.has(payload.sessionKey)
        ) {
          thinkingDebugRef.current.add(payload.sessionKey);
          console.warn("No thinking trace extracted from chat event.", {
            sessionKey: payload.sessionKey,
            message: summarizeThinkingMessage(payload.message ?? payload),
          });
        }
        const thinkingText = nextThinking ?? tile?.thinkingTrace ?? null;
        const thinkingLine = thinkingText ? formatThinkingMarkdown(thinkingText) : "";
        if (thinkingLine) {
          dispatch({
            type: "appendOutput",
            projectId: match.projectId,
            tileId: match.tileId,
            line: thinkingLine,
          });
        }
        if (toolLines.length > 0) {
          for (const line of toolLines) {
            dispatch({
              type: "appendOutput",
              projectId: match.projectId,
              tileId: match.tileId,
              line,
            });
          }
        }
        if (
          !thinkingLine &&
          role === "assistant" &&
          tile &&
          !tile.outputLines.some((line) => isTraceMarkdown(line.trim()))
        ) {
          void loadTileHistory(match.projectId, match.tileId);
        }
        if (!isToolRole && typeof nextText === "string") {
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
        if (tile?.lastUserMessage && !tile.latestOverride) {
          void updateSpecialLatestUpdate(match.projectId, tile, tile.lastUserMessage);
        }
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: { streamText: null, thinkingTrace: null },
        });
        return;
      }

      if (payload.state === "aborted") {
        if (payload.runId) {
          chatRunSeenRef.current.delete(payload.runId);
        }
        dispatch({
          type: "appendOutput",
          projectId: match.projectId,
          tileId: match.tileId,
          line: "Run aborted.",
        });
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: { streamText: null, thinkingTrace: null },
        });
        return;
      }

      if (payload.state === "error") {
        if (payload.runId) {
          chatRunSeenRef.current.delete(payload.runId);
        }
        dispatch({
          type: "appendOutput",
          projectId: match.projectId,
          tileId: match.tileId,
          line: payload.errorMessage ? `Error: ${payload.errorMessage}` : "Run error.",
        });
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: { streamText: null, thinkingTrace: null },
        });
      }
    });
  }, [
    client,
    dispatch,
    loadTileHistory,
    state.projects,
    summarizeThinkingMessage,
    updateSpecialLatestUpdate,
  ]);

  useEffect(() => {
    return client.onEvent((event: EventFrame) => {
      if (event.event !== "agent") return;
      const payload = event.payload as AgentEventPayload | undefined;
      if (!payload?.runId) return;
      const directMatch = payload.sessionKey
        ? findTileBySessionKey(state.projects, payload.sessionKey)
        : null;
      const match = directMatch ?? findTileByRunId(state.projects, payload.runId);
      if (!match) return;
      const project = state.projects.find((entry) => entry.id === match.projectId);
      const tile = project?.tiles.find((entry) => entry.id === match.tileId);
      if (!tile) return;
      const stream = typeof payload.stream === "string" ? payload.stream : "";
      const data =
        payload.data && typeof payload.data === "object"
          ? (payload.data as Record<string, unknown>)
          : null;
      const hasChatEvents = chatRunSeenRef.current.has(payload.runId);
      if (stream === "assistant" && !hasChatEvents) {
        const rawText = typeof data?.text === "string" ? data.text : "";
        const rawDelta = typeof data?.delta === "string" ? data.delta : "";
        const nextRaw = rawText || rawDelta;
        if (!nextRaw) return;
        if (isUiMetadataPrefix(nextRaw.trim())) return;
        const cleaned = stripUiMetadata(nextRaw);
        if (!cleaned) return;
        dispatch({
          type: "setStream",
          projectId: match.projectId,
          tileId: match.tileId,
          value: cleaned,
        });
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: { status: "running", runId: payload.runId, lastActivityAt: Date.now() },
        });
        return;
      }
      if (stream === "tool" && !hasChatEvents) {
        const phase = typeof data?.phase === "string" ? data.phase : "";
        if (phase !== "result") return;
        const name = typeof data?.name === "string" ? data.name : "tool";
        const toolCallId = typeof data?.toolCallId === "string" ? data.toolCallId : "";
        const result = data?.result;
        const isError = typeof data?.isError === "boolean" ? data.isError : undefined;
        const resultRecord =
          result && typeof result === "object" ? (result as Record<string, unknown>) : null;
        const details =
          resultRecord && "details" in resultRecord ? resultRecord.details : undefined;
        let content: unknown = result;
        if (resultRecord) {
          if (Array.isArray(resultRecord.content)) {
            content = resultRecord.content;
          } else if (typeof resultRecord.text === "string") {
            content = resultRecord.text;
          }
        }
        const message = {
          role: "tool",
          toolName: name,
          toolCallId,
          isError,
          details,
          content,
        };
        for (const line of extractToolLines(message)) {
          dispatch({
            type: "appendOutput",
            projectId: match.projectId,
            tileId: match.tileId,
            line,
          });
        }
        return;
      }
      if (stream !== "lifecycle") return;
      const summaryPatch = getAgentSummaryPatch(payload);
      if (!summaryPatch) return;
      const phase = typeof data?.phase === "string" ? data.phase : "";
      if (phase === "start") {
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: {
            status: "running",
            runId: payload.runId,
            lastActivityAt: summaryPatch.lastActivityAt ?? null,
          },
        });
        return;
      }
      if (phase === "end") {
        if (tile.runId && tile.runId !== payload.runId) return;
        if (!hasChatEvents) {
          const finalText = tile.streamText?.trim();
          if (finalText) {
            dispatch({
              type: "appendOutput",
              projectId: match.projectId,
              tileId: match.tileId,
              line: finalText,
            });
            dispatch({
              type: "updateTile",
              projectId: match.projectId,
              tileId: match.tileId,
              patch: { lastResult: finalText },
            });
          }
        }
        chatRunSeenRef.current.delete(payload.runId);
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: {
            status: "idle",
            runId: null,
            streamText: null,
            thinkingTrace: null,
            lastActivityAt: summaryPatch.lastActivityAt ?? null,
          },
        });
        return;
      }
      if (phase === "error") {
        if (tile.runId && tile.runId !== payload.runId) return;
        chatRunSeenRef.current.delete(payload.runId);
        dispatch({
          type: "updateTile",
          projectId: match.projectId,
          tileId: match.tileId,
          patch: {
            status: "error",
            runId: null,
            streamText: null,
            thinkingTrace: null,
            lastActivityAt: summaryPatch.lastActivityAt ?? null,
          },
        });
      }
    });
  }, [client, dispatch, state.projects]);

  // Zoom controls are available in the bottom-right of the canvas.

  const handleOpenWorkspaceSettings = useCallback(() => {
    setShowWorkspaceSettings(true);
  }, []);

  const handleWorkspaceSettingsSaved = useCallback(async () => {
    setShowWorkspaceSettings(false);
    await refreshStore();
  }, [refreshStore]);

  const handleCleanupArchived = useCallback(async () => {
    try {
      const preview = await fetchProjectCleanupPreview();
      if (preview.items.length === 0) {
        window.alert("No archived agents to clean.");
        return;
      }
      const confirmation = window.confirm(
        `Remove ${preview.items.length} archived agents?`
      );
      if (!confirmation) return;
      const result = await runProjectCleanup({
        tileIds: preview.items.map((item) => item.tileId),
      });
      dispatch({ type: "loadStore", store: result.store });
      if (result.warnings.length) {
        window.alert(result.warnings.join("\n"));
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to clean archived agents.";
      window.alert(message);
    }
  }, [dispatch]);

  const handleCreateDiscordChannel = useCallback(async () => {
    if (!project || project.archivedAt) return;
    if (needsWorkspace) {
      window.alert("Set a workspace path first.");
      return;
    }
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
  }, [needsWorkspace, project, state.selectedTileId]);

  const handleTileDelete = useCallback(
    async (tileId: string) => {
      if (!project) return;
      const tile = project.tiles.find((entry) => entry.id === tileId);
      if (!tile) return;
      const result = tile.archivedAt
        ? await restoreTile(project.id, tileId)
        : await deleteTile(project.id, tileId);
      if (!tile.archivedAt && inspectTileId === tileId) {
        setInspectTileId(null);
      }
      if (result?.warnings.length) {
        window.alert(result.warnings.join("\n"));
      }
    },
    [deleteTile, inspectTileId, project, restoreTile]
  );

  const handleAvatarShuffle = useCallback(
    async (tileId: string) => {
      if (!project) return;
      const avatarSeed = crypto.randomUUID();
      const result = await updateTile(project.id, tileId, { avatarSeed });
      if (!result) return;
      if ("error" in result) {
        window.alert(result.error);
        return;
      }
      if (result.warnings.length > 0) {
        window.alert(result.warnings.join("\n"));
      }
    },
    [project, updateTile]
  );

  const handleNameShuffle = useCallback(
    async (tileId: string) => {
      if (!project) return;
      const name = createRandomAgentName();
      const result = await renameTile(project.id, tileId, normalizeAgentName(name));
      if (!result) return;
      if ("error" in result) {
        window.alert(result.error);
        return;
      }
      if (result.warnings.length > 0) {
        window.alert(result.warnings.join("\n"));
      }
    },
    [project, renameTile]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <CanvasFlow
        tiles={tiles}
        transform={state.canvas}
        viewportRef={viewportRef}
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
                patch: {
                  size: {
                    height: Math.min(
                      MAX_TILE_HEIGHT,
                      Math.max(size.height, MIN_TILE_SIZE.height)
                    ),
                    width: Math.max(size.width, MIN_TILE_SIZE.width),
                  },
                },
              })
            : null
        }
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
        onAvatarShuffle={handleAvatarShuffle}
        onNameShuffle={handleNameShuffle}
        onInspectTile={handleInspectTile}
        onUpdateTransform={(patch) => dispatch({ type: "setCanvas", patch })}
      />

      {inspectTile && project ? (
        <div
          style={
            {
              "--header-offset": `${headerOffset}px`,
            } as CSSProperties
          }
        >
          <AgentInspectPanel
            key={inspectTile.id}
            tile={inspectTile}
            projectId={project.id}
            models={gatewayModels}
            onClose={() => setInspectTileId(null)}
            onLoadHistory={() => handleLoadHistory(inspectTile.id)}
            onModelChange={(value) =>
              handleModelChange(inspectTile.id, inspectTile.sessionKey, value)
            }
            onThinkingChange={(value) =>
              handleThinkingChange(inspectTile.id, inspectTile.sessionKey, value)
            }
            onDelete={() => handleTileDelete(inspectTile.id)}
          />
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-4 p-6">
        <div ref={headerRef} className="pointer-events-auto mx-auto w-full max-w-4xl">
            <HeaderBar
            workspaceLabel={project?.name?.trim() ? project.name : "Workspace"}
            workspacePath={workspacePath || null}
            hasArchivedTiles={hasArchivedTiles}
            status={status}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived((prev) => !prev)}
            onNewAgent={handleNewAgent}
            canCreateAgent={Boolean(project && !project.archivedAt && !needsWorkspace)}
            onWorkspaceSettings={handleOpenWorkspaceSettings}
            onCreateDiscordChannel={handleCreateDiscordChannel}
            canCreateDiscordChannel={Boolean(
              project && tiles.length > 0 && !project.archivedAt && !needsWorkspace
            )}
            onCleanupArchived={handleCleanupArchived}
            canCleanupArchived={hasArchivedTiles}
          />
        </div>

        {state.loading ? (
          <div className="pointer-events-auto mx-auto w-full max-w-4xl">
            <div className="glass-panel px-6 py-6 text-muted-foreground">
              Loading workspace…
            </div>
          </div>
        ) : null}

        {showWorkspaceSettings ? (
          <div className="pointer-events-auto mx-auto w-full max-w-5xl">
            <WorkspaceSettingsPanel
              onClose={() => setShowWorkspaceSettings(false)}
              onSaved={handleWorkspaceSettingsSaved}
            />
          </div>
        ) : null}

        {errorMessage ? (
          <div className="pointer-events-auto mx-auto w-full max-w-4xl">
            <div className="rounded-lg border border-destructive bg-destructive px-4 py-2 text-sm text-destructive-foreground">
              {errorMessage}
            </div>
          </div>
        ) : null}

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
