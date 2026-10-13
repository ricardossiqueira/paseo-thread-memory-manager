import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { execCommand } from "@getpaseo/plugin/server";

type Paseo = PluginHandlerContext["paseo"];

const CACHE_DIR = join(tmpdir(), "paseo-thread-memory-manager");
const CACHE_FILE = join(CACHE_DIR, "disk-usage-cache.json");
const PAGE_LIMIT = 200;
// Piggybacks on agent.turn_ended hooks instead of a real timer (the plugin
// SDK has no way to reach `paseo` outside a hook/RPC callback), so this just
// caps how often an unrelated turn-ended event retriggers a full rescan.
const MIN_RECOMPUTE_INTERVAL_MS = 10 * 60 * 1000;
const DU_TIMEOUT_MS = 120_000;

interface SizeEntry {
  bytes: number | null;
  reclaimable: boolean;
}

interface CacheFile {
  updatedAt: string | null;
  items: Record<string, SizeEntry>;
}

let cache: CacheFile = { updatedAt: null, items: {} };
let inProgress = false;
let loaded = false;

async function loadCacheOnce(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    if (parsed && typeof parsed === "object" && parsed.items) {
      cache = parsed;
    }
  } catch {
    // No cache on disk yet, or it's unreadable — start fresh.
  }
}

async function persistCache(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache));
  } catch (error) {
    console.error("[thread-memory-manager] failed to persist disk usage cache", error);
  }
}

async function measureDirectoryBytes(path: string): Promise<number | null> {
  try {
    const { stdout } = await execCommand("du", ["-sk", path], { timeout: DU_TIMEOUT_MS });
    const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? "", 10);
    return Number.isFinite(kb) ? kb * 1024 : null;
  } catch (error) {
    console.error(`[thread-memory-manager] du failed for ${path}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

interface DoneWorkspace {
  id: string;
  path: string | null;
  reclaimable: boolean;
}

async function listDoneWorkspaces(paseo: Paseo): Promise<DoneWorkspace[]> {
  const result: DoneWorkspace[] = [];
  let cursor: string | undefined;
  for (;;) {
    const { entries, pageInfo } = await paseo.workspaces.list({ page: { limit: PAGE_LIMIT, cursor } });
    for (const workspace of entries) {
      if (workspace.status !== "done") continue;
      result.push({
        id: workspace.id,
        path: workspace.workspaceDirectory ?? workspace.projectRootPath ?? null,
        reclaimable: workspace.workspaceKind !== "directory",
      });
    }
    if (!pageInfo.hasMore || !pageInfo.nextCursor) break;
    cursor = pageInfo.nextCursor;
  }
  return result;
}

async function recomputeCache(paseo: Paseo): Promise<void> {
  if (inProgress) return;
  inProgress = true;
  console.log("[thread-memory-manager] recomputing disk usage cache");
  try {
    const workspaces = await listDoneWorkspaces(paseo);
    console.log(`[thread-memory-manager] measuring ${workspaces.length} done workspace(s)`);
    const items: Record<string, SizeEntry> = {};
    // Cache the du result per distinct path: several "directory" workspaces
    // commonly share the same folder (e.g. several threads opened against
    // the same checked-out repo), and re-scanning that folder once per
    // workspace is both slow and double-counts it in the totals.
    const byPath = new Map<string, number | null>();
    for (const workspace of workspaces) {
      if (!workspace.path || !workspace.reclaimable) {
        // Non-worktree workspaces point at a folder the user opened
        // themselves; archiving never deletes it, so there's nothing to
        // measure for this feature's purpose.
        items[workspace.id] = { bytes: null, reclaimable: workspace.reclaimable };
        continue;
      }
      let bytes = byPath.get(workspace.path);
      if (bytes === undefined) {
        bytes = await measureDirectoryBytes(workspace.path);
        byPath.set(workspace.path, bytes);
        console.log(`[thread-memory-manager] ${workspace.path} -> ${bytes ?? "unknown"} bytes`);
      }
      items[workspace.id] = { bytes, reclaimable: workspace.reclaimable };
    }
    cache = { updatedAt: new Date().toISOString(), items };
    await persistCache();
    console.log(`[thread-memory-manager] disk usage cache updated (${workspaces.length} workspaces)`);
  } catch (error) {
    console.error("[thread-memory-manager] disk usage recompute failed", error);
  } finally {
    inProgress = false;
  }
}

/** Called from lifecycle hooks; cheap no-op unless the cache is stale and idle. */
export function maybeScheduleRecompute(paseo: Paseo): void {
  if (inProgress) return;
  const lastRun = cache.updatedAt ? new Date(cache.updatedAt).getTime() : 0;
  if (Date.now() - lastRun < MIN_RECOMPUTE_INTERVAL_MS) return;
  void recomputeCache(paseo);
}

export async function getDiskUsageCache() {
  await loadCacheOnce();
  return { updatedAt: cache.updatedAt, inProgress, items: cache.items };
}

export async function refreshDiskUsageCache(_input: Record<string, never>, { paseo }: { paseo: Paseo }) {
  await loadCacheOnce();
  if (!inProgress) {
    void recomputeCache(paseo);
  }
  return { started: true };
}
