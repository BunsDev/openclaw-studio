import * as childProcess from "node:child_process";

type RunBrJsonOptions = {
  cwd?: string;
  env?: Record<string, string>;
};

const extractErrorMessage = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const direct = record.error;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    if (direct && typeof direct === "object") {
      const nested = (direct as Record<string, unknown>).message;
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
    return null;
  } catch {
    return null;
  }
};

const parseJsonOutput = (raw: string, command: string[]) => {
  if (!raw.trim()) {
    throw new Error(`Command produced empty JSON output: br ${command.join(" ")} --json`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Command produced invalid JSON output: br ${command.join(" ")} --json`);
  }
};

export const runBrJson = (command: string[], options?: RunBrJsonOptions): unknown => {
  const args = [...command, "--json"];
  const result = childProcess.spawnSync("br", args, {
    cwd: options?.cwd,
    env: { ...process.env, ...(options?.env ?? {}) },
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`Failed to execute br: ${result.error.message}`);
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const stderrText = stderr.trim();
    const stdoutText = stdout.trim();
    const message =
      extractErrorMessage(stdout) ??
      extractErrorMessage(stderr) ??
      (stderrText || stdoutText || `Command failed: br ${args.join(" ")}`);
    throw new Error(message);
  }
  return parseJsonOutput(stdout, command);
};

const parseScopePath = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const path = (value as Record<string, unknown>).path;
  return typeof path === "string" && path.trim().length > 0 ? path : null;
};

export async function loadTaskControlPlaneRawData(options?: {
  cwd?: string;
}): Promise<{
  scopePath: string | null;
  openIssues: unknown;
  inProgressIssues: unknown;
  blockedIssues: unknown;
}> {
  const scope = runBrJson(["where"], { cwd: options?.cwd });
  const openIssues = runBrJson(["list", "--status", "open", "--limit", "0"], {
    cwd: options?.cwd,
  });
  const inProgressIssues = runBrJson(["list", "--status", "in_progress", "--limit", "0"], {
    cwd: options?.cwd,
  });
  const blockedIssues = runBrJson(["blocked", "--limit", "0"], { cwd: options?.cwd });
  return {
    scopePath: parseScopePath(scope),
    openIssues,
    inProgressIssues,
    blockedIssues,
  };
}
