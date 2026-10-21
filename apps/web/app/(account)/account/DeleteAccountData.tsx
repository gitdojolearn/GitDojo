"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@gitdojo/ui";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearProgressAfterAccountDeletion,
  prepareForAccountDeletion,
  resumeAfterAccountDeletion,
} from "@/features/progress";
import { markSignOutIntent } from "@/features/auth/services/sign-out-intent";

/** Deletes GitDojo account data after an explicit typed confirmation. */
export function DeleteAccountData() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (busy || confirmation !== "DELETE") return;
    setBusy(true);
    setError(null);
    let deleted = false;
    try {
      await prepareForAccountDeletion();
      const response = await fetch("/api/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Account deletion could not be completed. Please try again.");
      deleted = true;
      try {
        await clearProgressAfterAccountDeletion();
      } catch {
        // The server deletion is final; still end this session if browser storage is unavailable.
      }
      markSignOutIntent();
      router.push("/auth/sign-out");
    } catch (cause) {
      if (!deleted) resumeAfterAccountDeletion();
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "Account deletion could not be completed.");
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => { setConfirmation(""); setError(null); setOpen(true); }}>
        <Trash2 aria-hidden="true" /> Delete GitDojo account data
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent aria-busy={busy}>
          <DialogTitle>Delete your GitDojo account data?</DialogTitle>
          <DialogDescription>
            This permanently deletes your GitDojo profile, synced progress, settings, and assessment
            attempts. Your certificates will be revoked and kept without your name so their status
            remains verifiable. Your sign-in identity at the identity provider is not deleted.
            Anonymous progress and playground files stored in this browser are kept.
          </DialogDescription>
          <label className="mt-4 block text-small font-medium text-fg" htmlFor="delete-account-confirmation">
            Type DELETE to confirm
          </label>
          <input
            id="delete-account-confirmation"
            autoComplete="off"
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-fg"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
            }}
            disabled={busy}
          />
          {error ? <p role="alert" className="mt-3 text-small text-danger">{error}</p> : null}
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => {
              setOpen(false);
            }}>Cancel</Button>
            <Button variant="danger" disabled={busy || confirmation !== "DELETE"} onClick={() => { void remove(); }}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              Delete account data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
