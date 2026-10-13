import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DonePromptItem } from "./client/done-prompt";
import { DoneThreadsScreen } from "./client/done-threads-screen";
import { DoneThreadsSidebarItem } from "./client/done-threads-sidebar-item";
import { DONE_PROMPT_KIND, DONE_PROMPT_VERSION, donePromptDataSchema } from "./shared/timeline-item";

export default function contribute(client: PluginClientContext) {
  const removeRenderer = client.addTimelineRenderer({
    kind: DONE_PROMPT_KIND,
    version: DONE_PROMPT_VERSION,
    schema: donePromptDataSchema,
    Component: DonePromptItem,
  });

  const removeScreen = client.addScreen({
    id: "done-threads",
    title: "Done Threads",
    Component: DoneThreadsScreen,
  });

  const removeSidebarItem = client.addSidebarHeaderItem({
    id: "done-threads",
    title: "Done Threads",
    Component: DoneThreadsSidebarItem,
  });

  const removeCommand = client.addCommandCenterItem({
    id: "open-done-threads",
    title: "Open Done Threads",
    icon: "Archive",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "done-threads" });
    },
  });

  return () => {
    removeRenderer();
    removeScreen();
    removeSidebarItem();
    removeCommand();
  };
}
