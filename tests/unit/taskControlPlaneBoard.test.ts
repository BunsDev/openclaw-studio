import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskBoard } from "@/features/task-control-plane/components/TaskBoard";
import type { TaskControlPlaneSnapshot } from "@/lib/task-control-plane/read-model";

const snapshot: TaskControlPlaneSnapshot = {
  generatedAt: "2026-02-05T00:00:00.000Z",
  scopePath: "/tmp/.beads",
  columns: {
    ready: [
      {
        id: "bd-1",
        title: "Ready task",
        column: "ready",
        status: "open",
        priority: 2,
        updatedAt: "2026-02-05T00:00:00.000Z",
        assignee: null,
        labels: ["decision-needed"],
        decisionNeeded: true,
        blockedBy: [],
      },
    ],
    inProgress: [],
    blocked: [],
  },
  warnings: [],
};

describe("TaskBoard", () => {
  it("renders three columns and decision badge", () => {
    render(createElement(TaskBoard, { snapshot }));

    expect(screen.getByTestId("task-control-column-ready")).toBeInTheDocument();
    expect(screen.getByTestId("task-control-column-in-progress")).toBeInTheDocument();
    expect(screen.getByTestId("task-control-column-blocked")).toBeInTheDocument();
    expect(screen.getByText("Decision Needed")).toBeInTheDocument();
  });
});
