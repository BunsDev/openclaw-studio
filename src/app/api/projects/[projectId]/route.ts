import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import {
  loadClawdbotConfig,
  removeAgentEntry,
  saveClawdbotConfig,
} from "@/lib/clawdbot/config";
import { deleteAgentArtifacts } from "@/lib/projects/fs.server";
import { resolveProject } from "@/lib/projects/resolve";
import { loadStore, removeProjectFromStore, saveStore } from "../store";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const store = loadStore();
    const resolved = resolveProject(store, projectId);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error.message },
        { status: resolved.error.status }
      );
    }
    const { projectId: resolvedProjectId, project } = resolved;

    const warnings: string[] = [];
    let configInfo: { config: Record<string, unknown>; configPath: string } | null = null;
    try {
      configInfo = loadClawdbotConfig();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update clawdbot.json.";
      warnings.push(`Agent config not updated: ${message}`);
    }
    for (const tile of project.tiles) {
      if (!tile.agentId?.trim()) {
        warnings.push(`Missing agentId for tile ${tile.id}; skipped agent cleanup.`);
        continue;
      }
      deleteAgentArtifacts(resolvedProjectId, tile.agentId, warnings);
      if (configInfo) {
        removeAgentEntry(configInfo.config, tile.agentId);
      }
    }
    if (configInfo) {
      saveClawdbotConfig(configInfo.configPath, configInfo.config);
    }

    const { store: nextStore } = removeProjectFromStore(store, resolvedProjectId);
    saveStore(nextStore);
    return NextResponse.json({ store: nextStore, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete workspace.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
