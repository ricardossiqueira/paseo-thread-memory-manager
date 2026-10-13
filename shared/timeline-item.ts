import { z } from "zod";

export const DONE_PROMPT_KIND = "thread-memory-manager-done-prompt";
export const DONE_PROMPT_VERSION = 1;

export const donePromptDataSchema = z.object({
  workspaceId: z.string(),
  workspaceTitle: z.string(),
  status: z.enum(["pending", "archived", "dismissed"]),
});

export type DonePromptData = z.infer<typeof donePromptDataSchema>;

export function donePromptItemId(workspaceId: string): string {
  return `thread-memory-manager-${workspaceId}`;
}
