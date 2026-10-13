import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const sizeEntrySchema = z.object({
  bytes: z.number().nullable(),
  // False for "directory" workspaces: archiving them does not delete the
  // directory, since it's the user's own folder, not a disposable
  // Paseo-owned checkout.
  reclaimable: z.boolean(),
});

export const getDiskUsageCacheRpc = defineRpc({
  name: "thread-memory-manager.disk-usage-cache",
  input: z.object({}),
  output: z.object({
    updatedAt: z.string().nullable(),
    inProgress: z.boolean(),
    items: z.record(z.string(), sizeEntrySchema),
  }),
});

export const refreshDiskUsageCacheRpc = defineRpc({
  name: "thread-memory-manager.disk-usage-refresh",
  input: z.object({}),
  output: z.object({ started: z.boolean() }),
});
