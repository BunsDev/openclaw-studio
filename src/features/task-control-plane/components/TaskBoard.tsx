import type { TaskControlPlaneSnapshot } from "@/lib/task-control-plane/read-model";
import { TaskColumn } from "@/features/task-control-plane/components/TaskColumn";

type TaskBoardProps = {
  snapshot: TaskControlPlaneSnapshot;
};

const formatGeneratedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export function TaskBoard({ snapshot }: TaskBoardProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="glass-panel rounded-xl px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          Read-only task board from Beads status data
        </p>
        <p className="text-xs text-muted-foreground">
          Last refresh: {formatGeneratedAt(snapshot.generatedAt)}
        </p>
        {snapshot.scopePath ? (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Scope: {snapshot.scopePath}
          </p>
        ) : null}
        {snapshot.warnings.length > 0 ? (
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Warnings: {snapshot.warnings.join(" | ")}
          </p>
        ) : null}
      </div>

      <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-3">
        <TaskColumn
          title="Ready"
          cards={snapshot.columns.ready}
          dataTestId="task-control-column-ready"
        />
        <TaskColumn
          title="In Progress"
          cards={snapshot.columns.inProgress}
          dataTestId="task-control-column-in-progress"
        />
        <TaskColumn
          title="Blocked"
          cards={snapshot.columns.blocked}
          dataTestId="task-control-column-blocked"
        />
      </div>
    </div>
  );
}
