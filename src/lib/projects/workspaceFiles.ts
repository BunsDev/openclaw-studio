export const WORKSPACE_FILE_NAMES = [
  "AGENTS.md",
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "MEMORY.md",
] as const;

export type WorkspaceFileName = (typeof WORKSPACE_FILE_NAMES)[number];

export const isWorkspaceFileName = (value: string): value is WorkspaceFileName =>
  WORKSPACE_FILE_NAMES.includes(value as WorkspaceFileName);

export const WORKSPACE_FILE_META: Record<WorkspaceFileName, { title: string; hint: string }> = {
  "AGENTS.md": {
    title: "AGENTS.md",
    hint: "Operating instructions, priorities, and rules.",
  },
  "SOUL.md": {
    title: "SOUL.md",
    hint: "Persona, tone, and boundaries.",
  },
  "IDENTITY.md": {
    title: "IDENTITY.md",
    hint: "Name, vibe, and emoji.",
  },
  "USER.md": {
    title: "USER.md",
    hint: "User profile and preferences.",
  },
  "TOOLS.md": {
    title: "TOOLS.md",
    hint: "Local tool notes and conventions.",
  },
  "HEARTBEAT.md": {
    title: "HEARTBEAT.md",
    hint: "Small checklist for heartbeat runs.",
  },
  "MEMORY.md": {
    title: "MEMORY.md",
    hint: "Durable memory for this agent.",
  },
};

export const WORKSPACE_FILE_PLACEHOLDERS: Record<WorkspaceFileName, string> = {
  "AGENTS.md": "How should this agent work? Priorities, rules, and habits.",
  "SOUL.md": "Tone, personality, boundaries, and how it should sound.",
  "IDENTITY.md": "Name, vibe, emoji, and a one‑line identity.",
  "USER.md": "How should it address you? Preferences and context.",
  "TOOLS.md": "Local tool notes, conventions, and shortcuts.",
  "HEARTBEAT.md": "A tiny checklist for periodic runs.",
  "MEMORY.md": "Durable facts, decisions, and preferences to remember.",
};

export const createWorkspaceFilesState = () =>
  Object.fromEntries(
    WORKSPACE_FILE_NAMES.map((name) => [name, { content: "", exists: false }])
  ) as Record<WorkspaceFileName, { content: string; exists: boolean }>;
