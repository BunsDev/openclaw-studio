import type { AgentTile } from "./store";
import { extractText } from "@/lib/text/message-extract";
import { stripUiMetadata, isUiMetadataPrefix } from "@/lib/text/message-metadata";

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

export type AgentEventPayload = {
  runId: string;
  seq?: number;
  stream?: string;
  data?: Record<string, unknown>;
  sessionKey?: string;
};

export const getChatSummaryPatch = (
  payload: ChatEventPayload,
  now: number = Date.now()
): Partial<AgentTile> | null => {
  const message = payload.message;
  const role =
    message && typeof message === "object"
      ? (message as Record<string, unknown>).role
      : null;
  const rawText = extractText(message);
  if (typeof rawText === "string" && isUiMetadataPrefix(rawText.trim())) {
    return { lastActivityAt: now };
  }
  const cleaned = typeof rawText === "string" ? stripUiMetadata(rawText) : null;
  const patch: Partial<AgentTile> = { lastActivityAt: now };
  if (role === "user") {
    if (cleaned) {
      patch.lastUserMessage = cleaned;
    }
    return patch;
  }
  if (role === "assistant") {
    if (cleaned) {
      patch.latestPreview = cleaned;
    }
    return patch;
  }
  if (payload.state === "error" && payload.errorMessage) {
    patch.latestPreview = payload.errorMessage;
  }
  return patch;
};

export const getAgentSummaryPatch = (
  payload: AgentEventPayload,
  now: number = Date.now()
): Partial<AgentTile> | null => {
  if (payload.stream !== "lifecycle") return null;
  const phase = typeof payload.data?.phase === "string" ? payload.data.phase : "";
  if (!phase) return null;
  const patch: Partial<AgentTile> = { lastActivityAt: now };
  if (phase === "start") {
    patch.status = "running";
    return patch;
  }
  if (phase === "end") {
    patch.status = "idle";
    return patch;
  }
  if (phase === "error") {
    patch.status = "error";
    return patch;
  }
  return patch;
};
