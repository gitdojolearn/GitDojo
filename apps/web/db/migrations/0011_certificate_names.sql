-- The name a learner enters in GitDojo to be printed on their certificates. GitDojo owns it: it is
-- never filled from, or overwritten by, the identity provider's profile, and nothing is copied
-- in here. Learners who had none enter it on their account page before their next certificate.
-- Issued certificates keep their own snapshot (certificates.recipient_name), so changing this
-- never rewrites a certificate.
CREATE TABLE certificate_names (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  given_name text NOT NULL CHECK (length(given_name) BETWEEN 1 AND 60),
  family_name text NOT NULL DEFAULT '' CHECK (length(family_name) <= 60),
  updated_at timestamptz NOT NULL DEFAULT now()
);
