import { useEffect } from "react";
import { create } from "zustand";
import { type AwardKey } from "@/lib/certificates/awards";
import { syncCompletionsNow } from "@/features/progress";

export interface IssuedCertificate {
  id: string;
  awardKey: AwardKey;
  criteriaVersion: number;
  recipientName: string;
  issuedAt: string;
  revoked: boolean;
  /** Revoked so that a replacement can be issued: it no longer counts as the learner's award. */
  reissueAllowed?: boolean;
  publicNameConsent: boolean;
  /** The exact public verification URL; `null` when the server has no site origin configured. */
  verificationUrl?: string | null;
}

/** What `GET /api/certificates` reports for the signed-in account, from the server's records. */
export interface CertificationStatus {
  certificates: IssuedCertificate[];
  /** Per award: requirement IDs complete and missing, by the rule issuance applies. */
  progress: Partial<Record<AwardKey, { completed: string[]; missing: string[] }>>;
  lastLessonId: string | null;
  checkedAt: string | null;
}

interface CertificationState {
  /** Whose status this is; a different account starts again. */
  accountId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  data: CertificationStatus | null;
}

const INITIAL: CertificationState = { accountId: null, status: "idle", data: null };

/**
 * The signed-in account's certificates and award progress, loaded once and shared by the dashboard
 * and the certification track, so both always show the same thing.
 */
export const useCertificationStatus = create<CertificationState>()(() => INITIAL);

let inflight: { accountId: string; promise: Promise<void> } | null = null;

function parse(value: unknown): CertificationStatus {
  const body = (value ?? {}) as Partial<Record<keyof CertificationStatus, unknown>>;
  return {
    certificates: Array.isArray(body.certificates)
      ? (body.certificates as IssuedCertificate[])
      : [],
    progress: typeof body.progress === "object" && body.progress !== null ? body.progress : {},
    lastLessonId: typeof body.lastLessonId === "string" ? body.lastLessonId : null,
    checkedAt: typeof body.checkedAt === "string" ? body.checkedAt : null,
  };
}

/**
 * Loads (or reloads) the status. Pending completions are uploaded first, so work just finished in
 * this browser is counted; if that fails, the server's records are still shown as they are.
 */
export function loadCertificationStatus(accountId: string): Promise<void> {
  if (inflight?.accountId === accountId) return inflight.promise;
  const previous = useCertificationStatus.getState();
  const keep = previous.accountId === accountId ? previous.data : null;
  useCertificationStatus.setState({ accountId, status: "loading", data: keep });
  const promise = (async () => {
    try {
      await syncCompletionsNow().catch(() => undefined);
      const response = await fetch("/api/certificates", { cache: "no-store" });
      if (!response.ok) throw new Error(`certificates: ${String(response.status)}`);
      const data = parse(await response.json());
      if (useCertificationStatus.getState().accountId === accountId) {
        useCertificationStatus.setState({ status: "ready", data });
      }
    } catch {
      if (useCertificationStatus.getState().accountId === accountId) {
        useCertificationStatus.setState({ status: "error" });
      }
    } finally {
      if (inflight?.accountId === accountId) inflight = null;
    }
  })();
  inflight = { accountId, promise };
  return promise;
}

/**
 * The status for `accountId` (`null` when not signed in). It is re-read from the server whenever
 * a page using it opens and whenever the learner comes back to the tab, because completions made
 * in a lesson since the last read would otherwise be missing. The last result stays on screen
 * while it refreshes; requests already in flight are shared.
 */
export function useAccountCertification(accountId: string | null): CertificationState {
  const state = useCertificationStatus();
  useEffect(() => {
    if (!accountId) return;
    void loadCertificationStatus(accountId);
    const refresh = () => {
      if (document.visibilityState === "visible") void loadCertificationStatus(accountId);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [accountId]);
  if (!accountId || state.accountId !== accountId) return { ...INITIAL, accountId };
  return state;
}

export function resetCertificationStatusForTests(): void {
  inflight = null;
  useCertificationStatus.setState(INITIAL);
}

/** The certificate that counts for an award: newest first, skipping ones revoked for reissue. */
export function currentCertificate(
  certificates: readonly IssuedCertificate[],
  awardKey: AwardKey,
  criteriaVersion: number,
): IssuedCertificate | null {
  return (
    certificates.find(
      (item) =>
        item.awardKey === awardKey &&
        item.criteriaVersion === criteriaVersion &&
        !(item.revoked && item.reissueAllowed),
    ) ?? null
  );
}
