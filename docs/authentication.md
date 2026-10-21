# Authentication

GitDojo accounts use [WSO2 Identity Platform](https://wso2.com/identity-platform/) through its
official Next.js SDK, [`@asgardeo/nextjs`](https://wso2.com/identity-platform/docs/quick-starts/nextjs/)
(the SDK still uses the Asgardeo name). Accounts are **optional**: every lesson, challenge, the
playground and the local progress dashboard work without one, and without any configuration.

## What is GitDojo's and what is WSO2's

| Screen                                                                     | Served by               | What happens                                                        |
| -------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `/sign-in`, `/sign-up`                                                     | GitDojo                 | Explains the action and hands over with one button. No form fields. |
| Sign-in, registration, email verification, password recovery, social login | **WSO2 (hosted pages)** | Credentials are entered here, never on a GitDojo page.              |
| `/auth/callback`                                                           | GitDojo                 | "Finishing sign-in…", then back to the page the learner came from.  |
| `/account`                                                                 | GitDojo                 | Name, email and avatar; sign out.                                   |
| `/auth/sign-out` → WSO2 logout → `/auth/signed-out`                        | GitDojo, then WSO2      | Ends the session everywhere, then "You're signed out".              |

GitDojo stores no passwords. Signing in or out never changes anonymous progress or playground
repositories ([progress.md](./progress.md)). With a PostgreSQL database configured, signed-in
learners see and save their account's lesson progress instead
([account-progress.md](./account-progress.md)). Staging and production WSO2 applications and
their exact callback URLs: [deployment.md](./deployment.md#wso2-applications).

## How it works

```text
Header (every page) ── fetch /api/auth/session ──▶ server: SDK session cookie → OIDC userinfo
                                                   { unconfigured | signed-out | signed-in + profile }

/sign-in ─ "Sign in" ─▶ server action stores the safe return path (httpOnly cookie)
                      ─▶ SDK signIn() ─▶ WSO2 hosted sign-in (or "Register")
WSO2 ─▶ /auth/callback?code&state ─▶ SDK exchanges the code (server) and sets its signed,
                                      httpOnly session cookie ─▶ redirect to the return path
```

- **Static learning pages.** Only the account routes (`app/(account)/`: `/sign-in`, `/sign-up`,
  `/account`, `/auth/*`) render the SDK's `AsgardeoProvider`, and only when configured. All other
  pages stay statically generated; their header asks `/api/auth/session` after loading, so
  learning never waits on, or breaks because of, the identity provider.
- **`proxy.ts`** (Next.js 16) runs the SDK's `asgardeoMiddleware` on account routes,
  `/api/auth/*` and `/api/progress/*` only: it refreshes tokens, clears dead sessions and sends signed-out visitors of
  `/account` to `/sign-in?returnTo=/account`. Static files, images and Monaco's assets never pass
  through it. It is an optimistic check only.
- **Server-side authorization.** `/account` and `/api/auth/session` validate the session on the
  server with the SDK (`asgardeo().getSessionId()` verifies the session cookie's signature and
  expiry). Client components such as the header never decide access.
- **Profile.** Read from the standard OIDC userinfo endpoint (`{baseUrl}/oauth2/userinfo`) with
  the session's access token, cached per session for five minutes. Scopes are `openid profile
email` only; no repository or API permissions are requested.
- **One SDK boundary.** Components use `useAuthClient()` (`features/auth/services/auth-client.ts`),
  a typed wrapper around the SDK's `useAsgardeo()`; server code uses `lib/auth/session.ts`. Both
  are mocked in tests.

### Return paths

`safeReturnPath` (`lib/auth/return-path.ts`) accepts only same-origin relative paths: a single
leading `/`, no `//`, no backslashes, no control characters, at most 512 characters, and never the
sign-in pages themselves (which would loop). Anything else becomes `/learn`. The path is
validated when links are built, again on the server when it is stored in the `gitdojo_return_to`
cookie (httpOnly, `SameSite=Lax`, 30 minutes), and again when the callback reads it.

### States

| State                      | What the learner sees                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not configured             | No account controls in headers; `/sign-in` and `/sign-up` say accounts aren't available, with "Continue learning". `/account` and `/auth/*` redirect safely.                                 |
| Initializing               | Button shows "Preparing…" (disabled); the header reserves space while the session loads.                                                                                                     |
| Redirect in progress       | Button shows "Redirecting…", disabled; a second click does nothing. Using Back resets it.                                                                                                    |
| Successful return          | "Finishing sign-in…", then the page the learner started from, signed in.                                                                                                                     |
| Cancelled on the WSO2 page | `/sign-in` with "Sign-in was cancelled." (`error=access_denied`).                                                                                                                            |
| Failure                    | `/sign-in` with "We couldn't sign you in." Starting fails → "We couldn't reach the sign-in service." If completing hangs for 20 s, a retry link appears. Provider error text is never shown. |
| Expired or revoked session | Shown once: "Your session has ended. Your learning progress is still here. Sign in again."                                                                                                   |
| Signing out                | "Signing you out…", then WSO2's logout, then "You're signed out". Opened directly (not from the menu), the page asks first, so a stray link cannot sign anyone out.                          |
| Registration unavailable   | With `GITDOJO_SELF_REGISTRATION=disabled`, `/sign-up` says registration is closed.                                                                                                           |

## Configuration

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill it in. Never commit real values
(`.env` and `.env.*` are git-ignored, except the example).

| Variable                              | Required      | Purpose                                                                                                                                                                  |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_ASGARDEO_BASE_URL`       | yes           | `https://api.asgardeo.io/t/<organization>` (https; `http://localhost` is allowed for a local server)                                                                     |
| `NEXT_PUBLIC_ASGARDEO_CLIENT_ID`      | yes           | The application's client ID                                                                                                                                              |
| `ASGARDEO_CLIENT_SECRET`              | yes           | The client secret. Server-side only                                                                                                                                      |
| `ASGARDEO_SECRET`                     | in production | Signs the session cookie (at least 32 characters: `openssl rand -base64 32`). Without it the SDK uses a fixed development key, so production treats auth as unconfigured |
| `GITDOJO_SELF_REGISTRATION`           | no            | `disabled` when self-registration is off in your organization                                                                                                            |
| `ASGARDEO_SESSION_COOKIE_EXPIRY_TIME` | no            | Session cookie lifetime in seconds (SDK default 86400)                                                                                                                   |

Values are read at request time, so a build made without them works once they are set at
runtime. If any required value is missing, GitDojo runs without accounts. Missing variable
**names** (never values) are available to server code through `readAuthConfig()`; tokens and
secrets are never logged.

Do not set `NEXT_PUBLIC_ASGARDEO_SIGN_IN_URL` or `NEXT_PUBLIC_ASGARDEO_SIGN_UP_URL`: they are for
the SDK's embedded forms, which GitDojo does not use.

## WSO2 console setup

These steps are done by whoever operates the GitDojo deployment, in the
[WSO2 Identity Platform console](https://console.asgardeo.io/). None of them have been performed
as part of this repository's changes.

### 1. Create the application

1. Go to **Applications → New Application** and choose the **Next.js** template.
2. Name it (e.g. `GitDojo`) and set the **Authorized redirect URL** to
   `http://localhost:3000/auth/callback` for development.
3. On the application's **Protocol** tab, add every redirect URL GitDojo uses (one per line or
   with **+**):

   | Environment | Sign-in callback                      | After sign-out                          |
   | ----------- | ------------------------------------- | --------------------------------------- |
   | Development | `http://localhost:3000/auth/callback` | `http://localhost:3000/auth/signed-out` |
   | Production  | `https://<your-domain>/auth/callback` | `https://<your-domain>/auth/signed-out` |

   WSO2 rejects redirects to URLs that are not listed, including the post-sign-out redirect. Also
   add your origins under **Allowed origins** if your organization requires it, and keep the
   **Code** and **Refresh Token** grant types enabled.

4. On the **Guide** (or **Info**/**Protocol**) tab, copy the **Client ID**, **Client secret** and
   the organization **base URL** (`https://api.asgardeo.io/t/<organization>`) into
   `apps/web/.env.local`.

### 2. Create a test user

**User Management → Users → Add User**, then sign in with that user on `/sign-in`. Use test
accounts only; GitDojo's automated tests never use real WSO2 accounts.

### 3. Enable self-registration (for "Create account")

**Login & Registration → User Onboarding → Self Registration**, toggle it on. Optionally enable
**account verification** (a confirmation email) and **Activate account immediately**. Newer
organizations use the flow-based registration editor instead; enable registration there.

WSO2 does not document a URL that opens registration directly, so GitDojo's "Create account"
opens the hosted sign-in page, where self-registration adds a **Register** option; the sign-up
page tells learners to choose it. If you keep registration off, set
`GITDOJO_SELF_REGISTRATION=disabled` so `/sign-up` says so instead.

### 4. Brand the hosted pages

**Branding → Styles & Text**, choose **Organization** or the GitDojo **Application**, then set
the logo, favicon, dark theme and colors. Suggested values from GitDojo's design system:
background `#0B0D10`, surface `#151920`, primary `#6C8CFF` (button fill `#4A67E0` keeps white text
at 4.5:1), text `#F4F7FB`, font Inter. Preview, then publish.

### 5. Optional: GitHub sign-in

1. On GitHub, create an OAuth app with **Homepage URL** `https://api.asgardeo.io/t/<organization>`
   and **Authorization callback URL** `https://api.asgardeo.io/t/<organization>/commonauth`.
2. In the console, **Connections → New Connection → GitHub**, with that app's client ID and
   secret. WSO2 requests only the `email` and `public_profile` scopes (no repository access).
3. In GitDojo's application, **Login Flow** tab, add the GitHub connection, and save.

"Sign in with GitHub" then appears on the hosted sign-in page. GitDojo does not show its own
GitHub button, so nothing is advertised that the organization has not configured.

## Staging identity-provider verification

Run this checklist against the stable **staging** URL after the first deployment, after changing
the WSO2 application or tenant configuration, and before publishing a release that changes
authentication. It supplements (and does not replace) the automated mock-provider tests and the
read-only deployment smoke test in [deployment.md](./deployment.md#smoke-tests). Do not use a
production learner account. Use a dedicated staging test account and the staging WSO2 application.

### Before you start

- [ ] Confirm the staging WSO2 application has the exact staging callback and signed-out URLs
  listed in [deployment.md](./deployment.md#wso2-applications), and its allowed origin is the
  staging origin.
- [ ] Confirm its client ID and secret, organization URL, and session secret are configured in
  the staging Vercel project's **Production** environment. Do not copy values into notes, issue
  comments, screenshots, or terminal commands.
- [ ] Confirm `/api/health` reports `database: "ok"` and the deployment smoke test passes.
- [ ] Have access to a dedicated test mailbox if email verification is enabled. Use a unique
  staging test address; do not use a real learner's account.
- [ ] Open a private browser window and start signed out. Keep the browser's address bar visible
  during redirects, but never capture passwords, one-time codes, tokens, cookies, or verification
  links in screenshots or logs.

### Registration and email verification

- [ ] Visit `/sign-up` and follow **Create account** to the WSO2 hosted page. Confirm the page
  offers registration when self-registration is enabled.
- [ ] Register the dedicated test user. Confirm the browser stays on the WSO2 host while entering
  credentials; GitDojo must not collect a password.
- [ ] If email verification is enabled, complete it from the test mailbox. Confirm the account can
  then sign in. If verification is disabled, record that this check was not applicable.
- [ ] Confirm the hosted sign-in and registration pages show the published GitDojo or organization
  branding configured for staging (logo, colors, and favicon where displayed).

### Sign-in, return path, and session

- [ ] In a fresh private window, open `/learn/git-basics/what-is-git`, then choose **Sign in** in
  the header. Sign in through the hosted page and confirm the callback returns to that lesson.
- [ ] Confirm the header shows the signed-in account and `/account` displays the expected profile.
- [ ] Reload `/account`; confirm the session remains signed in. Open `/api/auth/session` and confirm
  it reports `signed-in` without exposing tokens or cookie data.
- [ ] Open `/account` in a separate signed-out private window. Confirm it redirects through sign-in
  and returns to `/account` after successful authentication.
- [ ] Start sign-in and cancel on the WSO2 page. Confirm GitDojo returns to `/sign-in` with the
  cancellation message and does not expose provider error details.

### Sign-out and local learning data

- [ ] In the signed-in window, complete a concept lesson and note its completion in the dashboard.
- [ ] Use the account menu to sign out. Confirm the flow visits WSO2 logout and ends on GitDojo's
  "You're signed out" page.
- [ ] Confirm the header is signed out and the lesson, local dashboard progress, and playground
  repository remain available. Signing out must not erase anonymous browser data.
- [ ] Sign in again and confirm the account's server-synced progress appears as expected; do not
  expect anonymous progress to merge into the account.

### Registration-disabled configuration (when applicable)

- [ ] If staging intentionally disables self-registration, set
  `GITDOJO_SELF_REGISTRATION=disabled` and confirm `/sign-up` explains registration is closed.
- [ ] Confirm the WSO2 hosted sign-in page does not offer registration. Existing test users should
  still be able to sign in.

Record only the staging URL, date, release or commit, tester, pass/fail for each applicable
section, and sanitized failure details. Never record user identifiers, email addresses, secrets,
session contents, one-time codes, or verification links. A failed check blocks release sign-off
until it is fixed or explicitly accepted by the release owner. Restore the intended registration
setting after testing if it was changed.

## Tests

- `lib/auth/*.test.ts`: return-path validation (absolute, protocol-relative, backslash, control
  characters, loops), configuration (missing values, production secret, no secret leakage),
  session reading against a mocked SDK (signed out, signed in, revoked token, failures never log
  tokens).
- `features/auth/*.test.tsx`: the sign-in/sign-up button (one redirect per click, return path
  first, generic errors, Back), sign-out (immediate from the menu, confirmation otherwise, local
  data untouched), header states, the keyboard-operable account menu, the expired-session notice,
  and the server pages (configured, unconfigured, registration closed, callback cancel, failure
  and success, tampered return cookie, `/account` protection).
- `proxy.test.ts`: the proxy is a no-op without configuration and protects `/account`.
- `e2e/auth.spec.ts` (no configuration, as in CI): public routes stay anonymous, account routes
  fall back safely, header states from the session endpoint, keyboard and axe checks, and local
  progress across sign-in and sign-out.
- `e2e/auth-flow.spec.ts`: the real SDK flow against a local mock OpenID Connect provider
  (`e2e/mock-idp/server.mjs`, test-only): sign up from a lesson and return to it, reload, the
  account page, sign out through the provider, cancellation, `/account` protection, a forged
  session cookie, and double clicks. It runs on a second server (`next start` on port 3101) with
  test-only values, in CI too; no secrets are needed.

The mock provider is not WSO2: tenant settings, hosted page behavior, registration, email
verification and branding require the staging verification above.

## Known limitations

- "Create account" cannot open the registration form directly; learners choose **Register** on
  the hosted page.
- The local mock provider in CI cannot verify the live WSO2 tenant configuration or hosted-page
  behavior. Those checks require the dedicated staging verification above.
- The SDK keeps the access and refresh tokens inside its signed (not encrypted) httpOnly session
  cookie. Scripts cannot read it, but use HTTPS in production (the cookie is `Secure` there).
- Sign-out returns through WSO2's logout endpoint; if WSO2 cannot be reached, the local session is
  still cleared and the learner lands on "You're signed out".
