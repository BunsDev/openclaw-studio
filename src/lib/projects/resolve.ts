import type { Project, ProjectTile, ProjectsStore } from "@/lib/projects/types";

export type ResolveError = { status: number; message: string };

export type ResolveProjectResult =
  | { ok: true; projectId: string; project: Project }
  | { ok: false; error: ResolveError };

export type ResolveProjectTileResult =
  | { ok: true; projectId: string; tileId: string; project: Project; tile: ProjectTile }
  | { ok: false; error: ResolveError };

export const resolveProject = (
  store: ProjectsStore,
  projectId: string
): ResolveProjectResult => {
  const trimmedProjectId = projectId.trim();
  if (!trimmedProjectId) {
    return {
      ok: false,
      error: { status: 400, message: "Workspace id is required." },
    };
  }
  const project = store.projects.find((entry) => entry.id === trimmedProjectId);
  if (!project) {
    return {
      ok: false,
      error: { status: 404, message: "Workspace not found." },
    };
  }
  return { ok: true, projectId: trimmedProjectId, project };
};

export const resolveProjectTile = (
  store: ProjectsStore,
  projectId: string,
  tileId: string
): ResolveProjectTileResult => {
  const trimmedProjectId = projectId.trim();
  const trimmedTileId = tileId.trim();
  if (!trimmedProjectId || !trimmedTileId) {
    return {
      ok: false,
      error: { status: 400, message: "Workspace id and tile id are required." },
    };
  }
  const project = store.projects.find((entry) => entry.id === trimmedProjectId);
  if (!project) {
    return {
      ok: false,
      error: { status: 404, message: "Workspace not found." },
    };
  }
  const tile = project.tiles.find((entry) => entry.id === trimmedTileId);
  if (!tile) {
    return {
      ok: false,
      error: { status: 404, message: "Tile not found." },
    };
  }
  return { ok: true, projectId: trimmedProjectId, tileId: trimmedTileId, project, tile };
};
