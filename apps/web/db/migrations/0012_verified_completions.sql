CREATE TABLE completion_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lesson', 'challenge', 'practice')),
  content_id text NOT NULL CHECK (
    content_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(content_id) <= 100
  ),
  content_version text NOT NULL CHECK (content_version ~ '^[0-9a-f]{64}$'),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 20 AND 200),
  started_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  evidence_hash text CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
  objective_results jsonb
);

CREATE INDEX completion_attempts_user_started
  ON completion_attempts (user_id, started_at DESC);

ALTER TABLE lesson_completions
  ADD COLUMN verification text NOT NULL DEFAULT 'reported'
    CHECK (verification IN ('reported', 'verified')),
  ADD COLUMN attempt_id uuid UNIQUE REFERENCES completion_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN verified_at timestamptz;

ALTER TABLE challenge_completions
  ADD COLUMN verification text NOT NULL DEFAULT 'reported'
    CHECK (verification IN ('reported', 'verified')),
  ADD COLUMN attempt_id uuid UNIQUE REFERENCES completion_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN verified_at timestamptz;

ALTER TABLE practice_completions
  ADD COLUMN verification text NOT NULL DEFAULT 'reported'
    CHECK (verification IN ('reported', 'verified')),
  ADD COLUMN attempt_id uuid UNIQUE REFERENCES completion_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN verified_at timestamptz;

ALTER TABLE lesson_completions
  ADD CONSTRAINT lesson_completion_verification_metadata CHECK (
    (verification = 'reported' AND attempt_id IS NULL AND verified_at IS NULL) OR
    (verification = 'verified' AND attempt_id IS NOT NULL AND verified_at IS NOT NULL)
  );

ALTER TABLE challenge_completions
  ADD CONSTRAINT challenge_completion_verification_metadata CHECK (
    (verification = 'reported' AND attempt_id IS NULL AND verified_at IS NULL) OR
    (verification = 'verified' AND attempt_id IS NOT NULL AND verified_at IS NOT NULL)
  );

ALTER TABLE practice_completions
  ADD CONSTRAINT practice_completion_verification_metadata CHECK (
    (verification = 'reported' AND attempt_id IS NULL AND verified_at IS NULL) OR
    (verification = 'verified' AND attempt_id IS NOT NULL AND verified_at IS NOT NULL)
  );
