import { type AwardKey } from "@/lib/certificates/awards";
import { syncCompletionsNow, syncNow } from "@/features/progress";

export type IssueResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Asks the server to issue a certificate. Pending completions are uploaded first so the server
 * sees everything done in this browser; the server alone decides eligibility, and repeating the
 * request returns the same certificate.
 */
export async function requestCertificate(
  awardKey: AwardKey,
  publicNameConsent: boolean,
): Promise<IssueResult> {
  try {
    await syncCompletionsNow();
    await syncNow();
    const response = await fetch("/api/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ awardKey, publicNameConsent }),
    });
    const result = (await response.json()) as { id?: string; error?: string; message?: string };
    if (response.ok && result.id) return { ok: true, id: result.id };
    return {
      ok: false,
      message:
        result.error === "not_eligible"
          ? "Some completions have not reached your account yet. Sync your progress and try again."
          : (result.message ?? "Could not issue this certificate right now."),
    };
  } catch {
    return { ok: false, message: "Could not issue this certificate right now." };
  }
}
