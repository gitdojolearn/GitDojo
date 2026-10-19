# GitDojo completion certificates

GitDojo offers three versioned completion awards: Git Foundations, Branching and Collaboration,
and Git Recovery and History. Their fixed requirements live in
`apps/web/lib/certificates/awards.ts`. Change the criteria by adding a new version; preserve older
versions so previously issued credentials remain intelligible. The database also snapshots the
title, description, template, and full criteria at issuance, and verification displays this
snapshot even if current award definitions later change.

## Deploy

1. Set `NEXT_PUBLIC_SITE_URL` to the permanent HTTPS site origin of each environment (the
   production origin in production, the staging origin in staging). The verification links,
   issuer identity, signing-key URLs, and badge IDs are tied to it. Keep redirects serving old
   links if you later move domains.
2. Generate a 3072-bit RSA private key with `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out credential-key.pem`.
   Store the PEM in your deployment secrets as `GITDOJO_CREDENTIAL_PRIVATE_KEY`. Literal `\n`
   separators are accepted. Never commit the private key. Set a unique, stable
   `GITDOJO_CREDENTIAL_KEY_ID`, such as `rsa-2026-01`.
3. Apply every migration, through `0012_verified_completions`, with
   `pnpm --filter @gitdojo/web db:migrate` before deploying the new app. The release health check
   (`/api/health`) expects the latest one and reports a database that is behind.
4. Keep `DATABASE_URL` configured. Issuance is unavailable without the account database,
   identity provider, site origin, or signing key. When the site origin or signing key is missing
   or invalid, issuing returns `503 issuer_not_configured` with a plain message for the learner,
   and the server log names the setting (never its value), for example
   `GITDOJO_CREDENTIAL_PRIVATE_KEY is not a valid PEM private key`.

The dashboard shows each award's progress: requirements done and left, and the next lesson or
Practice task to finish, counted from the browser's progress as a guide. Before issuing, it asks
whether the learner's name may appear publicly (private by default): the PDF always shows the
name, and the public page and badge show it only with consent. A signed-in learner requests
issuance after finishing all named lessons and Practice tasks. The server reads account completion rows and inserts a
single certificate per learner, award, and criteria version. The recipient name comes from the
certificate-name fields the learner saves on `/account`; it is never copied from Asgardeo or
accepted from an issuance request. GitDojo does not verify legal identity. The name is snapshotted
on issue, so changing the account name does not alter an existing credential. The PDF is available
only to the owner. A given name is required and the surname is optional.
The learner decides at issuance whether that name appears on the public verification page and in
badges. This choice is fixed for the issued credential, because signed and downloaded badges
cannot be recalled or silently changed.

Learners set their certificate name on the signed-in account page. The name is stored separately
from identity-provider profile data. It may use any script, but current certificate PDFs and badge
images cannot print all scripts: issuance reports characters outside their supported Latin-1
range and asks the learner to save a printable version. This limitation does not change names on
already issued certificates. Public-name consent is asked separately for each certificate.

JSON columns (`public_jwk`, `evidence`, `result`) are written with `sql.json(value)`. The driver
encodes jsonb parameters itself, so passing `JSON.stringify(value)` would store a JSON string:
that is what made every signing key look like "another public key" before
`0009_repair_jsonb_strings`, which decodes any such rows back into objects.

## Sharing

An earned certificate (on `/certification` and, folded away, on the dashboard) has a **Share
certificate** section. Every option leads to the verification URL, the only place that says
whether the certificate is valid right now; a revoked certificate offers only that link.

- **Add to LinkedIn** opens LinkedIn in a new tab (`rel="noopener noreferrer"`). LinkedIn's Add
  to Profile [no longer pre-fills certificate details](https://www.linkedin.com/help/linkedin/answer/a528030),
  so next to the button GitDojo lists what its "Add license or certification" form asks for,
  each with a copy button: **Name** (`Git Foundations Completion Certificate`), **Issuing
  organization** (`GitDojo`), **Issue date** (month and year), **Credential ID** and
  **Credential URL** (the verification URL).
  - _Setup:_ LinkedIn gives each organization one static Add to Profile link when someone
    creates an Add to Profile button for the organization's LinkedIn Page (free, no approval,
    no Page admin needed). Put it in `NEXT_PUBLIC_LINKEDIN_ADD_TO_PROFILE_URL` (an `https` link
    on `linkedin.com` or `lnkd.in`; anything else is ignored) and redeploy. Until then the button
    opens LinkedIn's [instructions for adding a certification](https://www.linkedin.com/help/linkedin/answer/a567169).
    GitDojo never adds its own URL parameters. To have GitDojo's logo next to the certificate,
    learners pick GitDojo's Page in the "Issuing organization" field.
