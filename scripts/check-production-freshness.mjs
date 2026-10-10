import { pathToFileURL } from "node:url";

export function assessFreshness({ monitor, backup, artifacts, now = Date.now() }) {
  const recent = (run, maximumAge, requireSuccess = true) => {
    const completed = Date.parse(run?.updated_at ?? "");
    return run?.status === "completed" && (!requireSuccess || run?.conclusion === "success")
      && Number.isFinite(completed) && completed <= now && now - completed <= maximumAge;
  };
  const monitorOk = monitor?.event === "schedule" && recent(monitor, 30 * 60_000, false);
  const backupOk = recent(backup, 30 * 60 * 60_000);
  const artifactOk = (artifacts ?? []).some((artifact) =>
    artifact.name === `leavectrl-db-backup-${backup?.id}`
    && artifact.expired === false && artifact.size_in_bytes > 0
    && /^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? "")
    && Date.parse(artifact.expires_at) > now);
  return { healthy: monitorOk && backupOk && artifactOk,
    scheduled_monitor_execution_recent: monitorOk, successful_backup_recent: backupOk,
    backup_artifact_available: artifactOk, checked_at: new Date(now).toISOString(),
    monitor_run: monitor?.id ?? null, backup_run: backup?.id ?? null };
}

export async function checkProductionFreshness(request = fetch) {
  const base = "https://api.github.com/repos/langaludidi/LeaveCtrl";
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  async function get(path) {
    const response = await request(base + path, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Workflow verification unavailable (HTTP ${response.status})`);
    return response.json();
  }
  const [monitorResult, backupResult] = await Promise.all([
    get("/actions/workflows/production-monitor.yml/runs?branch=main&event=schedule&status=completed&per_page=1"),
    get("/actions/workflows/database-backup.yml/runs?branch=main&status=success&per_page=1"),
  ]);
  const monitor = monitorResult.workflow_runs?.[0];
  const backup = backupResult.workflow_runs?.[0];
  const artifacts = backup ? (await get(`/actions/runs/${backup.id}/artifacts?per_page=100`)).artifacts : [];
  return assessFreshness({ monitor, backup, artifacts });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkProductionFreshness();
    console.log(JSON.stringify(result, null, 2));
    if (!result.healthy) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ healthy: false, verification: "unavailable", error: error.message }));
    process.exitCode = 1;
  }
}
