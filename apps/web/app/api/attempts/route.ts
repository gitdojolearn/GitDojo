import { connection } from "next/server";
import { type CompletionKind } from "@gitdojo/shared-types";
import { getVerifiedIdentity } from "@/lib/auth/identity";
import { loadCompletionContent } from "@/lib/completion-verification/content";
import { createCompletionAttempt } from "@/lib/completion-verification/store";
import { limitedJson } from "@/lib/http/limited-json";
import { isSameOriginRequest } from "@/lib/http/same-origin";

export const runtime = "nodejs";
const PRIVATE = { "Cache-Control": "private, no-store" };
const KINDS: readonly CompletionKind[] = ["lesson", "challenge", "practice"];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function POST(request: Request) {
  await connection();
  if (!isSameOriginRequest(request.headers))
    return Response.json({ error: "cross_origin" }, { status: 403, headers: PRIVATE });
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified")
    return Response.json({ error: auth.status }, { status: 401, headers: PRIVATE });
  let body: unknown;
  try {
    body = await limitedJson(request, 1024);
  } catch {
    return Response.json({ error: "invalid_json_or_size" }, { status: 400, headers: PRIVATE });
  }
  const candidate = body as { kind?: unknown; contentId?: unknown } | null;
  if (
    !candidate ||
    typeof candidate.kind !== "string" ||
    !KINDS.includes(candidate.kind as CompletionKind) ||
    typeof candidate.contentId !== "string" ||
    candidate.contentId.length > 100 ||
    !ID.test(candidate.contentId)
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400, headers: PRIVATE });
  }
  const kind = candidate.kind as CompletionKind;
  const content = await loadCompletionContent(kind, candidate.contentId);
  if (!content || content.lesson.objectives.length === 0)
    return Response.json({ error: "not_verifiable" }, { status: 422, headers: PRIVATE });
  try {
    const binding = await createCompletionAttempt(
      auth.identity,
      kind,
      candidate.contentId,
      content.version,
    );
    return Response.json(binding, { status: 201, headers: PRIVATE });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}
