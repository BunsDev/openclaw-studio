export type TaskControlPlaneColumn = "ready" | "in_progress" | "blocked";

export type TaskControlPlaneCard = {
  id: string;
  title: string;
  column: TaskControlPlaneColumn;
  status: string;
  priority: number | null;
  updatedAt: string | null;
  assignee: string | null;
  labels: string[];
  decisionNeeded: boolean;
  blockedBy: string[];
};

export type TaskControlPlaneSnapshot = {
  generatedAt: string;
  scopePath: string | null;
  columns: {
    ready: TaskControlPlaneCard[];
    inProgress: TaskControlPlaneCard[];
    blocked: TaskControlPlaneCard[];
  };
  warnings: string[];
};

type IssueRecord = Record<string, unknown>;

const toIssueArray = (
  value: unknown,
  source: string,
  warnings: string[]
): IssueRecord[] => {
  if (!Array.isArray(value)) {
    warnings.push(`Expected ${source} to be an array.`);
    return [];
  }
  const issues: IssueRecord[] = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      warnings.push(`Skipping non-object issue at ${source}[${index}].`);
      return;
    }
    issues.push(entry as IssueRecord);
  });
  return issues;
};

const parseString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const parseNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : null))
    .filter((entry): entry is string => Boolean(entry));
};

const buildCard = (
  issue: IssueRecord,
  column: TaskControlPlaneColumn,
  warnings: string[]
): TaskControlPlaneCard | null => {
  const id = parseString(issue.id);
  if (!id) {
    warnings.push("Skipping issue missing id.");
    return null;
  }
  const title = parseString(issue.title) ?? `Issue ${id}`;
  const labels = parseStringList(issue.labels);
  const status = parseString(issue.status) ?? (column === "in_progress" ? "in_progress" : "open");
  const blockedBy = parseStringList(issue.blocked_by ?? issue.blockedBy);
  const decisionNeeded = labels.some((label) => label.toLowerCase() === "decision-needed");

  return {
    id,
    title,
    column,
    status,
    priority: parseNumber(issue.priority),
    updatedAt: parseString(issue.updated_at ?? issue.updatedAt),
    assignee: parseString(issue.assignee),
    labels,
    decisionNeeded,
    blockedBy,
  };
};

const compareCards = (left: TaskControlPlaneCard, right: TaskControlPlaneCard) => {
  const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  const leftUpdated = left.updatedAt ? Date.parse(left.updatedAt) : 0;
  const rightUpdated = right.updatedAt ? Date.parse(right.updatedAt) : 0;
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
  return left.id.localeCompare(right.id);
};

const toCardMap = (cards: TaskControlPlaneCard[]) => {
  const map = new Map<string, TaskControlPlaneCard>();
  cards.forEach((card) => {
    if (!map.has(card.id)) {
      map.set(card.id, card);
    }
  });
  return map;
};

export function buildTaskControlPlaneSnapshot(input: {
  openIssues: unknown;
  inProgressIssues: unknown;
  blockedIssues: unknown;
  scopePath?: string | null;
}): TaskControlPlaneSnapshot {
  const warnings: string[] = [];
  const blockedCards = toIssueArray(input.blockedIssues, "blockedIssues", warnings)
    .map((issue) => buildCard(issue, "blocked", warnings))
    .filter((card): card is TaskControlPlaneCard => Boolean(card));
  const blockedMap = toCardMap(blockedCards);

  const inProgressCards = toIssueArray(input.inProgressIssues, "inProgressIssues", warnings)
    .map((issue) => buildCard(issue, "in_progress", warnings))
    .filter((card): card is TaskControlPlaneCard => Boolean(card))
    .filter((card) => !blockedMap.has(card.id));
  const inProgressMap = toCardMap(inProgressCards);

  const readyCards = toIssueArray(input.openIssues, "openIssues", warnings)
    .map((issue) => buildCard(issue, "ready", warnings))
    .filter((card): card is TaskControlPlaneCard => Boolean(card))
    .filter((card) => !blockedMap.has(card.id) && !inProgressMap.has(card.id));

  return {
    generatedAt: new Date().toISOString(),
    scopePath: input.scopePath ?? null,
    columns: {
      ready: readyCards.sort(compareCards),
      inProgress: [...inProgressMap.values()].sort(compareCards),
      blocked: [...blockedMap.values()].sort(compareCards),
    },
    warnings,
  };
}
