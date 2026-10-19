import "server-only";

import { randomBytes } from "node:crypto";
import {
  type CompletionAttemptBinding,
  type CompletionEvidence,
  type CompletionKind,
} from "@gitdojo/shared-types";
import { type VerifiedIdentity } from "@/lib/auth/identity";
import { upsertUser } from "@/lib/account-progress/postgres-store";
import { getDatabase, type QueryableDatabase } from "@/lib/db/client";
import { type CompletionAttemptRecord } from "./evidence";

export type CompletionAttemptRow = CompletionAttemptRecord;

export async function createCompletionAttempt(
  identity: VerifiedIdentity,
  kind: CompletionKind,
  contentId: string,
  contentVersion: string,
): Promise<CompletionAttemptBinding> {
  return getDatabase().begin(async (tx) => {
    const userId = await upsertUser(tx, identity);
    const nonce = randomBytes(24).toString("base64url");
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO completion_attempts (user_id, kind, content_id, content_version, nonce)
      VALUES (${userId}, ${kind}, ${contentId}, ${contentVersion}, ${nonce})
      RETURNING id
    `;
    if (!row) throw new Error("completion attempt insert returned no row");
    return { id: row.id, nonce, kind, contentId, contentVersion };
  });
}

export async function ownedCompletionAttempt(
  sql: QueryableDatabase,
  identity: VerifiedIdentity,
  evidence: CompletionEvidence,
): Promise<CompletionAttemptRow | null> {
  const [row] = await sql<
    {
      id: string;
      user_id: string;
      nonce: string;
      kind: CompletionKind;
      content_id: string;
      content_version: string;
      used_at: Date | null;
      evidence_hash: string | null;
    }[]
  >`
    SELECT a.id, a.user_id, a.nonce, a.kind, a.content_id, a.content_version, a.used_at,
           a.evidence_hash
    FROM completion_attempts a JOIN users u ON u.id = a.user_id
    WHERE a.id = ${evidence.attemptId}
      AND u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
  `;
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        nonce: row.nonce,
        kind: row.kind,
        contentId: row.content_id,
        contentVersion: row.content_version,
        usedAt: row.used_at,
        evidenceHash: row.evidence_hash,
      }
    : null;
}
