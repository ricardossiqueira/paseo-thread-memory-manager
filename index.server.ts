import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getDiskUsageCache, maybeScheduleRecompute, refreshDiskUsageCache } from "./server/disk-usage";
import { checkWorkspaceDone } from "./server/notify";
import { getDiskUsageCacheRpc, refreshDiskUsageCacheRpc } from "./shared/disk-usage";

export default function contribute(server: PluginServerContext) {
  const unsubscribe = server.on("agent.turn_ended", async (event, { paseo }) => {
    const workspaceId = event.agent.workspaceId;
    if (workspaceId) {
      await checkWorkspaceDone(paseo, workspaceId, event.agent.id);
    }
    maybeScheduleRecompute(paseo);
  });

  server.handle(getDiskUsageCacheRpc, getDiskUsageCache);
  server.handle(refreshDiskUsageCacheRpc, refreshDiskUsageCache);

  return () => {
    unsubscribe();
  };
}
