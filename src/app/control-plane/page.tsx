"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "@/lib/http";
import type { TaskControlPlaneSnapshot } from "@/lib/task-control-plane/read-model";
import { TaskBoard } from "@/features/task-control-plane/components/TaskBoard";

type TaskControlPlaneResponse = {
  snapshot: TaskControlPlaneSnapshot;
};

export default function ControlPlanePage() {
  const [snapshot, setSnapshot] = useState<TaskControlPlaneSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchJson<TaskControlPlaneResponse>("/api/task-control-plane");
      setSnapshot(response.snapshot);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load task control plane snapshot.";
      setError(message);
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  return (
    <main className="mx-auto flex h-screen w-full max-w-[1600px] flex-col gap-4 p-4">
      <header className="glass-panel flex items-center justify-between rounded-xl px-4 py-3">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-foreground">Task Control Plane</h1>
          <p className="text-sm text-muted-foreground">
            Trello-style read-only Kanban view powered by Beads JSON state.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSnapshot()}
          className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-background"
        >
          Refresh
        </button>
      </header>

      <section data-testid="task-control-plane-page" className="min-h-0 flex-1">
        {loading ? (
          <div className="glass-panel flex h-full items-center justify-center rounded-xl p-4 text-muted-foreground">
            Loading task board...
          </div>
        ) : null}
        {!loading && error ? (
          <div className="glass-panel rounded-xl border-destructive/40 p-4">
            <p className="text-sm font-semibold text-destructive">Unable to load task board</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : null}
        {!loading && !error && snapshot ? <TaskBoard snapshot={snapshot} /> : null}
      </section>
    </main>
  );
}
