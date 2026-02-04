# OpenClaw Studio

![Read Me Image](readme-image.png)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/GAr9Qfem)

When you run multiple agents, you need a place to see what's happening.

OpenClaw Studio is that place. It's the visual interface for the OpenClaw ecosystem—designed for people who coordinate agents, track long-running tasks, and need to stay oriented when the work gets complex.

Join the Discord: [https://discord.gg/GAr9Qfem](https://discord.gg/GAr9Qfem). I'm also looking for contributors who want to help shape OpenClaw Studio.

The terminal is good for single commands. But agents don't work in single commands. They work in threads. They share context. They produce files that evolve. They run in parallel, and you need to know what's running where.

OpenClaw Studio solves this. It's a Next.js app that connects to your OpenClaw gateway, streams everything live, and edits agent files through the gateway tool API. The interface is simple enough to feel obvious, powerful enough to handle real work.

## What it does

- Shows you every agent at a glance
- Runs a focused agent-management UI (fleet list + primary agent + inspect sidebar)
- Creates new agents directly from the fleet sidebar (`New Agent`)
- Lets you change per-agent runtime model/thinking directly from the agent header
- Keeps per-agent management actions in settings (rename, display toggles, new session, delete)
- Lists per-agent cron jobs in settings and lets you run now or delete
- Reads and edits agent files (AGENTS.md, MEMORY.md, etc.) via the gateway
- Streams tool output in real time
- Provisions Discord channels when you need them
- Stores only UI settings locally—no external database

This is where multi-agent work happens.

## Requirements

- Node.js (LTS recommended)
- OpenClaw installed with gateway running
- git in PATH
- macOS or Linux; Windows via WSL2

## Quick start
```bash
git clone https://github.com/grp06/openclaw-studio.git
cd openclaw-studio
npm install
npm run dev
```

Open http://localhost:3000

The UI reads config from `~/.openclaw` by default (falls back to `~/.moltbot` or `~/.clawdbot` if you're migrating).
Only create a `.env` if you need to override those defaults:
```bash
cp .env.example .env
```

## Agent files

Agent files live on the **gateway** and are accessed through `POST /tools/invoke`.
The gateway build must expose the coding tools (`read`, `write`, `edit`, `apply_patch`) on that endpoint.
If you see `Tool not available: read`, you are running a gateway build that does **not** include coding tools for `/tools/invoke`.

If you have restrictive tool allowlists configured, ensure the agent/tool policy permits:
`read`, `write`, `edit`, and `apply_patch`.

## Configuration

Your gateway config lives in `openclaw.json` in your state directory. Defaults:
- State dir: `~/.openclaw`
- Config: `~/.openclaw/openclaw.json`
- Gateway URL: `ws://127.0.0.1:18789`

Studio stores its own settings locally at `~/.openclaw/openclaw-studio/settings.json` (gateway URL/token + focused preferences).
Agent create/rename/delete actions in Studio mutate gateway config through `config.patch`, so `openclaw.json` is updated on the **gateway host** (local machine for local gateways, remote host for EC2/remote gateways).

Optional overrides:
- `OPENCLAW_STATE_DIR`
- `OPENCLAW_CONFIG_PATH`
- `NEXT_PUBLIC_GATEWAY_URL`
- `CLAWDBOT_DEFAULT_AGENT_ID`

To use a dedicated state dir during development:
```bash
OPENCLAW_STATE_DIR=~/openclaw-dev npm run dev
```

## Windows (WSL2)

Run both OpenClaw Studio and OpenClaw inside the same WSL2 distro. Use the WSL shell for Node, the gateway, and the UI. Access it from Windows at http://localhost:3000.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run e2e` (requires `npx playwright install`)

## Troubleshooting

- **Missing config**: Run `openclaw onboard` or set `OPENCLAW_CONFIG_PATH`
- **Gateway unreachable**: Confirm the gateway is running and `NEXT_PUBLIC_GATEWAY_URL` matches
- **Auth errors**: Check `gateway.auth.token` in `openclaw.json`
- **Inspect returns 404**: Your gateway build does not expose coding tools on `/tools/invoke`, or a tool allowlist is blocking them. Update the gateway build and ensure `read`/`write`/`edit`/`apply_patch` are allowed.

## Architecture

See `ARCHITECTURE.md` for details on modules and data flow.
