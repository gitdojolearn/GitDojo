import "server-only";

import { upsertUser } from "@/lib/account-progress/postgres-store";
import { type VerifiedIdentity } from "@/lib/auth/identity";
import { getDatabase } from "@/lib/db/client";

export type AssessmentQuota = "create" | "submit";

const MAXIMUMS: Record<AssessmentQuota, number> = { create: 5, submit: 48 };
const MAX_WINDOW_SECONDS = 3_600;
const MAX_SUBMISSION_COST = 3 * 1024 * 1024;
const SUBMISSION_COST_UNIT_BYTES = 64 * 1024;

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

export function assessmentSubmissionCost(sizeBytes: number): number {
  const boundedSize = Math.min(Math.max(0, sizeBytes), MAX_SUBMISSION_COST);
  return Math.max(1, Math.ceil(boundedSize / SUBMISSION_COST_UNIT_BYTES));
}

/**
 * Atomically consumes an account quota in PostgreSQL. The row is shared by every application
 * instance, and the conditional upsert serializes concurrent requests for the same account.
 */
export async function consumeAssessmentQuota(
  identity: VerifiedIdentity,
  quota: AssessmentQuota,
  cost = 1,
  env: Record<string, string | undefined> = process.env,
): Promise<number | null> {
  const maximum = positiveInteger(
    env[`GITDOJO_ASSESSMENT_${quota.toUpperCase()}_MAX`],
    MAXIMUMS[quota],
    100_000,
  );
  const windowSeconds = positiveInteger(
    env.GITDOJO_ASSESSMENT_RATE_LIMIT_WINDOW_SECONDS,
    60,
    MAX_WINDOW_SECONDS,
  );
  const safeCost = Math.max(1, Math.ceil(cost));
  if (safeCost > maximum) return windowSeconds;

  return getDatabase().begin(async (tx) => {
    const userId = await upsertUser(tx, identity);
    const [accepted] = await tx<{ reset_at: Date }[]>`
      INSERT INTO assessment_rate_limits (user_id, quota, used, reset_at)
      VALUES (
        ${userId}, ${quota}, ${safeCost}, clock_timestamp() + (${windowSeconds} * interval '1 second')
      )
      ON CONFLICT (user_id, quota) DO UPDATE SET
        used = CASE WHEN assessment_rate_limits.reset_at <= clock_timestamp()
          THEN EXCLUDED.used ELSE assessment_rate_limits.used + EXCLUDED.used END,
        reset_at = CASE WHEN assessment_rate_limits.reset_at <= clock_timestamp()
          THEN clock_timestamp() + (${windowSeconds} * interval '1 second')
          ELSE assessment_rate_limits.reset_at END
      WHERE CASE WHEN assessment_rate_limits.reset_at <= clock_timestamp()
        THEN EXCLUDED.used <= ${maximum}
        ELSE assessment_rate_limits.used + EXCLUDED.used <= ${maximum}
      END
      RETURNING reset_at
    `;
    if (accepted) return null;

    const [current] = await tx<{ retry_after: number }[]>`
      SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - clock_timestamp())))::int) AS retry_after
      FROM assessment_rate_limits WHERE user_id = ${userId} AND quota = ${quota}
    `;
    return current?.retry_after ?? windowSeconds;
  });
}
