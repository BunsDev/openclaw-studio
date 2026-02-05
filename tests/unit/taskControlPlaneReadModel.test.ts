import { describe, expect, it } from "vitest";

import { buildTaskControlPlaneSnapshot } from "@/lib/task-control-plane/read-model";

describe("buildTaskControlPlaneSnapshot", () => {
  it("buildReadModel_returnsEmptyColumnsWhenNoTasks", () => {
    const snapshot = buildTaskControlPlaneSnapshot({
      openIssues: [],
      inProgressIssues: [],
      blockedIssues: [],
      scopePath: "/tmp/.beads",
    });

    expect(snapshot.columns.ready).toEqual([]);
    expect(snapshot.columns.inProgress).toEqual([]);
    expect(snapshot.columns.blocked).toEqual([]);
    expect(snapshot.scopePath).toBe("/tmp/.beads");
    expect(snapshot.warnings).toEqual([]);
  });

  it("buildReadModel_partitionsOpenBlockedAndInProgress", () => {
    const snapshot = buildTaskControlPlaneSnapshot({
      openIssues: [
        { id: "bd-1", title: "Ready item", status: "open", priority: 2 },
        { id: "bd-2", title: "Blocked item", status: "open", priority: 1 },
        { id: "bd-3", title: "Claimed item", status: "open", priority: 0 },
      ],
      inProgressIssues: [
        {
          id: "bd-3",
          title: "Claimed item",
          status: "in_progress",
          assignee: "georgepickett",
          priority: 0,
        },
      ],
      blockedIssues: [
        {
          id: "bd-2",
          title: "Blocked item",
          status: "open",
          blocked_by: ["bd-100"],
          priority: 1,
        },
      ],
    });

    expect(snapshot.columns.ready.map((card) => card.id)).toEqual(["bd-1"]);
    expect(snapshot.columns.inProgress.map((card) => card.id)).toEqual(["bd-3"]);
    expect(snapshot.columns.blocked.map((card) => card.id)).toEqual(["bd-2"]);
    expect(snapshot.columns.blocked[0]?.blockedBy).toEqual(["bd-100"]);
  });

  it("buildReadModel_marksDecisionNeededFromLabel", () => {
    const snapshot = buildTaskControlPlaneSnapshot({
      openIssues: [
        {
          id: "bd-4",
          title: "Needs operator decision",
          status: "open",
          labels: ["area:ops", "Decision-Needed"],
        },
      ],
      inProgressIssues: [],
      blockedIssues: [],
    });

    expect(snapshot.columns.ready[0]?.decisionNeeded).toBe(true);
  });

  it("buildReadModel_handlesMissingOptionalFields", () => {
    const snapshot = buildTaskControlPlaneSnapshot({
      openIssues: [{ id: "bd-9" }],
      inProgressIssues: [],
      blockedIssues: [],
    });

    expect(snapshot.columns.ready[0]).toMatchObject({
      id: "bd-9",
      title: "Issue bd-9",
      priority: null,
      assignee: null,
      updatedAt: null,
      blockedBy: [],
      decisionNeeded: false,
    });
  });
});
