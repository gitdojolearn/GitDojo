-- Keep issued credential status indexes verifiable after a learner deletes their account.
-- The API anonymizes and revokes each credential, then deletes the owning user row.
ALTER TABLE certificates
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE certificates
  DROP CONSTRAINT certificates_user_id_fkey,
  ADD CONSTRAINT certificates_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
