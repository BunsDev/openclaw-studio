import { beforeEach, describe, expect, it, vi } from "vitest";

import { spawnSync } from "node:child_process";

import {
  loadTaskControlPlaneRawData,
  runBrJson,
} from "@/lib/task-control-plane/br.server";

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

const mockedSpawnSync = vi.mocked(spawnSync);

describe("task control plane br runner", () => {
  beforeEach(() => {
    mockedSpawnSync.mockReset();
  });

  it("returns parsed JSON for successful commands", () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ ok: true }),
      stderr: "",
      error: undefined,
    } as never);

    expect(runBrJson(["where"])).toEqual({ ok: true });
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      "br",
      ["where", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
  });

  it("throws actionable errors when br exits non-zero", () => {
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: JSON.stringify({ error: "no beads directory found" }),
      stderr: "",
      error: undefined,
    } as never);

    expect(() => runBrJson(["where"])).toThrow("no beads directory found");
  });

  it("throws when output is not valid JSON", () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: "not-json",
      stderr: "",
      error: undefined,
    } as never);

    expect(() => runBrJson(["where"])).toThrow("invalid JSON");
  });

  it("loads all raw read-model sources", async () => {
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

    await expect(loadTaskControlPlaneRawData()).resolves.toEqual({
      scopePath: "/tmp/.beads",
      openIssues: [{ id: "bd-1" }],
      inProgressIssues: [{ id: "bd-2" }],
      blockedIssues: [{ id: "bd-3" }],
    });
  });
});
