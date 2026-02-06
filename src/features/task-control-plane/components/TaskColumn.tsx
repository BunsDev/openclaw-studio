import type { TaskControlPlaneCard } from "@/lib/task-control-plane/read-model";

type TaskColumnProps = {
  title: string;
  cards: TaskControlPlaneCard[];
  dataTestId: string;
};

const formatUpdatedAt = (value: string | null) => {
  if (!value) return "Unknown update time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export function TaskColumn({ title, cards, dataTestId }: TaskColumnProps) {
  return (
    <section
      data-testid={dataTestId}
      className="glass-panel flex min-h-[360px] w-full min-w-[260px] flex-col p-3"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-foreground/85">{title}</h2>
        <span className="rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {cards.map((card) => (
          <article
            key={card.id}
            className="rounded-xl border border-border/70 bg-card/90 p-3 shadow-xs"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-mono text-[11px] font-medium uppercase text-muted-foreground">
                {card.id}
              </p>
              <div className="flex items-center gap-1">
                {card.priority !== null ? (
                  <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                    P{card.priority}
                  </span>
                ) : null}
                {card.decisionNeeded ? (
                  <span className="rounded-full border border-accent/45 bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                    Decision Needed
                  </span>
                ) : null}
              </div>
            </div>
            <p className="text-sm font-medium text-foreground">{card.title}</p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>Updated: {formatUpdatedAt(card.updatedAt)}</p>
              {card.assignee ? <p>Assignee: {card.assignee}</p> : null}
              {card.blockedBy.length > 0 ? (
                <p>Blocked by: {card.blockedBy.join(", ")}</p>
              ) : null}
              {card.labels.length > 0 ? <p>Labels: {card.labels.join(", ")}</p> : null}
            </div>
          </article>
        ))}
        {cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-4 text-sm text-muted-foreground">
            No tasks in this column.
          </p>
        ) : null}
      </div>
    </section>
  );
}
