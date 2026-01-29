import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import {
  loadClawdbotConfig,
  readAgentList,
  saveClawdbotConfig,
  type AgentEntry,
  writeAgentList,
} from "@/lib/clawdbot/config";
import { resolveProjectTile } from "@/lib/projects/resolve";
import type {
  ProjectTileHeartbeat,
  ProjectTileHeartbeatUpdatePayload,
} from "@/lib/projects/types";
import { loadStore } from "../../../../store";

export const runtime = "nodejs";

type HeartbeatBlock = Record<string, unknown> | null | undefined;


type HeartbeatResolved = {
  heartbeat: ProjectTileHeartbeat;
  hasOverride: boolean;
};

const DEFAULT_EVERY = "30m";
const DEFAULT_TARGET = "last";
const DEFAULT_ACK_MAX_CHARS = 300;

const coerceString = (value: unknown) => (typeof value === "string" ? value : undefined);

const coerceBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : undefined;

const coerceNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const coerceActiveHours = (value: unknown) => {
  if (!value || typeof value !== "object") return undefined;
  const start = coerceString((value as Record<string, unknown>).start);
  const end = coerceString((value as Record<string, unknown>).end);
  if (!start || !end) return undefined;
  return { start, end };
};

const mergeHeartbeat = (defaults: HeartbeatBlock, override: HeartbeatBlock) => {
  const merged = {
    ...(defaults ?? {}),
    ...(override ?? {}),
  } as Record<string, unknown>;
  if (override && typeof override === "object" && "activeHours" in override) {
    merged.activeHours = (override as Record<string, unknown>).activeHours;
  } else if (defaults && typeof defaults === "object" && "activeHours" in defaults) {
    merged.activeHours = (defaults as Record<string, unknown>).activeHours;
  }
  return merged;
};

const normalizeHeartbeat = (defaults: HeartbeatBlock, override: HeartbeatBlock) => {
  const resolved = mergeHeartbeat(defaults, override);
  const every = coerceString(resolved.every) ?? DEFAULT_EVERY;
  const target = coerceString(resolved.target) ?? DEFAULT_TARGET;
  const includeReasoning = coerceBoolean(resolved.includeReasoning) ?? false;
  const ackMaxChars =
    coerceNumber(resolved.ackMaxChars) ?? DEFAULT_ACK_MAX_CHARS;
  const activeHours = coerceActiveHours(resolved.activeHours) ?? null;
  return {
    heartbeat: {
      every,
      target,
      includeReasoning,
      ackMaxChars,
      activeHours,
    },
    hasOverride: Boolean(override && typeof override === "object"),
  } satisfies HeartbeatResolved;
};

const readHeartbeatDefaults = (config: Record<string, unknown>): HeartbeatBlock => {
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
  return (defaults.heartbeat ?? null) as HeartbeatBlock;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; tileId: string }> }
) {
  try {
    const { projectId, tileId } = await context.params;
    const store = loadStore();
    const resolved = resolveProjectTile(store, projectId, tileId);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error.message },
        { status: resolved.error.status }
      );
    }
    const { tile } = resolved;
    const { config } = loadClawdbotConfig();
    const list = readAgentList(config);
    const entry = list.find((item) => item.id === tile.agentId) ?? null;
    const defaults = readHeartbeatDefaults(config);
    const override =
      entry && typeof entry === "object"
        ? ((entry as Record<string, unknown>).heartbeat as HeartbeatBlock)
        : null;
    return NextResponse.json(normalizeHeartbeat(defaults, override));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load heartbeat settings.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string; tileId: string }> }
) {
  try {
    const { projectId, tileId } = await context.params;
    const store = loadStore();
    const resolved = resolveProjectTile(store, projectId, tileId);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error.message },
        { status: resolved.error.status }
      );
    }
    const { tile } = resolved;
    const body = (await request.json()) as ProjectTileHeartbeatUpdatePayload;
    if (!body || typeof body.override !== "boolean" || !body.heartbeat) {
      return NextResponse.json({ error: "Heartbeat payload is invalid." }, { status: 400 });
    }

    const every = typeof body.heartbeat.every === "string" ? body.heartbeat.every.trim() : "";
    const target = typeof body.heartbeat.target === "string" ? body.heartbeat.target.trim() : "";
    const includeReasoning = body.heartbeat.includeReasoning;
    const ackMaxChars = body.heartbeat.ackMaxChars;
    const activeHours = body.heartbeat.activeHours;

    if (!every) {
      return NextResponse.json({ error: "Heartbeat interval is required." }, { status: 400 });
    }
    if (!target) {
      return NextResponse.json({ error: "Heartbeat target is required." }, { status: 400 });
    }
    if (typeof includeReasoning !== "boolean") {
      return NextResponse.json({ error: "includeReasoning must be true or false." }, { status: 400 });
    }
    if (ackMaxChars !== undefined && ackMaxChars !== null) {
      if (typeof ackMaxChars !== "number" || !Number.isFinite(ackMaxChars)) {
        return NextResponse.json({ error: "ackMaxChars must be a number." }, { status: 400 });
      }
    }
    if (activeHours !== undefined && activeHours !== null) {
      const start = coerceString(activeHours.start);
      const end = coerceString(activeHours.end);
      if (!start || !end) {
        return NextResponse.json({ error: "Active hours must include start and end." }, { status: 400 });
      }
    }

    const { config, configPath } = loadClawdbotConfig();
    const list = readAgentList(config);
    const index = list.findIndex((entry) => entry.id === tile.agentId);
    const entry: AgentEntry = index >= 0 ? { ...list[index] } : { id: tile.agentId };

    if (!body.override) {
      if ("heartbeat" in entry) {
        delete entry.heartbeat;
      }
    } else {
      const nextHeartbeat: Record<string, unknown> = {
        every,
        target,
        includeReasoning,
      };
      if (ackMaxChars !== undefined && ackMaxChars !== null) {
        nextHeartbeat.ackMaxChars = ackMaxChars;
      }
      if (activeHours) {
        nextHeartbeat.activeHours = { start: activeHours.start, end: activeHours.end };
      }
      entry.heartbeat = nextHeartbeat;
    }

    if (index >= 0) {
      list[index] = entry;
    } else {
      list.push(entry);
    }
    writeAgentList(config, list);
    saveClawdbotConfig(configPath, config);

    const defaults = readHeartbeatDefaults(config);
    const override = body.override
      ? ((entry as Record<string, unknown>).heartbeat as HeartbeatBlock)
      : null;
    return NextResponse.json(normalizeHeartbeat(defaults, override));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save heartbeat settings.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
