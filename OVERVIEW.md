Thread Memory Manager watches your threads, offers to archive the ones that finish, and tracks how
much disk space their worktree caches are using, so you don't have to hunt down done threads or
guess how much space archiving them would free.

When a thread's workspace reaches Paseo's "done" status, the plugin appends a small card right
into that thread's conversation asking whether to archive it now or leave it for later. Archiving
a workspace lets Paseo run its own cleanup for that workspace (including worktree removal for
worktree-backed workspaces), which is what actually frees disk space; this plugin does not touch
files on disk itself, aside from the small cache file described below.

A sidebar entry, "Done Threads", opens a screen listing every workspace currently in the "done"
status. Each row has a checkbox, its on-disk size, and how long ago it finished; a search box, a
per-project filter, and a "biggest first" sort help narrow a long list. Pick any subset and archive
just those, or archive everything currently visible in one go. The same screen is reachable from
the Command Center.

Disk sizes are measured on the daemon machine (via `du`) in the background and kept in a cache
file under the system temp directory, so opening the screen just reads that cache instantly
instead of scanning potentially huge worktrees on the spot. The cache refreshes itself after agent
activity if it's more than 10 minutes stale, or on demand via the "Refresh sizes" button, which
kicks off the scan in the background and polls until it's done. The screen totals how much cache
space the done workspaces occupy and how much archiving your current selection would actually
free. That total only counts Paseo-owned checkouts (worktrees); a "directory" workspace points at
a folder you opened yourself, so archiving it does not delete anything — those rows are marked with
an asterisk and excluded from the totals even if selected.

Detection runs when an agent's turn ends: the plugin checks whether that turn's workspace just
became "done" and, if so, appends the prompt once. It won't re-prompt the same workspace until it
leaves the "done" status and returns to it later. A workspace that was already "done" before the
plugin loaded, with no further activity since, won't get an inline prompt — but it still shows up
in the "Done Threads" screen, since that list reads live state directly.

Requires Paseo 0.11.0 or later. No settings, accounts, or external services.
