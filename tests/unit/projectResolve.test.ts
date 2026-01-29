import { describe, expect, it } from "vitest";

import type { Project, ProjectTile, ProjectsStore } from "@/lib/projects/types";
import { resolveProject, resolveProjectTile } from "@/lib/projects/resolve";

const buildStore = (): ProjectsStore => {
  const tile: ProjectTile = {
    id: "tile-1",
    name: "Agent One",
    agentId: "agent-1",
    role: "coding",
    sessionKey: "agent:agent-1:main",
    model: "openai-codex/gpt-5.2-codex",
    thinkingLevel: null,
    avatarSeed: "agent-1",
    position: { x: 0, y: 0 },
    size: { width: 420, height: 520 },
  };
  const project: Project = {
    id: "project-1",
    name: "Project One",
    repoPath: "/tmp/project-1",
    createdAt: 1,
    updatedAt: 1,
    tiles: [tile],
  };
  return {
    version: 2,
    activeProjectId: project.id,
    projects: [project],
  };
};

describe("resolveProject", () => {
  it("returns 400 for missing project id", () => {
    const result = resolveProject(buildStore(), "   ");

    expect(result).toEqual({
      ok: false,
      error: { status: 400, message: "Workspace id is required." },
    });
  });

  it("returns 404 for unknown project id", () => {
    const result = resolveProject(buildStore(), "missing");

    expect(result).toEqual({
      ok: false,
      error: { status: 404, message: "Workspace not found." },
    });
  });

  it("returns project for valid id", () => {
    const store = buildStore();
    const result = resolveProject(store, " project-1 ");

    expect(result).toEqual({
      ok: true,
      projectId: "project-1",
      project: store.projects[0],
    });
  });
});

describe("resolveProjectTile", () => {
  it("returns 400 for missing project or tile id", () => {
    const result = resolveProjectTile(buildStore(), "project-1", " ");

    expect(result).toEqual({
      ok: false,
      error: { status: 400, message: "Workspace id and tile id are required." },
    });
  });

  it("returns 404 for unknown project", () => {
    const result = resolveProjectTile(buildStore(), "missing", "tile-1");

    expect(result).toEqual({
      ok: false,
      error: { status: 404, message: "Workspace not found." },
    });
  });

  it("returns 404 for unknown tile", () => {
    const result = resolveProjectTile(buildStore(), "project-1", "missing");

    expect(result).toEqual({
      ok: false,
      error: { status: 404, message: "Tile not found." },
    });
  });

  it("returns tile for valid ids", () => {
    const store = buildStore();
    const result = resolveProjectTile(store, "project-1", " tile-1 ");

    expect(result).toEqual({
      ok: true,
      projectId: "project-1",
      tileId: "tile-1",
      project: store.projects[0],
      tile: store.projects[0].tiles[0],
    });
  });
});
