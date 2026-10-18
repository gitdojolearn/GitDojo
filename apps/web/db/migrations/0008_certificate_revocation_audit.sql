-- Why, and by which operator, a certificate was revoked: GitDojo's own audit record. Never shown
-- publicly: the verification page and the signed status list only say that it was revoked, and
-- when. Both are null for certificates that are still valid, and for ones revoked before this.
ALTER TABLE certificates
  ADD COLUMN revocation_reason text
    CHECK (revocation_reason IS NULL OR length(revocation_reason) BETWEEN 1 AND 500),
  ADD COLUMN revoked_by text
    CHECK (revoked_by IS NULL OR length(revoked_by) BETWEEN 1 AND 100);
