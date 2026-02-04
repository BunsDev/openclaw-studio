import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentState as AgentRecord } from "@/features/agents/state/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeAgentName } from "@/lib/names/agentNames";
import { Shuffle } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";
import { buildAgentChatItems, summarizeToolLabel } from "./chatItems";
import { EmptyStatePanel } from "./EmptyStatePanel";

type AgentChatPanelProps = {
  agent: AgentRecord;
  isSelected: boolean;
  canSend: boolean;
  onInspect: () => void;
  onNameChange: (name: string) => Promise<boolean>;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
  onAvatarShuffle: () => void;
  onNameShuffle: () => void;
};

export const AgentChatPanel = ({
  agent,
  isSelected,
  canSend,
  onInspect,
  onNameChange,
  onDraftChange,
  onSend,
  onAvatarShuffle,
  onNameShuffle,
}: AgentChatPanelProps) => {
  const [nameDraft, setNameDraft] = useState(agent.name);
  const [draftValue, setDraftValue] = useState(agent.draft);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const plainDraftRef = useRef(agent.draft);

  const resizeDraft = useCallback(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = el.scrollHeight > el.clientHeight ? "auto" : "hidden";
  }, []);

  const handleDraftRef = useCallback((el: HTMLTextAreaElement | HTMLInputElement | null) => {
    draftRef.current = el instanceof HTMLTextAreaElement ? el : null;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNameDraft(agent.name);
  }, [agent.name]);

  useEffect(() => {
    if (agent.draft === plainDraftRef.current) return;
    plainDraftRef.current = agent.draft;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftValue(agent.draft);
  }, [agent.draft]);

  useEffect(() => {
    resizeDraft();
  }, [resizeDraft, agent.draft]);

  const commitName = async () => {
    const next = normalizeAgentName(nameDraft);
    if (!next) {
      setNameDraft(agent.name);
      return;
    }
    if (next === agent.name) {
      return;
    }
    const ok = await onNameChange(next);
    if (!ok) {
      setNameDraft(agent.name);
      return;
    }
    setNameDraft(next);
  };

  const statusColor =
    agent.status === "running"
      ? "border border-primary/30 bg-primary/15 text-foreground"
      : agent.status === "error"
        ? "border border-destructive/35 bg-destructive/12 text-destructive"
        : "border border-border/70 bg-muted text-muted-foreground";
  const statusLabel =
    agent.status === "running"
      ? "Running"
      : agent.status === "error"
        ? "Error"
        : "Waiting for direction";

  const chatItems = useMemo(
    () =>
      buildAgentChatItems({
        outputLines: agent.outputLines,
        streamText: agent.streamText,
        liveThinkingTrace: agent.thinkingTrace?.trim() ?? "",
        showThinkingTraces: agent.showThinkingTraces,
        toolCallingEnabled: agent.toolCallingEnabled,
      }),
    [
      agent.outputLines,
      agent.streamText,
      agent.thinkingTrace,
      agent.showThinkingTraces,
      agent.toolCallingEnabled,
    ]
  );

  const avatarSeed = agent.avatarSeed ?? agent.agentId;
  return (
    <div data-agent-panel className="group fade-up relative flex h-full w-full flex-col">
      <div className="px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="relative">
              <AgentAvatar
                seed={avatarSeed}
                name={agent.name}
                avatarUrl={agent.avatarUrl ?? null}
                size={96}
                isSelected={isSelected}
              />
              <button
                className="nodrag absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-md border border-border/80 bg-card text-muted-foreground shadow-sm transition hover:border-border hover:bg-muted/65"
                type="button"
                aria-label="Shuffle avatar"
                data-testid="agent-avatar-shuffle"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onAvatarShuffle();
                }}
              >
                <Shuffle className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div
                className={`flex items-center gap-2 rounded-md border bg-card/80 px-3 py-1 shadow-sm ${
                  isSelected ? "agent-name-selected" : "border-border"
                }`}
              >
                <input
                  className="w-full bg-transparent text-center text-xs font-semibold uppercase tracking-[0.16em] text-foreground outline-none"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={() => {
                    void commitName();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setNameDraft(agent.name);
                      event.currentTarget.blur();
                    }
                  }}
                />
                <button
                  className="nodrag flex h-6 w-6 items-center justify-center rounded-md border border-border/80 bg-card text-muted-foreground transition hover:border-border hover:bg-muted/65"
                  type="button"
                  aria-label="Shuffle name"
                  data-testid="agent-name-shuffle"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onNameShuffle();
                  }}
                >
                  <Shuffle className="h-3 w-3" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] ${statusColor}`}
                >
                  {statusLabel}
                </span>
                <button
                  className="nodrag rounded-md border border-border/80 bg-card/60 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground transition hover:border-border hover:bg-muted/65"
                  type="button"
                  data-testid="agent-inspect-toggle"
                  onClick={onInspect}
                >
                  Inspect
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 sm:px-4 sm:pb-4">
        <div
          ref={chatRef}
          className="flex-1 overflow-auto rounded-md border border-border/80 bg-card/75 p-3 sm:p-4"
          onWheel={(event) => {
            event.stopPropagation();
          }}
          onWheelCapture={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="flex flex-col gap-3 text-xs text-foreground">
            {chatItems.length === 0 ? (
              <EmptyStatePanel title="No messages yet." compact className="p-3 text-xs" />
            ) : (
              <>
                {chatItems.map((item, index) => {
                  if (item.kind === "thinking") {
                    return (
                      <details
                        key={`chat-${agent.agentId}-thinking-${index}`}
                        className="rounded-md border border-border/70 bg-muted/55 px-2 py-1 text-[11px] text-muted-foreground"
                        open={item.live && agent.status === "running"}
                      >
                        <summary className="cursor-pointer select-none font-mono text-[10px] font-semibold uppercase tracking-[0.11em]">
                          Thinking
                        </summary>
                        <div className="agent-markdown mt-1 text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {item.text}
                          </ReactMarkdown>
                        </div>
                      </details>
                    );
                  }
                  if (item.kind === "user") {
                    return (
                      <div
                        key={`chat-${agent.agentId}-user-${index}`}
                        className="rounded-md border border-border/70 bg-muted/70 px-3 py-2 text-foreground"
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{`> ${item.text}`}</ReactMarkdown>
                      </div>
                    );
                  }
                  if (item.kind === "tool") {
                    const { summaryText, body } = summarizeToolLabel(item.text);
                    return (
                      <details
                        key={`chat-${agent.agentId}-tool-${index}`}
                        className="rounded-md border border-border/70 bg-muted/55 px-2 py-1 text-[11px] text-muted-foreground"
                      >
                        <summary className="cursor-pointer select-none font-mono text-[10px] font-semibold uppercase tracking-[0.11em]">
                          {summaryText}
                        </summary>
                        {body ? (
                          <div className="agent-markdown mt-1 text-foreground">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                          </div>
                        ) : null}
                      </details>
                    );
                  }
                  return (
                    <div
                      key={`chat-${agent.agentId}-assistant-${index}`}
                      className={`agent-markdown rounded-md border border-transparent px-0.5 ${item.live ? "opacity-85" : ""}`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={handleDraftRef}
            rows={1}
            value={draftValue}
            className="flex-1 resize-none rounded-md border border-border/80 bg-card/75 px-3 py-2 text-[11px] text-foreground outline-none transition focus:border-ring"
            onChange={(event) => {
              const value = event.target.value;
              plainDraftRef.current = value;
              setDraftValue(value);
              onDraftChange(value);
              resizeDraft();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              if (event.defaultPrevented) return;
              event.preventDefault();
              if (!canSend || agent.status === "running") return;
              const message = draftValue.trim();
              if (!message) return;
              onSend(message);
            }}
            placeholder="type a message"
          />
          <button
            className="rounded-md border border-transparent bg-primary px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            type="button"
            onClick={() => onSend(draftValue)}
            disabled={!canSend || agent.status === "running" || !draftValue.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
