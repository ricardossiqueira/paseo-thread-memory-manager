import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Icon, ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { getDiskUsageCacheRpc, refreshDiskUsageCacheRpc } from "../shared/disk-usage";

type SortKey = "recent" | "size";

interface SizeInfo {
  bytes: number | null;
  reclaimable: boolean;
}

function formatAge(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDoneSince(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function CheckboxMark({ checked, theme }: { checked: boolean; theme: PluginTheme }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: checked ? theme.colors.accent : theme.colors.border,
        backgroundColor: checked ? theme.colors.accent : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? <Icon name="Check" size={14} color={theme.colors.accentForeground} /> : null}
    </View>
  );
}

function Chip({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: PluginTheme }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        backgroundColor: active ? theme.colors.accent : "transparent",
      }}
    >
      <Text style={{ color: active ? theme.colors.accentForeground : theme.colors.foreground, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export function DoneThreadsScreen({ theme, layout }: PluginScreenProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const getDiskUsageCache = useRpc(getDiskUsageCacheRpc);
  const refreshDiskUsageCache = useRpc(refreshDiskUsageCacheRpc);

  type WorkspaceEntry = Awaited<ReturnType<typeof paseo.workspaces.list>>["entries"][number];
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const [sizes, setSizes] = useState<Record<string, SizeInfo>>({});
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;

    const refetch = () => {
      void paseo.workspaces.list().then(({ entries }) => {
        if (!cancelled) setWorkspaces(entries);
      });
    };

    void paseo.workspaces
      .list({ subscribe: {} })
      .then(({ entries, subscription }) => {
        if (cancelled) {
          void subscription.release();
          return;
        }
        setWorkspaces(entries);
        setLoading(false);
        const unsubscribe = subscription.subscribe({
          snapshot: (snapshot) => setWorkspaces(snapshot.entries),
          update: () => refetch(),
        });
        release = () => {
          unsubscribe();
          void subscription.release();
        };
      })
      .catch((error: unknown) => {
        console.error("Failed to observe workspaces", error);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      release?.();
    };
  }, [paseo]);

  const done = useMemo(() => workspaces.filter((workspace) => workspace.status === "done"), [workspaces]);

  // Drop selections for workspaces that archived or otherwise left the done list.
  useEffect(() => {
    setSelected((current) => {
      const doneIds = new Set(done.map((workspace) => workspace.id));
      const next = new Set([...current].filter((id) => doneIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [done]);

  // Disk sizes come from a cache the daemon maintains in the background (see
  // server/disk-usage.ts) — reading it here is instant, never a slow `du`
  // scan, so opening this screen can't time out on large worktrees.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = () => {
      void getDiskUsageCache({})
        .then(({ updatedAt, inProgress, items }) => {
          if (cancelled) return;
          setCacheUpdatedAt(updatedAt);
          setMeasuring(inProgress);
          setSizes(items);
          if (inProgress) {
            timer = setTimeout(poll, 3000);
          }
        })
        .catch((error: unknown) => console.error("Failed to read disk usage cache", error));
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [getDiskUsageCache]);

  async function refreshSizes() {
    setMeasuring(true);
    try {
      await refreshDiskUsageCache({});
    } catch (error) {
      console.error("Failed to start disk usage refresh", error);
    }
    const poll = () => {
      void getDiskUsageCache({}).then(({ updatedAt, inProgress, items }) => {
        setCacheUpdatedAt(updatedAt);
        setMeasuring(inProgress);
        setSizes(items);
        if (inProgress) setTimeout(poll, 3000);
      });
    };
    setTimeout(poll, 1000);
  }

  const projects = useMemo(() => {
    const names = new Set(done.map((workspace) => workspace.projectDisplayName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [done]);

  const filtered = useMemo(() => {
    let list = done;
    if (projectFilter !== "all") {
      list = list.filter((workspace) => workspace.projectDisplayName === projectFilter);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((workspace) => {
        const title = (workspace.title ?? workspace.name).toLowerCase();
        const path = (workspace.workspaceDirectory ?? workspace.projectRootPath).toLowerCase();
        return title.includes(query) || path.includes(query);
      });
    }
    return [...list].sort((a, b) => {
      if (sortBy === "size") {
        const sizeA = sizes[a.id]?.bytes ?? -1;
        const sizeB = sizes[b.id]?.bytes ?? -1;
        return sizeB - sizeA;
      }
      const timeA = a.statusEnteredAt ? new Date(a.statusEnteredAt).getTime() : 0;
      const timeB = b.statusEnteredAt ? new Date(b.statusEnteredAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [done, projectFilter, search, sortBy, sizes]);

  const totalBytes = useMemo(
    () =>
      done.reduce((sum, workspace) => {
        const info = sizes[workspace.id];
        return info?.bytes != null && info.reclaimable ? sum + info.bytes : sum;
      }, 0),
    [done, sizes],
  );
  const freedBytes = useMemo(() => {
    let sum = 0;
    for (const id of selected) {
      const info = sizes[id];
      if (info?.bytes != null && info.reclaimable) sum += info.bytes;
    }
    return sum;
  }, [selected, sizes]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((workspace) => selected.has(workspace.id));

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      header: {
        padding: layout.compact ? 16 : 24,
        paddingBottom: 12,
        gap: 10,
      },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 18 : 20, fontWeight: "600" as const },
      summaryRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 16 },
      summaryText: { color: theme.colors.foregroundMuted, fontSize: 12 },
      filtersRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        gap: 8,
      },
      filterGroup: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 6 },
      filterLabel: { color: theme.colors.foregroundMuted, fontSize: 12 },
      searchInput: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
        color: theme.colors.foreground,
        minWidth: 200,
        flexGrow: 1,
      },
      actionsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        gap: 10,
      },
      selectAll: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      selectAllLabel: { color: theme.colors.foregroundMuted, fontSize: 13 },
      spacer: { flexGrow: 1 },
      list: {
        paddingHorizontal: layout.compact ? 16 : 24,
        paddingBottom: layout.compact ? 16 : 24,
        gap: 10,
      },
      empty: { color: theme.colors.foregroundMuted },
      row: {
        flexDirection: "row" as const,
        alignItems: "flex-start" as const,
        gap: 12,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      rowBody: { flex: 1, gap: 2 },
      rowTitle: { color: theme.colors.foreground, fontWeight: "600" as const },
      rowSubtitle: { color: theme.colors.foregroundMuted, fontSize: 12 },
      rowMetaRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 10, marginTop: 4 },
      rowMeta: { color: theme.colors.foregroundMuted, fontSize: 12 },
      rowSize: { color: theme.colors.foreground, fontSize: 12, fontWeight: "600" as const },
      additions: { color: theme.colors.statusSuccess, fontSize: 12 },
      deletions: { color: theme.colors.statusDanger, fontSize: 12 },
      button: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      ghostButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      buttonDisabled: { opacity: 0.5 },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      ghostButtonText: { color: theme.colors.foreground, fontWeight: "600" as const },
    }),
    [theme, layout.compact],
  );

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((current) => {
      if (allFilteredSelected) {
        const next = new Set(current);
        for (const workspace of filtered) next.delete(workspace.id);
        return next;
      }
      const next = new Set(current);
      for (const workspace of filtered) next.add(workspace.id);
      return next;
    });
  }

  async function archiveIds(ids: readonly string[]) {
    if (ids.length === 0) return;
    setArchiving(true);
    let failures = 0;
    for (const id of ids) {
      try {
        await paseo.workspaces.archive(id);
      } catch {
        failures += 1;
      }
    }
    setArchiving(false);
    if (failures === 0) {
      toast.show(`Archived ${ids.length} thread(s).`, { variant: "success" });
    } else {
      toast.error(`${failures} of ${ids.length} thread(s) failed to archive.`);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Done Threads ({filtered.length}/{done.length})</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>Cache used by done threads (worktrees): {formatBytes(totalBytes)}</Text>
          <Text style={styles.summaryText}>
            Space to free with selection: {selected.size > 0 ? formatBytes(freedBytes) : "—"}
          </Text>
          <Text style={styles.summaryText}>
            {measuring ? "Measuring in the background…" : `Sizes updated ${formatAge(cacheUpdatedAt)}`}
          </Text>
        </View>

        {done.length > 0 && (
          <>
            <View style={styles.filtersRow}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by title or path"
                placeholderTextColor={theme.colors.foregroundMuted}
                style={styles.searchInput}
              />
              {projects.length > 1 && (
                <View style={styles.filterGroup}>
                  <Text style={styles.filterLabel}>Project:</Text>
                  <Chip label="All" active={projectFilter === "all"} onPress={() => setProjectFilter("all")} theme={theme} />
                  {projects.map((project) => (
                    <Chip
                      key={project}
                      label={project}
                      active={projectFilter === project}
                      onPress={() => setProjectFilter(project)}
                      theme={theme}
                    />
                  ))}
                </View>
              )}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Sort:</Text>
                <Chip label="Most recent" active={sortBy === "recent"} onPress={() => setSortBy("recent")} theme={theme} />
                <Chip label="Biggest size" active={sortBy === "size"} onPress={() => setSortBy("size")} theme={theme} />
              </View>
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allFilteredSelected }}
                accessibilityLabel="Select all visible"
                style={styles.selectAll}
                onPress={toggleAllFiltered}
              >
                <CheckboxMark checked={allFilteredSelected} theme={theme} />
                <Text style={styles.selectAllLabel}>Select visible</Text>
              </Pressable>
              <View style={styles.spacer} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Archive selected (${selected.size})`}
                style={[styles.button, (archiving || selected.size === 0) && styles.buttonDisabled]}
                disabled={archiving || selected.size === 0}
                onPress={() => void archiveIds([...selected])}
              >
                <Text style={styles.buttonText}>Archive selected ({selected.size})</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Archive all visible"
                style={[styles.button, (archiving || filtered.length === 0) && styles.buttonDisabled]}
                disabled={archiving || filtered.length === 0}
                onPress={() => void archiveIds(filtered.map((workspace) => workspace.id))}
              >
                {archiving ? (
                  <ActivityIndicator color={theme.colors.accentForeground} />
                ) : (
                  <Text style={styles.buttonText}>Archive visible</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh disk sizes"
                style={[styles.ghostButton, measuring && styles.buttonDisabled]}
                disabled={measuring}
                onPress={() => void refreshSizes()}
              >
                {measuring ? (
                  <ActivityIndicator color={theme.colors.foreground} />
                ) : (
                  <Text style={styles.ghostButtonText}>Refresh sizes</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {loading ? (
          <ActivityIndicator color={theme.colors.foregroundMuted} />
        ) : done.length === 0 ? (
          <Text style={styles.empty}>No done threads waiting to be archived.</Text>
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>No threads match the current filters.</Text>
        ) : (
          filtered.map((workspace) => {
            const title = workspace.title ?? workspace.name;
            const path = workspace.workspaceDirectory ?? workspace.projectRootPath;
            const hasDiff = workspace.diffStat && (workspace.diffStat.additions > 0 || workspace.diffStat.deletions > 0);
            const size = sizes[workspace.id];
            return (
              <Pressable
                key={workspace.id}
                style={styles.row}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected.has(workspace.id) }}
                accessibilityLabel={`Select ${title}`}
                onPress={() => toggleOne(workspace.id)}
              >
                <CheckboxMark checked={selected.has(workspace.id)} theme={theme} />
                <View style={styles.rowBody}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={styles.rowTitle}>{title}</Text>
                    {size ? (
                      <Text style={styles.rowSize}>
                        {formatBytes(size.bytes)}
                        {!size.reclaimable ? " *" : ""}
                      </Text>
                    ) : measuring ? (
                      <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
                    ) : (
                      <Text style={styles.rowSize}>—</Text>
                    )}
                  </View>
                  <Text style={styles.rowSubtitle}>
                    {workspace.projectDisplayName} · {path}
                  </Text>
                  <View style={styles.rowMetaRow}>
                    <Text style={styles.rowMeta}>Done {formatDoneSince(workspace.statusEnteredAt)}</Text>
                    {hasDiff && workspace.diffStat && (
                      <Text style={styles.rowMeta}>
                        <Text style={styles.additions}>+{workspace.diffStat.additions}</Text>{" "}
                        <Text style={styles.deletions}>-{workspace.diffStat.deletions}</Text>
                      </Text>
                    )}
                    {size && !size.reclaimable && (
                      <Text style={styles.rowMeta}>* own folder — archiving won't free space</Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
