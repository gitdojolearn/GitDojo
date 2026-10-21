import "server-only";

import type { VerifiedIdentity } from "@/lib/auth/identity";
import { getDatabase } from "@/lib/db/client";

/** Removes a learner's GitDojo account data in one transaction. */
export async function deleteAccountData(identity: VerifiedIdentity): Promise<void> {
  const sql = getDatabase();
  await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      SELECT id FROM users WHERE issuer = ${identity.issuer} AND subject = ${identity.subject}
      FOR UPDATE
    `;
    if (!user) return;

    // Credential status indexes are public and signed badges may already exist outside GitDojo.
    // Retain only a revoked, nameless credential record so old badges remain verifiably revoked.
    await tx`
      UPDATE certificates
      SET user_id = NULL,
          assessment_attempt_id = NULL,
          recipient_name = 'Deleted learner',
          public_name_consent = false,
          revoked_at = COALESCE(revoked_at, now()),
          revoked_by = COALESCE(revoked_by, 'learner account deletion'),
          revocation_reason = COALESCE(revocation_reason, 'Learner deleted their GitDojo account')
      WHERE user_id = ${user.id}
    `;

    // All other account rows cascade from users. Certificate tombstones above no longer refer to
    // assessment attempts, so the attempts and their submitted evidence can now be removed.
    await tx`DELETE FROM users WHERE id = ${user.id}`;
  });
}