- **Copy verification link** copies the canonical URL, with the device's share sheet where the
  browser has one. If the clipboard is blocked, the link is shown to copy by hand.
- **Download badge image** gets a 1200 × 1200 PNG from `GET /api/certificates/<id>/badge`. The
  server draws it with `next/og` from the learner's own stored certificate (401 signed out, 404
  for anyone else's, 410 once revoked): the GitDojo logo, the award, "Completion certificate",
  the issue date, the verification URL and the holder's name only if they made it public. It is
  only a picture: nothing machine-readable is embedded (it is not a "baked" Open Badge), and it
  proves nothing on its own, which is why it shows the verification URL.
- **Download signed Open Badge** is the existing `GET /api/credentials/<id>`: the same
  RS256-signed OpenBadgeCredential JWT, with the revocation status list entry. It includes the
  holder's name only with their consent. It has not been tested with specific wallets, and
  GitDojo is not 1EdTech-certified, so compatibility depends on the wallet accepting Open Badges
  3.0 credentials as a JWT.

## Certification track

`/certification` is the learner's guided path to the **Git Foundations completion certificate**
(criteria version 2), linked from the main navigation and from a card on the dashboard. It lists
every requirement in order before the learner starts: the ten Git Basics lessons, then the
`commit-one-change` Practice task. Each one has its stable requirement ID (`lesson:<id>` or
`practice:<id>`), title, the lesson's goal or the task's mission, and a link to the content.

