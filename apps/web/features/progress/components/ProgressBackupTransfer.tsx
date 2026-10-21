"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@gitdojo/ui";
import { FileDown, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import {
  exportFileName,
  exportProgress,
  parseProgressExport,
  type LocalProgress,
} from "@gitdojo/progress";
import { restoreProgressBackup, useProgressStore } from "../state/use-progress-store";

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

type PendingBackup = { progress: LocalProgress; issues: string[] };

function downloadBackup(progress: LocalProgress): void {
  const blob = new Blob([JSON.stringify(exportProgress(progress, Date.now()), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(Date.now());
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** A portable JSON backup and merge-only restore for anonymous and signed-in progress. */
export function ProgressBackupTransfer({ onMessage }: { onMessage: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const progress = useProgressStore((state) => state.progress);
  const ready = useProgressStore((state) => state.status === "ready");
  const signedIn = useProgressStore((state) => state.mode === "account");
  const [pending, setPending] = useState<PendingBackup | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const chooseFile = async (file: File | undefined) => {
    setError("");
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError("This backup is too large. Choose a GitDojo backup smaller than 2 MB.");
      return;
    }
    try {
      const value: unknown = JSON.parse(await file.text());
      setPending(parseProgressExport(value, Date.now()));
    } catch {
      setError("We couldn't read that backup. Choose a valid GitDojo progress JSON file.");
    }
  };

  const restore = async () => {
    if (!pending || working) return;
    setWorking(true);
    try {
      const result = await restoreProgressBackup(pending.progress);
      if (result === "not-ready") {
        setError("Progress is still loading. Wait a moment, then try again.");
        return;
      }
      if (result === "activity-sync-failed") {
        setError(
          "The backup was merged on this device, but its activity hasn't synced to your account yet. Keep this file and import it again when your account is reachable.",
        );
        setPending(null);
        return;
      }
      setPending(null);
      onMessage("Progress backup restored and merged.");
    } catch {
      setError("We couldn't restore this backup. Your existing progress was kept.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        disabled={!ready || !progress}
        onClick={() => {
          if (progress) downloadBackup(progress);
          onMessage("Progress JSON backup downloaded.");
        }}
        data-testid="export-progress-backup"
      >
        <FileDown /> Download JSON backup
      </Button>
      <Button
        variant="secondary"
        disabled={!ready || working}
        onClick={() => input.current?.click()}
        data-testid="import-progress-backup"
      >
        <FileUp /> Restore from backup
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Choose a GitDojo progress backup"
        onChange={(event) => {
          void chooseFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {error ? (
        <p role="alert" className="basis-full text-small text-danger" data-testid="backup-error">
          {error}
        </p>
      ) : null}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !working) setPending(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Restore progress backup?</DialogTitle>
          <DialogDescription>
            This merges completed lessons, challenges, Practice tasks, hints, and activity into your
            current progress. Existing records win when the same item is already complete. Your
            current progress will not be replaced.
            {signedIn
              ? " Imported completions and activity will sync to this account."
              : " The restored progress stays in this browser until you sign in."}
          </DialogDescription>
          {pending && pending.issues.length > 0 ? (
            <p className="mt-3 text-caption text-warning">
              Some damaged entries will be skipped ({String(pending.issues.length)} issue
              {pending.issues.length === 1 ? "" : "s"}).
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={working}
              onClick={() => {
                setPending(null);
              }}
            >
              Cancel
            </Button>
            <Button disabled={working} onClick={() => void restore()} data-testid="confirm-restore">
              {working ? "Restoring…" : "Merge progress"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
