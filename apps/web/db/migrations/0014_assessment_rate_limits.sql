CREATE TABLE assessment_rate_limits (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quota text NOT NULL CHECK (quota IN ('create', 'submit')),
  used integer NOT NULL CHECK (used > 0),
  reset_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, quota)
);
