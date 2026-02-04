import type { AgentState, FocusFilter } from "@/features/agents/state/store";
import { getAttentionForAgent } from "@/features/agents/state/store";
import { AgentAvatar } from "./AgentAvatar";
import { EmptyStatePanel } from "./EmptyStatePanel";

type FleetSidebarProps = {
  agents: AgentState[];
  selectedAgentId: string | null;
  filter: FocusFilter;
  onFilterChange: (next: FocusFilter) => void;
  onSelectAgent: (agentId: string) => void;
};

const FILTER_OPTIONS: Array<{ value: FocusFilter; label: string; testId: string }> = [
  { value: "all", label: "All", testId: "fleet-filter-all" },
  {
    value: "needs-attention",
    label: "Needs Attention",
    testId: "fleet-filter-needs-attention",
  },
  { value: "running", label: "Running", testId: "fleet-filter-running" },
  { value: "idle", label: "Idle", testId: "fleet-filter-idle" },
];

const statusLabel: Record<AgentState["status"], string> = {
  idle: "Idle",
  running: "Running",
  error: "Error",
};

const statusClassName: Record<AgentState["status"], string> = {
  idle: "border border-border/70 bg-muted text-muted-foreground",
  running: "border border-primary/30 bg-primary/15 text-foreground",
  error: "border border-destructive/35 bg-destructive/12 text-destructive",
};

export const FleetSidebar = ({
  agents,
  selectedAgentId,
  filter,
  onFilterChange,
  onSelectAgent,
}: FleetSidebarProps) => {
  return (
    <aside
      className="glass-panel fade-up-delay relative flex h-full w-full min-w-72 flex-col gap-3 p-3 xl:max-w-[320px]"
      data-testid="fleet-sidebar"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(90deg,color-mix(in_oklch,var(--primary)_8%,transparent)_0%,transparent_80%)]" />
      <div className="px-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Fleet
        </p>
        <p className="console-title text-2xl leading-none text-foreground">Agents ({agents.length})</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-testid={option.testId}
              aria-pressed={active}
                className={`rounded-md border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] transition ${
                active
                  ? "border-border bg-muted text-foreground shadow-xs"
                  : "border-border/80 bg-card/65 text-muted-foreground hover:border-border hover:bg-muted/70"
              }`}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {agents.length === 0 ? (
          <EmptyStatePanel title="No agents available." compact className="p-3 text-xs" />
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent) => {
              const selected = selectedAgentId === agent.agentId;
              const attention = getAttentionForAgent(agent, selectedAgentId);
              const avatarSeed = agent.avatarSeed ?? agent.agentId;
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  data-testid={`fleet-agent-row-${agent.agentId}`}
                  className={`group flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
                    selected
                      ? "border-ring/40 bg-muted/60 shadow-xs"
                      : "border-border/70 bg-card/65 hover:border-border hover:bg-muted/55"
                  }`}
                  onClick={() => onSelectAgent(agent.agentId)}
                >
                  <AgentAvatar
                    seed={avatarSeed}
                    name={agent.name}
                    avatarUrl={agent.avatarUrl ?? null}
                    size={28}
                    isSelected={selected}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.13em] text-foreground">
                      {agent.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${statusClassName[agent.status]}`}
                      >
                        {statusLabel[agent.status]}
                      </span>
                      {attention === "needs-attention" ? (
                        <span className="rounded border border-border/80 bg-card/75 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Attention
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
