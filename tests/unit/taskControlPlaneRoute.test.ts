import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/task-control-plane/route";
import { logger } from "@/lib/logger";
import { loadTaskControlPlaneRawData } from "@/lib/task-control-plane/br.server";
import { buildTaskControlPlaneSnapshot } from "@/lib/task-control-plane/read-model";

vi.mock("@/lib/task-control-plane/br.server", () => ({
  loadTaskControlPlaneRawData: vi.fn(),
}));

vi.mock("@/lib/task-control-plane/read-model", () => ({
  buildTaskControlPlaneSnapshot: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

const mockedLoadRaw = vi.mocked(loadTaskControlPlaneRawData);
const mockedBuildSnapshot = vi.mocked(buildTaskControlPlaneSnapshot);
const mockedLogger = vi.mocked(logger.error);

describe("task control plane route", () => {
  beforeEach(() => {
    mockedLoadRaw.mockReset();
    mockedBuildSnapshot.mockReset();
    mockedLogger.mockReset();
  });

  it("returns snapshot on success", async () => {
    mockedLoadRaw.mockResolvedValue({
      scopePath: "/tmp/.beads",
      openIssues: [],
      inProgressIssues: [],
      blockedIssues: [],
    });
    mockedBuildSnapshot.mockReturnValue({
      generatedAt: "2026-02-05T00:00:00.000Z",
      scopePath: "/tmp/.beads",
      columns: { ready: [], inProgress: [], blocked: [] },
      warnings: [],
    });

    const response = await GET();
    const body = (await response.json()) as { snapshot: unknown };

    expect(response.status).toBe(200);
    expect(body.snapshot).toBeDefined();
  });

  it("returns 400 for missing beads workspace", async () => {
    mockedLoadRaw.mockRejectedValue(new Error("no beads directory found"));

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("Beads workspace not initialized");
    expect(mockedLogger).toHaveBeenCalled();
  });

  it("returns 502 for other failures", async () => {
    mockedLoadRaw.mockRejectedValue(new Error("boom"));

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe("boom");
    expect(mockedLogger).toHaveBeenCalledWith("boom");
  });
});
