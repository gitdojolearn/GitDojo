import { connection } from "next/server";
import { getVerifiedIdentity } from "@/lib/auth/identity";
import {
  issuableName,
  NAME_ERROR_MESSAGES,
  validateCertificateName,
  type CertificateNameInput,
} from "@/lib/certificates/certificate-name";
import { readCertificateName, saveCertificateName } from "@/lib/certificates/name-store";
import { limitedJson } from "@/lib/http/limited-json";
import { isSameOriginRequest } from "@/lib/http/same-origin";

export const runtime = "nodejs";
const PRIVATE = { "Cache-Control": "private, no-store" };
const FIELDS = new Set(["givenName", "familyName"]);

function present(name: (CertificateNameInput & { updatedAt: Date }) | null) {
  const issuable = issuableName(name);
  return {
    name: name
      ? { givenName: name.givenName, familyName: name.familyName, updatedAt: name.updatedAt }
      : null,
    // Whether a certificate could be issued with this name right now, and why not.
    certificate: issuable.ok
      ? { ok: true, recipientName: issuable.recipientName }
      : { ok: false, reason: issuable.reason, characters: issuable.characters ?? [] },
  };
}

/** The signed-in learner's own certificate name. There is no way to ask for anyone else's. */
export async function GET() {
  await connection();
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified") {
    return Response.json({ error: auth.status }, { status: 401, headers: PRIVATE });
  }
  try {
    return Response.json(present(await readCertificateName(auth.identity)), { headers: PRIVATE });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}

/** Saves the signed-in learner's certificate name: `{ givenName, familyName }`, nothing else. */
export async function PUT(request: Request) {
  await connection();
  if (!isSameOriginRequest(request.headers)) {
    return Response.json({ error: "cross_origin" }, { status: 403, headers: PRIVATE });
  }
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified") {
    return Response.json({ error: auth.status }, { status: 401, headers: PRIVATE });
  }
  let body: unknown;
  try {
    body = await limitedJson(request, 2048);
  } catch {
    return Response.json({ error: "invalid_json_or_size" }, { status: 400, headers: PRIVATE });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid_body" }, { status: 400, headers: PRIVATE });
  }
  const unexpected = Object.keys(body).filter((key) => !FIELDS.has(key));
  if (unexpected.length > 0) {
    return Response.json(
      { error: "unexpected_fields", fields: unexpected },
      { status: 400, headers: PRIVATE },
    );
  }
  const result = validateCertificateName(body);
  if (!result.ok) {
    const errors = Object.fromEntries(
      Object.entries(result.errors).map(([field, code]) => [
        field,
        { code, message: NAME_ERROR_MESSAGES[code] },
      ]),
    );
    return Response.json({ error: "invalid_name", errors }, { status: 422, headers: PRIVATE });
  }
  try {
    return Response.json(present(await saveCertificateName(auth.identity, result.name)), {
      headers: PRIVATE,
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}
