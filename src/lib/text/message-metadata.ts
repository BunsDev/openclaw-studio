export type AgentInstructionParams = {
  workspacePath: string;
  message: string;
};

// Keep this phrase as a stable sentinel that both the envelope builder and
// metadata stripper can agree on. If we ever change this string, we should
// update the strip regexes below (or better: replace them with a structured
// format).
const ENVELOPE_SENTINEL = "memory_search.";

export const buildAgentInstruction = ({
  workspacePath,
  message,
}: AgentInstructionParams): string => {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  const workspace = workspacePath?.trim();
  if (!workspace) return trimmed;
  return `Workspace path: ${workspace}. Operate within this repository. You may also read/write your agent workspace files (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, HEARTBEAT.md, TOOLS.md, MEMORY.md). Use MEMORY.md or memory/*.md directly for durable memory; do not rely on ${ENVELOPE_SENTINEL}\n\n${trimmed}`;
};

const PROJECT_PROMPT_BLOCK_RE = /^(?:Project|Workspace) path:[\s\S]*?\n\s*\n/i;
const PROJECT_PROMPT_INLINE_RE = /^(?:Project|Workspace) path:[\s\S]*?memory_search\.\s*/i;
const RESET_PROMPT_RE =
  /^A new session was started via \/new or \/reset[\s\S]*?reasoning\.\s*/i;
const MESSAGE_ID_RE = /\s*\[message_id:[^\]]+\]\s*/gi;
const UI_METADATA_PREFIX_RE =
  /^(?:Project path:|Workspace path:|A new session was started via \/new or \/reset)/i;
const HEARTBEAT_PROMPT_RE = /^Read HEARTBEAT\.md if it exists\b/i;
const HEARTBEAT_PATH_RE = /Heartbeat file path:/i;

export const stripUiMetadata = (text: string) => {
  if (!text) return text;
  let cleaned = text.replace(RESET_PROMPT_RE, "");
  const beforeProjectStrip = cleaned;
  cleaned = cleaned.replace(PROJECT_PROMPT_INLINE_RE, "");
  if (cleaned === beforeProjectStrip) {
    cleaned = cleaned.replace(PROJECT_PROMPT_BLOCK_RE, "");
  }
  cleaned = cleaned.replace(MESSAGE_ID_RE, "").trim();
  return cleaned;
};

export const isHeartbeatPrompt = (text: string) => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return HEARTBEAT_PROMPT_RE.test(trimmed) || HEARTBEAT_PATH_RE.test(trimmed);
};

export const isUiMetadataPrefix = (text: string) => UI_METADATA_PREFIX_RE.test(text);
