-- Lets an operator replace a certificate issued with a mistake (a misspelt name, say). Revoking
-- with --allow-reissue marks the old certificate reissue_allowed: it stays revoked, and its
-- verification page and status list still say so, but it no longer counts towards "one
-- certificate per learner, award and criteria version", so the learner can issue a new one.
-- A plain revocation leaves reissue_allowed false and keeps blocking a new certificate.
ALTER TABLE certificates
  ADD COLUMN reissue_allowed boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT certificates_reissue_only_when_revoked
    CHECK (NOT reissue_allowed OR revoked_at IS NOT NULL);

ALTER TABLE certificates DROP CONSTRAINT certificates_one_award;

CREATE UNIQUE INDEX certificates_one_award
  ON certificates (user_id, award_key, criteria_version)
  WHERE NOT reissue_allowed;
