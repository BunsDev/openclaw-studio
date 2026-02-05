import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { loadTaskControlPlaneRawData } from "@/lib/task-control-plane/br.server";
import { buildTaskControlPlaneSnapshot } from "@/lib/task-control-plane/read-model";

export const runtime = "nodejs";

const isBeadsWorkspaceError = (message: string) => {
  const lowered = message.toLowerCase();
  return lowered.includes("no beads directory found") || lowered.includes("not initialized");
};

export async function GET() {
  try {
    const raw = await loadTaskControlPlaneRawData();
    const snapshot = buildTaskControlPlaneSnapshot(raw);
    return NextResponse.json({ snapshot });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load task control plane data.";
    logger.error(message);
    if (isBeadsWorkspaceError(message)) {
      return NextResponse.json(
        {
          error: "Beads workspace not initialized for this project. Run: br init --prefix <scope>.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