- **One source of truth.** The track is the `git-foundations` award in `lib/certificates/awards.ts`
  (`lib/certificates/track.ts` adds the learner-facing description), so the page can never ask for
  something issuance doesn't. `awardRequirements` gives the order; `missingRequirements` is the
  single eligibility rule, used by issuance and reported by `GET /api/certificates` for each award
  (`completed` and `missing`, from the account's stored completion rows).
- **Progress.** Signed in, the page and the dashboard card read that report (after uploading any
  pending completions), so they always match what issuing would decide. A requirement is
  **Complete** when the account has the required verified hands-on completion (or a concept lesson
  completion), **Complete (not verified yet)** when a hands-on row is only reported, **In progress**
  only for the lesson the account opened most recently and hasn't finished, and **Not started**
  otherwise. The next requirement is the first one that does not yet satisfy issuance. Signed out,
  no progress is shown: work done without an account never counts.
- **States.** Loading, accounts not configured, signed out (with sign-in and sign-up links that
  return to the track), progress unavailable (with retry; never eligible), not started (**Start
  certification track**), in progress (**Continue track**, opening the next requirement), eligible
  (the name choice, then **Get certificate**), and completed or revoked (the certificate's title,
  recipient, issue date, credential ID, verification link, PDF, Open Badge and copy link).
- **Issuing** goes through `POST /api/certificates` as before: the server checks the stored
  completions, and a repeat returns the same certificate. The button is disabled while a request
  is in flight.
- **Changing the criteria.** Add a new `criteriaVersion` rather than editing a version's lists.
  Certificates already issued keep the version and the requirement snapshot they were issued
  with, and their verification page keeps showing it.

The other two completion awards use the same version 2 verification rule. The server-graded
capstone remains separate; the dashboard lists the other awards below the track card.

## Verification

Every PDF prints its credential ID and "Check current status at" the exact verification URL, so
a printed copy never stands in for the live status. The URL is
`<NEXT_PUBLIC_SITE_URL>/verify/<uuid>`, as selectable text, and its QR code encodes the same URL
(`verificationUrl` in `lib/certificates/credential.ts`; the signed badge cites it as evidence and
the dashboard's "Copy verification link" copies it). Long names wrap onto two lines rather than
running past the name line, and the QR panel sits clear of the artwork's text.

`/verify/[id]` is public and needs no sign-in. On every request it reads the certificate from the
database by its random ID (`lookupCredential`) and shows:

- **Status:** **Valid** or **Revoked**, as text with an icon as well as colour, read from the
  stored record only, never from the URL, the PDF or the QR code. A revoked certificate says so
  however old the shared PDF is.
- **Details:** title, GitDojo as issuer, holder, issue date and time in UTC, credential ID and
  criteria version.
- **Criteria:** the snapshotted criteria, with the required lessons and Practice tasks by their
  current titles.
- **Verification basis:** criteria version 2 pages say that hands-on completions were verified on
  GitDojo's server. Older criteria version 1 certificates remain verifiable with their original
  snapshot and claim wording.

Only `publicCertificate` fields reach the page: no email, account ID or status index. The holder
is the name stored at issuance when the learner agreed to show it, and "Name withheld by
learner" otherwise. Page metadata follows the same rule.

- **Not found:** a malformed or unknown ID shows a "Credential not found" page with a 404 status.
- **Unavailable:** if the database cannot be read, the page says verification is unavailable and
  neither confirms nor denies the credential.
- **Never cached or indexed:** responses are dynamic and sent with `Cache-Control: no-store`, so a
  revocation shows at once. They carry `robots` noindex metadata and an
  `X-Robots-Tag: noindex, nofollow, noarchive` header (`next.config.ts`).

The page is GitDojo's live record. It is not a cryptographic proof; the signed Open Badge is.
The `/api/credentials` endpoint serves an RS256-signed OpenBadgeCredential JWT. Public JWK URLs
are retained in the database after key rotation. The badge includes a W3C Bitstring Status List entry; the matching
signed status list is served in batches of 131,072 entries. Status lists use a 60-second cache.

For an incorrect issuance, run from `apps/web`, with the database's migration credentials in the
environment:

```bash
node scripts/revoke-certificate.mjs <credential-uuid> --by "<operator>" --reason "<why>"
```

`--by` is required and `--reason` is optional. Migration `0008_certificate_revocation_audit`
stores both alongside the revocation time for GitDojo's own audit; they are never shown on the
verification page, in badges or in the status list. Revocation is permanent: a second run keeps
the original time, operator and reason. It updates both the verification page and the status
list. There is deliberately no web endpoint: learners can't revoke certificates, including their
own, and only someone with database credentials can.

**Reissuing.** A revoked certificate still counts as the learner's award for that criteria
version, so they can't simply issue another. When a certificate was issued with a mistake, such as
a misspelt name, revoke it with `--allow-reissue`:

```bash
node scripts/revoke-certificate.mjs <credential-uuid> --by "<operator>" --reason "Misspelt name" --allow-reissue
```

The old certificate stays revoked, and its verification page and status list say so. The learner
then fixes the cause (for a name, their account profile, then signs out and in) and uses **Get
certificate** again, which issues a new certificate with a new ID. `--allow-reissue` also works
on a certificate revoked earlier without it. Migration `0010_certificate_reissue` makes the
one-per-award rule a unique index over certificates not marked for reissue, so there is still
only ever one certificate that counts.

**Claim boundary and privacy:** version 2 requires server-verified Git repository evidence for
hands-on lessons and Practice tasks. GitDojo checks the attempt nonce and content version, verifies
canonical object hashes, reconstructs repository state and reruns the shared objectives. Concept
lessons remain completion records. The submitted repository payload is not retained: only its
SHA-256 digest and the objective result summary are stored for audit. This verifies the exercise
state, but is not proctoring, legal-identity verification or a general assessment of Git
proficiency. Version 1 certificates keep their original learner-reported claim. The separate Git
Practical Skills credential remains the server-graded capstone described in
[assessment.md](./assessment.md).

After deployment, issue a credential in a dedicated test account and check its JWT signature
against the public JWK URL in the `kid` header. Check that its `iss`, `sub`, `jti`, and `nbf` claims
match the embedded credential. Revoke the test certificate and confirm that the matching bit in
the fetched status list changes from zero to one. Submit both valid and revoked samples to the
[1EdTech conformance process](https://standards.1edtech.org/open-badges/specifications/standards/v3p0/cert)
before stating that GitDojo is certified. The official issuer test also asks for a credential
issued to its conformance recipient and a demonstration of badge retrieval. Certification
requires 1EdTech membership and review; a working signed badge alone is not certification.
