import "server-only";

import type { AssessmentGrade, CAPSTONE_KEY } from "@gitdojo/shared-types";
import { getDatabase } from "@/lib/db/client";
import type { VerifiedIdentity } from "@/lib/auth/identity";
import { upsertUser } from "@/lib/account-progress/postgres-store";
import { issuableName } from "./certificate-name";
import { certificateNameFor } from "./name-store";
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
  /** Null for an anonymized revoked credential retained after account deletion. */
  userId: string | null;
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
  user_id: string | null;
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
  const lessons = await sql<{ lesson_id: string; verification: "reported" | "verified" }[]>`
    SELECT c.lesson_id, c.verification FROM lesson_completions c JOIN users u ON u.id = c.user_id
    WHERE u.issuer = ${identity.issuer} AND u.subject = ${identity.subject}
  `;
  const practice = await sql<{ task_id: string; verification: "reported" | "verified" }[]>`
    SELECT c.task_id, c.verification FROM practice_completions c JOIN users u ON u.id = c.user_id
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
      verifiedLessons: new Set(
        lessons.filter((row) => row.verification === "verified").map((row) => row.lesson_id),
      ),
      verifiedPractice: new Set(
        practice.filter((row) => row.verification === "verified").map((row) => row.task_id),
      ),
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

/** What issuing a certificate came to. */
export type IssueOutcome =
  | { status: "issued"; certificate: Certificate }
  | { status: "not_eligible"; missing: string[] }
  /** No GitDojo certificate name, or one the certificate can't print yet. */
  | { status: "name_required"; reason: "missing" | "unprintable"; characters: string[] };

/**
 * Issues a completion certificate once per learner, award and criteria version. The recipient
 * name is read from the learner's GitDojo certificate name inside the same transaction and saved
 * on the certificate, so later changes to that name never rewrite it. A repeat request returns
 * the certificate already issued, whatever the name is now.
 */
export async function issueCertificate(
  identity: VerifiedIdentity,
  key: AwardKey,
  publicNameConsent: boolean,
): Promise<IssueOutcome> {
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
    if (prior) return { status: "issued", certificate: certificate(prior) };

    const lessons = await tx<{ lesson_id: string; verification: "reported" | "verified" }[]>`
      SELECT lesson_id, verification FROM lesson_completions WHERE user_id = ${userId}
    `;
    const practice = await tx<{ task_id: string; verification: "reported" | "verified" }[]>`
      SELECT task_id, verification FROM practice_completions WHERE user_id = ${userId}
    `;
    const missing = missingRequirements(key, {
      lessons: new Set(lessons.map((item) => item.lesson_id)),
      practice: new Set(practice.map((item) => item.task_id)),
      verifiedLessons: new Set(
        lessons.filter((item) => item.verification === "verified").map((item) => item.lesson_id),
      ),
      verifiedPractice: new Set(
        practice.filter((item) => item.verification === "verified").map((item) => item.task_id),
      ),
    });
    if (missing.length > 0) return { status: "not_eligible", missing };

    const name = issuableName(await certificateNameFor(tx, userId));
    if (!name.ok) {
      return { status: "name_required", reason: name.reason, characters: name.characters ?? [] };
    }
    const recipientName = name.recipientName;

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
    return { status: "issued", certificate: certificate(row) };
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
