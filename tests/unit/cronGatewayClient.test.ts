import { describe, expect, it, vi } from "vitest";

import {
  listCronJobs,
  removeCronJob,
  runCronJobNow,
} from "@/lib/cron/gateway";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";

describe("cron gateway client", () => {
  it("lists_jobs_via_cron_list_include_disabled_true", async () => {
    const client = {
      call: vi.fn(async () => ({ jobs: [] })),
    } as unknown as GatewayClient;

    await listCronJobs(client);

    expect(client.call).toHaveBeenCalledWith("cron.list", { includeDisabled: true });
  });

  it("runs_job_now_with_force_mode", async () => {
    const client = {
      call: vi.fn(async () => ({ ok: true, ran: true })),
    } as unknown as GatewayClient;

    await runCronJobNow(client, "job-1");

    expect(client.call).toHaveBeenCalledWith("cron.run", { id: "job-1", mode: "force" });
  });

  it("removes_job_by_id", async () => {
    const client = {
      call: vi.fn(async () => ({ ok: true, removed: true })),
    } as unknown as GatewayClient;

    await removeCronJob(client, "job-1");

    expect(client.call).toHaveBeenCalledWith("cron.remove", { id: "job-1" });
  });

  it("throws_when_job_id_missing_for_run_or_remove", async () => {
    const client = {
      call: vi.fn(async () => ({ ok: true })),
    } as unknown as GatewayClient;

    await expect(runCronJobNow(client, "   ")).rejects.toThrow("Cron job id is required.");
    await expect(removeCronJob(client, "")).rejects.toThrow("Cron job id is required.");
  });
});
