import { useAccountSession } from "@/features/auth";
import { useProgressStore } from "@/features/progress";
import {
  CERTIFICATION_TRACK,
  TRACK_AWARD,
  trackProgress,
  type TrackProgress,
} from "@/lib/certificates/track";
import {
  currentCertificate,
  loadCertificationStatus,
  useAccountCertification,
  type IssuedCertificate,
} from "../state/use-certification-status";

/** Where the learner is on the track, shared by the track page and the dashboard card. */
export type TrackState =
  | { kind: "loading" }
  /** Accounts are not set up on this site, so certificates can't be issued. */
  | { kind: "unconfigured" }
  | { kind: "signed-out" }
  /** The account or its records can't be read; never treated as eligible. */
  | { kind: "unavailable"; retry: () => void }
  | {
      kind: "ready";
      phase: "not-started" | "in-progress" | "eligible" | "completed" | "revoked";
      progress: TrackProgress;
      certificate: IssuedCertificate | null;
      /** An earlier certificate was revoked so that a replacement can be issued. */
      reissue: boolean;
      accountId: string;
      /** When the server's records were read. */
      checkedAt: string | null;
      /** A refresh failed: what is shown is from the last successful read. */
      stale: boolean;
    };

/**
 * Track progress always comes from the account's stored completions, as the server reports them:
 * the records issuance checks. Signed out, there is no progress to show, because work done without
 * an account never counts towards a certificate.
 */
export function useTrackState(): TrackState {
  const session = useAccountSession((state) => state.session);
  const mode = useProgressStore((state) => state.mode);
  const owner = useProgressStore((state) => state.progress?.owner ?? null);
  const accountId =
    session?.status === "signed-in" && mode === "account" && owner?.kind === "account"
      ? owner.accountId
      : null;
  const certification = useAccountCertification(accountId);

  if (session === null) return { kind: "loading" };
  if (session.status === "unconfigured") return { kind: "unconfigured" };
  if (session.status === "signed-out") return { kind: "signed-out" };
  if (mode === "account-unavailable") {
    return {
      kind: "unavailable",
      retry: () => {
        window.location.reload();
      },
    };
  }
  if (!accountId) return { kind: "loading" };
  const { data, status } = certification;
  if (!data) {
    return status === "error"
      ? { kind: "unavailable", retry: () => void loadCertificationStatus(accountId) }
      : { kind: "loading" };
  }

  const server = data.progress[CERTIFICATION_TRACK.awardKey];
  const progress = trackProgress(
    server?.completed ?? [],
    data.lastLessonId,
    CERTIFICATION_TRACK.awardKey,
    server?.reported ?? [],
  );
  const certificate = currentCertificate(
    data.certificates,
    CERTIFICATION_TRACK.awardKey,
    TRACK_AWARD.criteriaVersion,
  );
  const reissue =
    certificate === null &&
    data.certificates.some(
      (item) => item.awardKey === CERTIFICATION_TRACK.awardKey && item.reissueAllowed === true,
    );
  const phase = certificate
    ? certificate.revoked
      ? "revoked"
      : "completed"
    : progress.eligible
      ? "eligible"
      : progress.items.some((item) => item.status !== "not-started")
        ? "in-progress"
        : "not-started";
  return {
    kind: "ready",
    phase,
    progress,
    certificate,
    reissue,
    accountId,
    checkedAt: data.checkedAt,
    stale: status === "error",
  };
}
