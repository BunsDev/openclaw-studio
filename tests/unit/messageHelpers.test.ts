import { describe, expect, it } from "vitest";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildAgentInstruction } from "@/lib/text/message-metadata";
import {
  resolveDefaultAgentId,
  resolveDefaultWorkspacePath,
} from "@/lib/clawdbot/resolveDefaultAgent";

describe("buildAgentInstruction", () => {
  it("includes workspace path in instruction", () => {
    const message = buildAgentInstruction({
      workspacePath: "/tmp/workspace",
      message: "Ship it",
    });
    expect(message).toContain("Workspace path: /tmp/workspace");
    expect(message).toContain("Ship it");
  });

  it("returns command messages untouched", () => {
    const message = buildAgentInstruction({
      workspacePath: "/tmp/workspace",
      message: "/help",
    });
    expect(message).toBe("/help");
  });
});

describe("resolveDefaultAgentId", () => {
  it("picks the default agent when present", () => {
    const config = {
      agents: {
        list: [
          { id: "agent-1" },
          { id: "agent-2", default: true },
        ],
        defaults: { workspace: "/tmp/default" },
      },
    };
    expect(resolveDefaultAgentId(config)).toBe("agent-2");
  });

  it("falls back to first agent when default is missing", () => {
    const config = {
      agents: {
        list: [{ id: "agent-1" }, { id: "agent-2" }],
      },
    };
    expect(resolveDefaultAgentId(config)).toBe("agent-1");
  });

  it("resolves workspace path from agent entry or defaults", () => {
    const config = {
      agents: {
        list: [{ id: "agent-1", workspace: "/tmp/agent-1" }],
        defaults: { workspace: "/tmp/default" },
      },
    };
    expect(resolveDefaultWorkspacePath(config, "agent-1")).toBe(path.resolve("/tmp/agent-1"));
    expect(resolveDefaultWorkspacePath(config, "agent-2")).toBe(path.resolve("/tmp/default"));
  });

  it("falls back to state-dir workspace path", () => {
    const originalStateDir = process.env.OPENCLAW_STATE_DIR;
    const originalProfile = process.env.OPENCLAW_PROFILE;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdbot-workspace-"));
    try {
      process.env.OPENCLAW_STATE_DIR = tempDir;
      delete process.env.OPENCLAW_PROFILE;
      expect(resolveDefaultWorkspacePath({}, "main")).toBe(
        path.resolve(tempDir, "workspace")
      );
      process.env.OPENCLAW_PROFILE = "dev";
      expect(resolveDefaultWorkspacePath({}, "main")).toBe(
        path.resolve(tempDir, "workspace-dev")
      );
    } finally {
      if (originalStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = originalStateDir;
      }
      if (originalProfile === undefined) {
        delete process.env.OPENCLAW_PROFILE;
      } else {
        process.env.OPENCLAW_PROFILE = originalProfile;
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
