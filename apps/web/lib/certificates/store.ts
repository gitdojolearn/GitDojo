import "server-only";

import type { AssessmentGrade, CAPSTONE_KEY } from "@gitdojo/shared-types";
import { getDatabase } from "@/lib/db/client";
import type { VerifiedIdentity } from "@/lib/auth/identity";
import { upsertUser } from "@/lib/account-progress/postgres-store";
import {
  AWARDS,
  criteriaNarrative,
  missingRequirements,
  type AwardKey,
  type CompletionSets,
} from "./awards";

export interface AssessedEvidence {
  kind: "assessed";
  title: string;
  description: string;
  criteria: string;
  attemptId: string;
  grade: AssessmentGrade;
}

export interface CompletionEvidence {
  kind: "completion";
  title: string;
  description: string;
  template: string;
  criteria: string;
  lessons: string[];
  practice: string[];
}

export interface Certificate {
  id: string;
  statusIndex: number;
  userId: string;
  awardKey: AwardKey | typeof CAPSTONE_KEY;
  credentialKind: "completion" | "assessed";
  criteriaVersion: number;
  recipientName: string;
  publicNameConsent: boolean;
  issuedAt: Date;
  revokedAt: Date | null;
  /** Revoked so that the learner can be issued a replacement. */
  reissueAllowed: boolean;
  evidence: CompletionEvidence | AssessedEvidence;
}

interface Row {
  id: string;
  status_index: string;
  user_id: string;
  award_key: AwardKey | typeof CAPSTONE_KEY;
  credential_kind: "completion" | "assessed";
  criteria_version: number;
  recipient_name: string;
  public_name_consent: boolean;
  issued_at: Date;
  revoked_at: Date | null;
  reissue_allowed: boolean;
  evidence: Certificate["evidence"];
}

function certificate(row: Row): Certificate {
  const evidence =
    row.credential_kind === "completion"
      ? ({ ...row.evidence, kind: "completion" } as CompletionEvidence)
      : row.evidence;
  return {
    id: row.id,
    statusIndex: Number(row.status_index),
    userId: row.user_id,
    awardKey: row.award_key,
    credentialKind: row.credential_kind,
    criteriaVersion: row.criteria_version,
    recipientName: row.recipient_name,
    publicNameConsent: row.public_name_consent,
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
    reissueAllowed: row.reissue_allowed,
    evidence,
  };
}

export async function findCertificate(id: string): Promise<Certificate | null> {
  const [row] = await getDatabase()<Row[]>`
    SELECT * FROM certificates WHERE id = ${id}
  `;
  return row ? certificate(row) : null;
}

export async function ownCertificates(identity: VerifiedIdentity): Promise<Certificate[]> {
  const rows = await getDatabase()<Row[]>`
    SELECT c.* FROM certificates c JOIN users u ON u.id = c.user_id
    WHERE u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
      AND c.credential_kind = 'completion'
    ORDER BY c.issued_at DESC
  `;
  return rows.map(certificate);
}

/**
 * The account's stored completions: the same rows issuance checks, so progress shown from them
 * always agrees with what issuing would decide. Read-only; an account with no rows has none.
 */
export async function ownCompletions(
  identity: VerifiedIdentity,
): Promise<{ done: CompletionSets; lastLessonId: string | null }> {
  // Sequential on purpose: one connection, and each query is small.
  const sql = getDatabase();
  const lessons = await sql<{ lesson_id: string }[]>`
    SELECT c.lesson_id FROM lesson_completions c JOIN users u ON u.id = c.user_id
    WHERE u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
  `;
  const practice = await sql<{ task_id: string }[]>`
    SELECT c.task_id FROM practice_completions c JOIN users u ON u.id = c.user_id
    WHERE u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
  `;
  const [last] = await sql<{ lesson_id: string }[]>`
    SELECT l.lesson_id FROM last_lessons l JOIN users u ON u.id = l.user_id
    WHERE u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
  `;
  return {
    done: {
      lessons: new Set(lessons.map((row) => row.lesson_id)),
      practice: new Set(practice.map((row) => row.task_id)),
    },
    lastLessonId: last?.lesson_id ?? null,
  };
}

export async function ownCertificate(
  identity: VerifiedIdentity,
  id: string,
): Promise<Certificate | null> {
  const [row] = await getDatabase()<Row[]>`
    SELECT c.* FROM certificates c JOIN users u ON u.id = c.user_id
    WHERE c.id = ${id} AND u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
  `;
  return row ? certificate(row) : null;
}

export async function issueCertificate(
  identity: VerifiedIdentity,
  key: AwardKey,
  recipientName: string,
  publicNameConsent: boolean,
): Promise<
  | { certificate: Certificate; eligible: true; missing: string[] }
  | { certificate: null; eligible: false; missing: string[] }
> {
  const sql = getDatabase();
  const award = AWARDS[key];
  return sql.begin(async (tx) => {
    const userId = await upsertUser(tx, identity);
    // A certificate revoked so that it can be reissued no longer counts: the learner gets a new one.
    const [prior] = await tx<Row[]>`
      SELECT * FROM certificates
      WHERE user_id = ${userId} AND award_key = ${key}
        AND criteria_version = ${award.criteriaVersion} AND NOT reissue_allowed
    `;
    if (prior) return { certificate: certificate(prior), eligible: true, missing: [] };

    const lessons = await tx<{ lesson_id: string }[]>`
      SELECT lesson_id FROM lesson_completions WHERE user_id = ${userId}
    `;
    const practice = await tx<{ task_id: string }[]>`
      SELECT task_id FROM practice_completions WHERE user_id = ${userId}
    `;
    const missing = missingRequirements(key, {
      lessons: new Set(lessons.map((item) => item.lesson_id)),
      practice: new Set(practice.map((item) => item.task_id)),
    });
    if (missing.length > 0) return { certificate: null, eligible: false, missing };

    const evidence = {
      kind: "completion" as const,
      title: award.title,
      description: award.description,
      template: award.template,
      criteria: criteriaNarrative(key),
      lessons: [...award.lessons],
      practice: [...award.practice],
    };
    const [inserted] = await tx<Row[]>`
      INSERT INTO certificates (
        user_id, award_key, criteria_version, recipient_name,
        public_name_consent, evidence
      ) VALUES (
        ${userId}, ${key}, ${award.criteriaVersion}, ${recipientName},
        ${publicNameConsent}, ${tx.json(evidence)}
      )
      ON CONFLICT (user_id, award_key, criteria_version) WHERE NOT reissue_allowed DO NOTHING
      RETURNING *
    `;
    const [row] = inserted
      ? [inserted]
      : await tx<Row[]>`
      SELECT * FROM certificates
      WHERE user_id = ${userId} AND award_key = ${key}
        AND criteria_version = ${award.criteriaVersion} AND NOT reissue_allowed
    `;
    return { certificate: certificate(row), eligible: true, missing: [] };
  });
}

export async function revokedIndexes(batch: number): Promise<number[]> {
  const start = batch * 131072 + 1;
  const end = start + 131072;
  const rows = await getDatabase()<{ status_index: string }[]>`
    SELECT status_index FROM certificates
    WHERE status_index >= ${start} AND status_index < ${end} AND revoked_at IS NOT NULL
  `;
  return rows.map((row) => (Number(row.status_index) - 1) % 131072);
}
