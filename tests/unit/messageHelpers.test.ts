import { describe, expect, it } from "vitest";

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
});
