// Revocation for the operator CLI (scripts/revoke-certificate.mjs). Kept apart from the CLI so the
// argument rules and the database update can be tested.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const USAGE =
  'Usage: node scripts/revoke-certificate.mjs <credential-uuid> --by "<operator>" [--reason "<why>"]';

/**
 * `<id> --by <operator> [--reason <why>]`. The operator is required, so every revocation says
 * who made it; the reason is optional. Returns the problem as `error` rather than throwing.
 */
export function parseRevokeArgs(argv) {
  const [id, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if ((flag !== "--by" && flag !== "--reason") || value === undefined) {
      return { error: `Unexpected argument: ${flag ?? ""}` };
    }
    options[flag.slice(2)] = value.trim();
  }
  if (!id || !UUID.test(id)) return { error: "The first argument must be a credential UUID." };
  if (!options.by || options.by.length > 100) {
    return { error: "--by is required: who is revoking (up to 100 characters)." };
  }
  if (options.reason !== undefined && (options.reason === "" || options.reason.length > 500)) {
    return { error: "--reason must be 1-500 characters." };
  }
  return { id: id.toLowerCase(), by: options.by, reason: options.reason ?? null };
}

/**
 * Revokes a certificate once. Revocation is permanent: a second run changes nothing, so the
 * original time, operator and reason are kept.
 */
export async function revokeCertificate(sql, { id, by, reason }) {
  const [revoked] = await sql`
    UPDATE certificates
    SET revoked_at = now(), revoked_by = ${by}, revocation_reason = ${reason}
    WHERE id = ${id} AND revoked_at IS NULL
    RETURNING revoked_at
  `;
  if (revoked) return { status: "revoked", revokedAt: revoked.revoked_at };
  const [existing] = await sql`SELECT revoked_at FROM certificates WHERE id = ${id}`;
  if (!existing) return { status: "not-found" };
  return { status: "already-revoked", revokedAt: existing.revoked_at };
}
