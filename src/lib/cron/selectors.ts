import type { CronJobSummary } from "./types";

export const filterCronJobsForAgent = (jobs: CronJobSummary[], agentId: string): CronJobSummary[] => {
  const trimmedAgentId = agentId.trim();
  if (!trimmedAgentId) return [];
  return jobs.filter((job) => job.agentId?.trim() === trimmedAgentId);
};

export const resolveLatestCronJobForAgent = (
  jobs: CronJobSummary[],
  agentId: string
): CronJobSummary | null => {
  const filtered = filterCronJobsForAgent(jobs, agentId);
  if (filtered.length === 0) return null;
  return [...filtered].sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0] ?? null;
};
