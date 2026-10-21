import { connection } from "next/server";
import { getVerifiedIdentity } from "@/lib/auth/identity";
import { deleteAccountData } from "@/lib/account-deletion/store";
import { isSameOriginRequest } from "@/lib/http/same-origin";

export const runtime = "nodejs";
const PRIVATE = { "Cache-Control": "private, no-store" };

/** Deletes the authenticated learner's GitDojo data. The WSO2 identity itself is not deleted. */
export async function DELETE(request: Request) {
  await connection();
  if (!isSameOriginRequest(request.headers)) {
    return Response.json({ error: "cross_origin" }, { status: 403, headers: PRIVATE });
  }
  const auth = await getVerifiedIdentity();
  if (auth.status === "unauthenticated") {
    return Response.json({ error: "unauthenticated" }, { status: 401, headers: PRIVATE });
  }
  if (auth.status !== "verified") {
    return Response.json({ error: "identity_unavailable" }, { status: 503, headers: PRIVATE });
  }
  try {
    await deleteAccountData(auth.identity);
    return new Response(null, { status: 204, headers: PRIVATE });
  } catch {
    return Response.json({ error: "deletion_unavailable" }, { status: 503, headers: PRIVATE });
  }
}
