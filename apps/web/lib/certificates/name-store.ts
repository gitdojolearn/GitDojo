import "server-only";

import type { VerifiedIdentity } from "@/lib/auth/identity";
import { upsertUser } from "@/lib/account-progress/postgres-store";
import { getDatabase, type QueryableDatabase } from "@/lib/db/client";
import type { CertificateNameInput } from "./certificate-name";

export interface StoredCertificateName extends CertificateNameInput {
  updatedAt: Date;
}

interface Row {
  given_name: string;
  family_name: string;
  updated_at: Date;
}

const toName = (row: Row): StoredCertificateName => ({
  givenName: row.given_name,
  familyName: row.family_name,
  updatedAt: row.updated_at,
});

/** The signed-in learner's own certificate name, or null if they haven't entered one. */
export async function readCertificateName(
  identity: VerifiedIdentity,
): Promise<StoredCertificateName | null> {
  const [row] = await getDatabase()<Row[]>`
    SELECT n.given_name, n.family_name, n.updated_at
    FROM certificate_names n JOIN users u ON u.id = n.user_id
    WHERE u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
  `;
  return row ? toName(row) : null;
}

/** Inside issuance's transaction: the name as it is at the moment the certificate is made. */
export async function certificateNameFor(
  sql: QueryableDatabase,
  userId: string,
): Promise<StoredCertificateName | null> {
  const [row] = await sql<Row[]>`
    SELECT given_name, family_name, updated_at FROM certificate_names WHERE user_id = ${userId}
  `;
  return row ? toName(row) : null;
}

/**
 * Saves the signed-in learner's certificate name, already validated. The account comes from the
 * verified identity only, so no request can choose whose name it changes.
 */
export async function saveCertificateName(
  identity: VerifiedIdentity,
  name: CertificateNameInput,
): Promise<StoredCertificateName> {
  return getDatabase().begin(async (tx) => {
    const userId = await upsertUser(tx, identity);
    const [row] = await tx<Row[]>`
      INSERT INTO certificate_names (user_id, given_name, family_name)
      VALUES (${userId}, ${name.givenName}, ${name.familyName})
      ON CONFLICT (user_id) DO UPDATE
        SET given_name = EXCLUDED.given_name, family_name = EXCLUDED.family_name,
            updated_at = now()
      RETURNING given_name, family_name, updated_at
    `;
    if (!row) throw new Error("certificate name upsert returned no row");
    return toName(row);
  });
}
