import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

export function DoneThreadsSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Archive"
      active={currentScreen?.screenId === "done-threads"}
      onPress={() => openScreen({ screenId: "done-threads" })}
    />
  );
}
