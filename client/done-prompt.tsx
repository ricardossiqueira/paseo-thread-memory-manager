import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { DONE_PROMPT_KIND, DONE_PROMPT_VERSION, type DonePromptData, donePromptItemId } from "../shared/timeline-item";

export function DonePromptItem({ theme, agentId, item }: PluginTimelineItemProps<DonePromptData>) {
  const paseo = usePaseo();
  const toast = useToast();
  const [busy, setBusy] = useState<"archive" | "dismiss" | null>(null);
  const { workspaceId, workspaceTitle, status } = item.data;

  const styles = useMemo(
    () => ({
      card: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        padding: 12,
        gap: 8,
      },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      row: { flexDirection: "row" as const, gap: 8 },
      primaryButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      primaryButtonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      secondaryButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      secondaryButtonText: { color: theme.colors.foreground },
    }),
    [theme],
  );

  async function appendStatus(nextStatus: DonePromptData["status"]) {
    await paseo.agents.ref(agentId).timeline.append({
      type: "plugin",
      id: donePromptItemId(workspaceId),
      kind: DONE_PROMPT_KIND,
      version: DONE_PROMPT_VERSION,
      data: { workspaceId, workspaceTitle, status: nextStatus },
    });
  }

  async function archiveNow() {
    setBusy("archive");
    try {
      await paseo.workspaces.archive(workspaceId);
      await appendStatus("archived");
      toast.show(`Archived "${workspaceTitle}".`, { variant: "success" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive.");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setBusy("dismiss");
    try {
      await appendStatus("dismissed");
    } finally {
      setBusy(null);
    }
  }

  if (status !== "pending") {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>
          {status === "archived"
            ? `"${workspaceTitle}" was archived.`
            : `Archiving "${workspaceTitle}" was postponed.`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.text}>This thread is done. Archive it now?</Text>
      <Text style={styles.muted}>{workspaceTitle}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Archive ${workspaceTitle}`}
          style={styles.primaryButton}
          disabled={busy !== null}
          onPress={() => void archiveNow()}
        >
          {busy === "archive" ? (
            <ActivityIndicator color={theme.colors.accentForeground} />
          ) : (
            <Text style={styles.primaryButtonText}>Archive now</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          style={styles.secondaryButton}
          disabled={busy !== null}
          onPress={() => void dismiss()}
        >
          {busy === "dismiss" ? (
            <ActivityIndicator color={theme.colors.foreground} />
          ) : (
            <Text style={styles.secondaryButtonText}>Not now</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
