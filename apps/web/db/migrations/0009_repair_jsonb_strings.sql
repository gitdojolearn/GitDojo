-- Repairs jsonb values that were stored as JSON strings. The app passed JSON.stringify(value) to a
-- jsonb parameter, and the driver encodes jsonb parameters itself, so the value was encoded twice:
-- a signing key was stored as "{\"kty\":...}" instead of {"kty":...}, and then never matched the
-- key it was made from. Each string is decoded back into the object it holds; values that are
-- already objects are left alone, so this is safe to run on any database.
UPDATE certificate_signing_keys
  SET public_jwk = (public_jwk #>> '{}')::jsonb
  WHERE jsonb_typeof(public_jwk) = 'string';

UPDATE certificates
  SET evidence = (evidence #>> '{}')::jsonb
  WHERE jsonb_typeof(evidence) = 'string';

UPDATE assessment_attempts
  SET result = (result #>> '{}')::jsonb
  WHERE jsonb_typeof(result) = 'string';

UPDATE assessment_attempts
  SET evidence = (evidence #>> '{}')::jsonb
  WHERE jsonb_typeof(evidence) = 'string';
