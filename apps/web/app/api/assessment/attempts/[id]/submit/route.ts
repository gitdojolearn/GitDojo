import { connection } from "next/server";
import { type AssessmentEvidence } from "@gitdojo/shared-types";
import { getVerifiedIdentity } from "@/lib/auth/identity";
import { limitedJsonWithSize } from "@/lib/http/limited-json";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { isUuid } from "@/lib/ids";
import { nameRequiredMessage } from "@/lib/certificates/certificate-name";
import { submitAttempt } from "@/lib/assessment/store";
import { assessmentSubmissionCost, consumeAssessmentQuota } from "@/lib/assessment/rate-limit";
import { rateLimitedResponse } from "@/lib/http/rate-limit";

export const runtime = "nodejs";
const PRIVATE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  if (!isSameOriginRequest(request.headers))
    return Response.json({ error: "cross_origin" }, { status: 403, headers: PRIVATE });
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified")
    return Response.json({ error: auth.status }, { status: 401, headers: PRIVATE });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE });
  let body: unknown;
  let sizeBytes = 0;
  try {
    const parsed = await limitedJsonWithSize(request, 3 * 1024 * 1024);
    body = parsed.value;
    sizeBytes = parsed.sizeBytes;
  } catch {
    return Response.json({ error: "invalid_json_or_size" }, { status: 400, headers: PRIVATE });
  }
  if (!body || typeof body !== "object")
    return Response.json({ error: "invalid_body" }, { status: 400, headers: PRIVATE });
  const { evidence, publicNameConsent } = body as Record<string, unknown>;
  if (!evidence || typeof evidence !== "object" || typeof publicNameConsent !== "boolean")
    return Response.json({ error: "invalid_body" }, { status: 400, headers: PRIVATE });
  try {
    const retryAfter = await consumeAssessmentQuota(
      auth.identity,
      "submit",
      assessmentSubmissionCost(sizeBytes),
    );
    if (retryAfter !== null) return rateLimitedResponse(retryAfter);
    const outcome = await submitAttempt(
      auth.identity,
      id,
      evidence as AssessmentEvidence,
      publicNameConsent,
    );
    if (!outcome) return Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE });
    if ("nameRequired" in outcome) {
      const { reason, characters } = outcome.nameRequired;
      return Response.json(
        { error: "name_required", reason, message: nameRequiredMessage(reason, characters) },
        { status: 422, headers: PRIVATE },
      );
    }
    return Response.json(outcome, { headers: PRIVATE });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}
