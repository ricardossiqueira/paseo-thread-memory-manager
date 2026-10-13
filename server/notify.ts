import type { PaseoApi } from "@getpaseo/client";
import { DONE_PROMPT_KIND, DONE_PROMPT_VERSION, donePromptItemId } from "../shared/timeline-item";

// Tracks which workspaces already got a done-prompt appended, so a daemon
// subprocess that stays alive across many turns doesn't re-append on every
// subsequent `agent.turn_ended` while the workspace stays "done".
const notifiedWorkspaceIds = new Set<string>();

export async function checkWorkspaceDone(paseo: PaseoApi, workspaceId: string, agentId: string): Promise<void> {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace || workspace.status !== "done") {
    // Status moved on (resumed, archived elsewhere, etc.) — allow a future
    // "done" transition to prompt again.
    notifiedWorkspaceIds.delete(workspaceId);
    return;
  }
  if (notifiedWorkspaceIds.has(workspaceId)) {
    return;
  }
  notifiedWorkspaceIds.add(workspaceId);

  await paseo.agents.ref(agentId).timeline.append({
    type: "plugin",
    id: donePromptItemId(workspaceId),
    kind: DONE_PROMPT_KIND,
    version: DONE_PROMPT_VERSION,
    data: {
      workspaceId,
      workspaceTitle: workspace.title ?? workspace.name,
      status: "pending",
    },
  });
}
