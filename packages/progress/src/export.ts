import { ANONYMOUS, type LocalProgress } from "./model";
import { parseProgress } from "./parse";

export const EXPORT_FORMAT = "gitdojo-progress";
/** Version of the export envelope; the progress inside carries its own `schemaVersion`. */
export const EXPORT_VERSION = 1;

export interface ProgressExport {
  format: typeof EXPORT_FORMAT;
  exportVersion: typeof EXPORT_VERSION;
  exportedAt: string;
  progress: LocalProgress;
}

/** A self-describing, versioned snapshot of local progress, for download. */
export function exportProgress(progress: LocalProgress, now: number): ProgressExport {
  // Backups are portable between anonymous and account profiles. Do not disclose the internal
  // account UUID or export the server-derived counters as though they belonged to this device.
  const deviceProgress = { ...progress, owner: ANONYMOUS };
  delete deviceProgress.remoteCounters;
  delete deviceProgress.syncedAt;
  return {
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    progress: { ...deviceProgress, owner: ANONYMOUS },
  };
}

export function parseProgressExport(
  value: unknown,
  now: number,
): {
  progress: LocalProgress;
  issues: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("This is not a GitDojo progress backup.");
  }
  const backup = value as Record<string, unknown>;
  if (backup.format !== EXPORT_FORMAT || backup.exportVersion !== EXPORT_VERSION) {
    throw new Error("This backup format is not supported by this version of GitDojo.");
  }
  const parsed = parseProgress(backup.progress, now);
  const portableProgress = { ...parsed.progress, owner: ANONYMOUS };
  delete portableProgress.remoteCounters;
  delete portableProgress.syncedAt;
  return {
    progress: { ...portableProgress, owner: ANONYMOUS },
    issues: parsed.issues,
  };
}

/** `gitdojo-progress-2026-10-04.json` */
export function exportFileName(now: number): string {
  return `gitdojo-progress-${new Date(now).toISOString().slice(0, 10)}.json`;
}
