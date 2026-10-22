"use client";

import { type ProgressCatalog } from "@gitdojo/progress";
import { Button, IconButton } from "@gitdojo/ui";
import { TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserProgressRepository } from "../services/browser-progress";
import {
  initProgress,
  retryPendingVerification,
  resolveBrowserAccount,
  useProgressStore,
  type AccountNotice,
  type ProgressMode,
  type VerificationNotice,
} from "../state/use-progress-store";

/** Pages of the sign-in and sign-out flow, which never show progress. */
const AUTH_FLOW = /^\/(?:sign-in|sign-up|auth)(?:\/|$)/;

/**
 * Loads progress for every page: the signed-in learner's account progress, or anonymous progress
 * saved in this browser. Reports when progress cannot be saved.
 */
export function ProgressProvider({ catalog }: { catalog: ProgressCatalog }) {
  const pathname = usePathname();
  const signingInOrOut = AUTH_FLOW.test(pathname);
  useEffect(() => {
    // Sign-in completes with client-side navigations from these pages, so whose progress to show
    // is only decided once the learner reaches a page that shows it.
    if (signingInOrOut) return;
    void initProgress(catalog, createBrowserProgressRepository, {
      resolveAccount: () => resolveBrowserAccount(),
    });
  }, [catalog, signingInOrOut]);
  useEffect(() => {
    // `data-progress` on <html>: "loading", "saving" or "saved", and `data-progress-mode`. Lets
    // end-to-end tests wait for writes (local and to the account) to land instead of sleeping.
    const root = document.documentElement;
    const reflect = ({
      status,
      saving,
      mode,
    }: {
      status: string;
      saving: boolean;
      mode: ProgressMode;
    }) => {
      root.dataset.progress = status === "ready" ? (saving ? "saving" : "saved") : "loading";
      if (status === "ready") root.dataset.progressMode = mode;
    };
    reflect(useProgressStore.getState());
    return useProgressStore.subscribe(reflect);
  }, []);
  return <ProgressStatusNotice />;
}

const ACCOUNT_NOTICES: Record<
  | AccountNotice
  | "attempt-unavailable"
  | "verification-unavailable"
  | "verification-rejected"
  | "verification-not-persisted",
  { title: string; message: string; signIn: boolean }
> = {
  "session-ended": {
    title: "Your session has ended.",
    message:
      "Lessons you finish are kept in this browser and saved to your account when you sign in again.",
    signIn: true,
  },
  unavailable: {
    title: "Account sync paused.",
    message:
      "We couldn't reach your account. Your progress is kept in this browser and saved to your account later.",
    signIn: false,
  },
  "attempt-unavailable": {
    title: "Certificate verification did not start.",
    message:
      "Your lesson progress is saved, but it may not count toward a certificate yet. Reopen the exercise while online to retry verification.",
    signIn: false,
  },
  "verification-unavailable": {
    title: "Certificate verification is waiting to sync.",
    message:
      "Your evidence is saved in this browser. Retry now or stay online and it will retry automatically.",
    signIn: false,
  },
  "verification-rejected": {
    title: "GitDojo could not verify this exercise.",
    message:
      "Your completion is saved. Reopen the exercise and complete its objectives again to create fresh verification evidence.",
    signIn: false,
  },
  "verification-not-persisted": {
    title: "Verification evidence could not be saved for retry.",
    message:
      "Your lesson progress is saved. Keep this tab open, check your connection, then reopen the exercise to recreate its evidence.",
    signIn: false,
  },
  "load-failed": {
    title: "Account progress unavailable.",
    message:
      "We couldn't load your account progress. Progress from this visit may not be saved; try again later.",
    signIn: false,
  },
};

/**
 * A non-blocking notice when progress is not being saved, locally or to the account: learning
 * always carries on, but the learner should know what will and won't be kept.
 */
export function ProgressStatusNotice() {
  const persistence = useProgressStore((state) => state.persistence);
  const saveError = useProgressStore((state) => state.saveError);
  const accountNotice = useProgressStore((state) => state.accountNotice);
  const verificationNotice = useProgressStore((state) => state.verificationNotice);
  const [retrying, setRetrying] = useState(false);
  const local = saveError ?? (persistence?.mode === "memory" ? persistence.reason : null);
  const notice = local
    ? { title: "Progress not saved.", message: local, signIn: false }
    : verificationNotice
      ? ACCOUNT_NOTICES[verificationNoticeCopy(verificationNotice)]
      : accountNotice
        ? ACCOUNT_NOTICES[accountNotice]
        : null;
  const message = notice?.message ?? null;
  const [dismissed, setDismissed] = useState<string | null>(null);

  return (
    <div role="status" aria-live="polite" className="contents">
      {message && dismissed !== message ? (
        <div
          data-testid="progress-status"
          className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-warning/40 bg-elevated p-3 shadow-xl shadow-shade/40 max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-md:left-4"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-small text-fg-secondary">
            <p>
              <span className="font-medium text-fg">{notice?.title} </span>
              {message}
              {notice?.signIn ? (
                <>
                  {" "}
                  <Link
                    href="/sign-in"
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Sign in
                  </Link>
                </>
              ) : null}
            </p>
            {verificationNotice ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                disabled={retrying}
                onClick={() => {
                  setRetrying(true);
                  if (verificationNotice === "unavailable") {
                    void retryPendingVerification().finally(() => {
                      setRetrying(false);
                    });
                  } else if (typeof window !== "undefined") {
                    window.location.reload();
                  }
                }}
              >
                {retrying ? "Retrying…" : "Retry verification"}
              </Button>
            ) : null}
          </div>
          <IconButton
            aria-label="Dismiss"
            className="-mt-1 -mr-1 shrink-0"
            onClick={() => {
              setDismissed(message);
            }}
          >
            <X />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}

function verificationNoticeCopy(
  notice: Exclude<VerificationNotice, null>,
):
  | "attempt-unavailable"
  | "verification-unavailable"
  | "verification-rejected"
  | "verification-not-persisted" {
  if (notice === "attempt-unavailable") return "attempt-unavailable";
  if (notice === "not-persisted") return "verification-not-persisted";
  if (notice === "rejected") return "verification-rejected";
  return "verification-unavailable";
}
