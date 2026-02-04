import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import type { CronJobSummary } from "./types";

export type CronListParams = {
  includeDisabled?: boolean;
};

export type CronListResult = {
  jobs: CronJobSummary[];
};

export type CronRunResult =
  | { ok: true; ran: true }
  | { ok: true; ran: false; reason: "not-due" }
  | { ok: false };

export type CronRemoveResult = { ok: true; removed: boolean } | { ok: false; removed: false };

const resolveJobId = (jobId: string): string => {
  const trimmed = jobId.trim();
  if (!trimmed) {
    throw new Error("Cron job id is required.");
  }
  return trimmed;
};

export const listCronJobs = async (
  client: GatewayClient,
  params: CronListParams = {}
): Promise<CronListResult> => {
  const includeDisabled = params.includeDisabled ?? true;
  return client.call<CronListResult>("cron.list", {
    includeDisabled,
  });
};

export const runCronJobNow = async (
  client: GatewayClient,
  jobId: string
): Promise<CronRunResult> => {
  const id = resolveJobId(jobId);
  return client.call<CronRunResult>("cron.run", {
    id,
    mode: "force",
  });
};

export const removeCronJob = async (
  client: GatewayClient,
  jobId: string
): Promise<CronRemoveResult> => {
  const id = resolveJobId(jobId);
  return client.call<CronRemoveResult>("cron.remove", {
    id,
  });
};
