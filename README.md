# Clawdbot Agent UI

A Next.js canvas UI for creating projects, managing agents, and chatting with the
Clawdbot Gateway.

## Architecture Overview

### Frontend (this repo)
- **UI:** `app/page.tsx` renders the canvas and agent tiles.
- **State:** `src/state/store.tsx` manages UI runtime state (selected tile, output,
  draft text, model/thinking selections) and persists projects via API calls.
- **Gateway connection:** `src/lib/gateway/useGatewayConnection.ts` fetches
  Gateway config from `/api/gateway`, then opens a WebSocket to the Clawdbot
  Gateway and listens for `chat` events.
- **Chat flow:** the UI sends `chat.send` over the Gateway, streams deltas when
  available, and hydrates on refresh via `chat.history`.

### API routes (Next.js, Node runtime)
- **Projects store:** `app/api/projects` reads/writes
  `~/.clawdbot/agent-canvas/projects.json`.
- **Project lifecycle:** `app/api/projects/[projectId]` deletes a project from
  the UI store and removes agent workspaces + agent state directories
  (it does not delete the git repo itself).
- **Agent tiles:** `app/api/projects/[projectId]/tiles` creates new agents,
  provisions their workspaces, and generates agent IDs.
- **Discord:** `app/api/projects/[projectId]/discord` calls into
  `src/lib/discord/discordChannel.ts` to create Discord channels and register
  bindings.
- **Gateway config:** `app/api/gateway` reads `~/.clawdbot/clawdbot.json`
  (or `CLAWDBOT_STATE_DIR`) to discover Gateway host/port and auth token.

## How This Interacts With `~/clawdbot`

This UI is a **client** of the Clawdbot backend:

- The **Gateway** (running from the `~/clawdbot` repo) is the real-time bridge.
  This app connects via WebSocket and uses methods like `chat.send`,
  `chat.history`, and `sessions.patch`.
- The Gateway **state and config** live in `~/.clawdbot/`.
  This app reads and updates that state (e.g., Discord bindings).
- Agent **runtime state** and transcripts are owned by Clawdbot and stored under
  `~/.clawdbot/agents/<agentId>/...`.

If the Gateway is not running or the config is missing, this UI cannot send or
receive chat updates.

## Data & File Layout

The UI writes/reads these paths:

- `~/.clawdbot/agent-canvas/projects.json`  
  UI project + tile definitions (ids, names, repo paths, models).

- `~/clawd-<agentId>/`  
  Agent workspace created by the UI. Contains:
  - `repo` (symlink to the project repo)
  - `BOOTSTRAP.md`, `AGENTS.md`, `SOUL.md`

- `~/<project-slug>/`  
  Git repo created on project creation (initialized with `git init`).

The Clawdbot repo provides:

- `~/.clawdbot/clawdbot.json`  
  Gateway config, channel bindings, and agent list.

- `~/.clawdbot/agents/<agentId>/...`  
  Agent state, transcripts, and auth profiles.

## Key Flows

### Create Project
1. UI calls `POST /api/projects`.
2. Server creates a repo at `~/<project-slug>` (or a suffixed variant).
3. `git init` runs and `.gitignore` is ensured.
4. The project is stored in `~/.clawdbot/agent-canvas/projects.json`.

### Create Agent Tile
1. UI calls `POST /api/projects/[projectId]/tiles`.
2. An `agentId` is generated from project slug + tile name.
3. `~/clawd-<agentId>` is created with a `repo` symlink and bootstrap files.
4. Auth profiles are copied from `~/.clawdbot/agents/main/agent/auth-profiles.json`
   if present.
5. The tile is added to the UI store and uses session key
   `agent:<agentId>:main`.

### Rename Agent Tile
1. UI calls `PATCH /api/projects/[projectId]/tiles/[tileId]`.
2. Workspace folder and `~/.clawdbot/agents/<agentId>` are renamed.
3. The tile’s `agentId` and `sessionKey` are updated in the UI store.

### Chat
1. UI sends `chat.send` to the Gateway with `sessionKey`.
2. Gateway emits `chat` events or updates history.
3. UI listens for events and hydrates from `chat.history` on refresh.

### Delete Project
1. UI calls `DELETE /api/projects/[projectId]`.
2. The UI store is updated.
3. Agent workspaces and agent state directories are removed.
4. The git repo remains on disk.

### Discord Channel (per agent)
1. UI calls `POST /api/projects/[projectId]/discord`.
2. Uses `DISCORD_BOT_TOKEN` from `~/.clawdbot/.env`.
3. Creates or reuses a channel and records bindings in `~/.clawdbot/clawdbot.json`.

## Local Dev

```bash
pnpm dev
```

Make sure the Clawdbot Gateway is running from `~/clawdbot` and that
`~/.clawdbot/clawdbot.json` exists with Gateway config and auth.
