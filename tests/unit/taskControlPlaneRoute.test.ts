import { beforeEach, describe, expect, it, vi } from "vitest";

import { spawnSync } from "node:child_process";

import { GET } from "@/app/api/task-control-plane/route";
import { logger } from "@/lib/logger";
import { buildTaskControlPlaneSnapshot } from "@/lib/task-control-plane/read-model";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>(
    "node:child_process"
  );
  return {
    default: actual,
    ...actual,
    spawnSync: vi.fn(),
  };
});

vi.mock("@/lib/task-control-plane/read-model", () => ({
  buildTaskControlPlaneSnapshot: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedBuildSnapshot = vi.mocked(buildTaskControlPlaneSnapshot);
const mockedLogger = vi.mocked(logger.error);

describe("task control plane route", () => {
  beforeEach(() => {
    mockedSpawnSync.mockReset();
    mockedBuildSnapshot.mockReset();
    mockedLogger.mockReset();
  });

  it("returns snapshot on success", async () => {
    mockedSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ path: "/tmp/.beads" }),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-1" }]),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-2" }]),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-3" }]),
        stderr: "",
        error: undefined,
      } as never);

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
    expect(mockedSpawnSync).toHaveBeenCalledTimes(4);
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      1,
      "br",
      ["where", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      2,
      "br",
      ["list", "--status", "open", "--limit", "0", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      3,
      "br",
      ["list", "--status", "in_progress", "--limit", "0", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      4,
      "br",
      ["blocked", "--limit", "0", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
    expect(mockedBuildSnapshot).toHaveBeenCalledWith({
      scopePath: "/tmp/.beads",
      openIssues: [{ id: "bd-1" }],
      inProgressIssues: [{ id: "bd-2" }],
      blockedIssues: [{ id: "bd-3" }],
    });
  });

  it("returns 400 for missing beads workspace", async () => {
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: JSON.stringify({ error: "no beads directory found" }),
      stderr: "",
      error: undefined,
    } as never);

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("Beads workspace not initialized");
    expect(mockedLogger).toHaveBeenCalled();
  });

  it("returns 502 for other failures", async () => {
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: JSON.stringify({ error: "boom" }),
      stderr: "",
      error: undefined,
    } as never);

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe("boom");
    expect(mockedLogger).toHaveBeenCalledWith("boom");
  });
});
