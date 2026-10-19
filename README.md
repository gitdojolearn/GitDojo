<div align="center">

<picture>
  <source media="(prefers-color-scheme: light)" srcset="apps/web/public/brand/gitdojo-logo-light.png" />
  <img src="docs/assets/gitdojo-banner.png" alt="GitDojo" width="640" />
</picture>

# GitDojo

**Learn Git by doing.**

_Learn it. Break it. Fix it. Master it._

</div>

GitDojo is an open-source interactive Git learning environment where developers learn Git by typing
real commands, manipulating safe browser-based repositories, and visualizing what happens
internally.

> **Status: early development.** Seven courses, from Git Basics to Remotes and Collaboration, ten
> real-world challenges, Practice mode and a free playground run end to end in the browser. The
> app includes a real Git engine, terminal and code editor, live repository visualizations,
> state-based objective validation, progressive hints, plain-words error explanations, and a
> progress dashboard. Progress works in the browser without an account; optional accounts through
> WSO2 Identity Platform sync completion records across devices. Signed-in learners can earn
> completion certificates or demonstrate Git skills in a separately server-graded capstone.

## What it does today

Open the demo lesson at `/learn/demo` ("Your First Commit"):

1. A virtual repository is created in your browser with a `README.md`.
2. You type `git status`, `git init`, `git add README.md` and `git commit -m "Initial commit"` into
   a real terminal.
3. Watch `README.md` move from **Working Tree** to **Staging Area**, and a commit appear in the
   **Repository Graph** with `main` and `HEAD` labels.
4. Objectives tick off as the repository reaches the right state. `git add .` works just as well
   as `git add README.md`, because GitDojo checks the result, not the command.

Or pick a course at `/learn`:

- **Git Basics** (10 lessons): what Git is, `git init`, reading `git status`, the working tree and
  staging area, `git add`, `git commit`, `git log`, and a first-repository challenge.
- **Branching** (6 lessons): branches and HEAD, `git branch`, `git switch` / `git switch -c`,
  committing on a feature branch, and a branching challenge. The graph draws each branch in its own
  lane.
- **Merging** (5 lessons): fast-forward and three-way merges, merge commits, the feature-branch
  workflow, and a merge challenge.
- **Merge Conflicts** (5 lessons): why conflicts happen, reading conflict markers, and resolving
  them by hand in a built-in editor, across one file or several.
- **Undo and Recover** (11 lessons): `git diff`, `git restore`, the three trees and
  `git reset`, `git revert`, `git stash`, `git cherry-pick`, recovering lost commits with
  `git reflog`, `git rebase`, and tidying history with an interactive rebase (`git rebase -i`:
  reorder, squash, fixup, reword and drop, edited in a Git editor dialog).
- **Everyday Git** (5 lessons): `.gitignore`, `git mv`, `git show`, amending a commit, and
  marking releases with lightweight and annotated tags (`git tag`).
- **Remotes and Collaboration** (6 lessons): remote-tracking branches, fetch, pull and push, then
  hands-on against a **simulated** `origin` that lives in your browser: publish a branch with
  `git push -u`, and sync with a teammate's push after a rejected push.

Then:

- **Challenges** (`/challenges`): ten real-world problems ("you committed to the wrong
  branch...") with a scenario, a mission and success conditions, but no step-by-step
  instructions.
- **Practice** (`/practice`): short tasks, one skill each, with a mission and no objectives or
  hints. Pick a topic or difficulty, or press **Surprise me**; GitDojo checks the end state,
  whichever way you get there. Practice is recorded separately and never earns XP.
- **Playground** (`/playground`): no lesson at all. Edit files, run anything, load ready-made
  scenarios (a merge conflict, a detached HEAD, a repository to recover...), and come back later:
  it survives a refresh.

Your progress is saved in the browser, no account needed. The **dashboard** (`/dashboard`) shows
your Git journey through the courses and where to continue, recommended next steps, the days you
learned over the last 30 days, a skill map (practiced, and mastered: three hands-on completions,
one of them unguided, each with the next thing to try), lessons, challenges and practice tasks
completed, XP, the Git commands you have used, recent activity and certificate progress, and
lets you download a branded **PDF progress report** (made in your browser; nothing is uploaded)
or reset your progress.

Accounts are optional. When a site configures [WSO2 Identity Platform](docs/authentication.md),
learners can **sign up and sign in** on its secure hosted pages (GitDojo never handles
passwords) and get an account menu on every page. With a PostgreSQL database, signed-in
learners' completions are saved to their account and appear in any browser
([docs/account-progress.md](docs/account-progress.md)); anonymous progress stays in the browser
and is never merged into an account.

Signed-in learners can earn three **completion certificates** by completing their named lessons
and Practice tasks. Each certificate has a downloadable PDF, a signed Open Badge, and a public
verification page with its issue date and current valid or revoked status. Learners choose whether
their name appears on the public page and badge. They enter the name printed on certificates in
the GitDojo account page; it is stored separately from the identity-provider profile and copied to
each certificate when issued. Current certificates require server-verified repository evidence
for hands-on lessons and Practice tasks; concept lessons remain completion records. These awards
do not claim to assess identity or Git proficiency. The separate [Git capstone](docs/assessment.md)
grades submitted Git history on the server and can issue an assessed Git Practical Skills credential.
See [certificate details](docs/certificates.md). Deploying: [docs/deployment.md](docs/deployment.md).

Every workspace has a **code editor** (Monaco) with a file explorer and Git status letters, so
editing a file really makes it "modified". When a command fails, the terminal shows Git's real
message and a **"Why did this happen?"** panel explains it, with likely causes based on your own
files and branches. **Hints** climb from a concept to the exact command, which only appears on
request.

Supported commands: `init`, `status`, `add`, `rm`, `commit`, `log`, `diff`, `restore`, `branch`,
`switch`, `checkout`, `merge`, `reset`, `revert`, `stash`, `cherry-pick`, `reflog`, `rebase`
(including `-i`), `tag`, and `remote`, `fetch`, `pull` and `push` against simulated remotes
(type `help` in any terminal). There is no network: `git clone` and `git remote add` are not
available.

Everything runs locally in the browser: Git is [isomorphic-git](https://isomorphic-git.org), files
live in IndexedDB via [LightningFS](https://github.com/isomorphic-git/lightning-fs), the editor is
[Monaco](https://microsoft.github.io/monaco-editor/) served from GitDojo itself, and there is no
real shell anywhere.

## Architecture

```text
Terminal (xterm.js)
  → Command Parser      tokenize + parse; unsupported programs never execute
  → Command Router      ParsedCommand → GitEngine
  → GitEngine           the only module that imports isomorphic-git
  → Virtual Filesystem  LightningFS + IndexedDB, one isolated directory per lesson
  → Repository State    normalized model: files, staged files, commits, branches
  → Validator Engine    lesson objectives checked against repository state
  → Progress            completions, XP and command stats, saved in IndexedDB
  → UI                  Zustand stores → React panels, React Flow graph, dashboard
```

See [docs/architecture.md](docs/architecture.md) for the full picture, including the safety model.

## Tech stack

| Area          | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| App           | Next.js 16 (App Router), React 19, TypeScript (strict)       |
| Styling       | Tailwind CSS 4, shadcn/ui-style components on Radix          |
| Terminal      | xterm.js                                                     |
| Editor        | Monaco (self-hosted, no CDN)                                 |
| Git           | isomorphic-git                                               |
| Filesystem    | LightningFS on IndexedDB                                     |
| Visualization | React Flow                                                   |
| State         | Zustand                                                      |
| Content       | YAML lessons validated with Zod                              |
| Accounts      | WSO2 Identity Platform (`@asgardeo/nextjs`), optional        |
| Tests         | Vitest, React Testing Library, Playwright                    |
| Tooling       | pnpm workspaces, Turborepo, ESLint, Prettier, GitHub Actions |

## Local development

Requirements: Node.js 20.9+ (24 recommended, see `.nvmrc`) and pnpm via Corepack.

```bash
corepack enable
pnpm install
pnpm dev            # http://localhost:3000, then open /learn
```

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`              | Start the web app in development mode                                   |
| `pnpm build`            | Production build (also validates every lesson)                          |
| `pnpm lint`             | ESLint across all packages                                              |
| `pnpm typecheck`        | `tsc --noEmit` across all packages                                      |
| `pnpm test`             | Unit and integration tests (Vitest) across all packages                 |
| `pnpm validate:content` | Validate all lessons, challenges and scenarios, playing every solution  |
| `pnpm test:e2e`         | Build, then run Playwright (desktop + mobile, with accessibility scans) |
| `pnpm perf`             | Stress scenarios with timings (see docs/testing.md)                     |
| `pnpm format`           | Format with Prettier                                                    |
| `pnpm format:check`     | Check formatting, as CI does                                            |
| `pnpm db:migrate`       | Apply database migrations to `DATABASE_URL` (accounts only)             |

Before the first `pnpm test:e2e`, install a browser:
`pnpm --filter @gitdojo/web exec playwright install chromium`.

### Configuration

Nothing needs configuring to learn: lessons, challenges, Practice, the playground and the local
dashboard work with no environment variables. Accounts, account progress and certificates are
opt-in. Copy `apps/web/.env.example` to `apps/web/.env.local` (git-ignored) and set what you need:

| Variable                                  | Purpose                                                            | Needed for                     | Secret |
| ----------------------------------------- | ------------------------------------------------------------------ | ------------------------------ | ------ |
| `NEXT_PUBLIC_ASGARDEO_BASE_URL`           | WSO2 Identity Platform organization URL                            | Accounts                       | No     |
| `NEXT_PUBLIC_ASGARDEO_CLIENT_ID`          | WSO2 application client ID                                         | Accounts                       | No     |
| `ASGARDEO_CLIENT_SECRET`                  | WSO2 application client secret                                     | Accounts                       | Yes    |
| `ASGARDEO_SECRET`                         | Signs the session cookie (32+ characters)                          | Accounts                       | Yes    |
| `DATABASE_URL`                            | PostgreSQL 13+ connection (pooled in production)                   | Account progress, certificates | Yes    |
| `DATABASE_URL_UNPOOLED`                   | Direct connection, used only by migrations                         | Migrations (optional)          | Yes    |
| `NEXT_PUBLIC_SITE_URL`                    | Permanent HTTPS origin, printed on certificates and their QR codes | Certificates                   | No     |
| `GITDOJO_CREDENTIAL_KEY_ID`               | Stable ID of the badge signing key, e.g. `rsa-2026-01`             | Certificates                   | No     |
| `GITDOJO_CREDENTIAL_PRIVATE_KEY`          | RSA private key (PEM) that signs Open Badges                       | Certificates                   | Yes    |
| `NEXT_PUBLIC_LINKEDIN_ADD_TO_PROFILE_URL` | GitDojo's LinkedIn Add to Profile link for sharing certificates    | Optional                       | No     |
| `GITDOJO_SELF_REGISTRATION`               | `disabled` when self sign-up is off                                | Optional                       | No     |
| `ASGARDEO_SESSION_COOKIE_EXPIRY_TIME`     | Session lifetime in seconds (default 86400)                        | Optional                       | No     |
| `DATABASE_POOL_MAX`                       | Connections per server instance (1–20, default 5)                  | Optional                       | No     |
| `GITDOJO_RATE_LIMIT_*`                    | Request limits; see [docs/rate-limits.md](docs/rate-limits.md)     | Optional                       | No     |

Never put a secret in a `NEXT_PUBLIC_` variable: those are bundled into browser code. Setup
guides: [authentication](docs/authentication.md) (accounts, with a local mock identity provider
for tests) and [account progress](docs/account-progress.md) (PostgreSQL). Without the account
variables, the sign-in pages say accounts are unavailable and everything else works.

### Database

Account progress, certificates and the capstone need PostgreSQL 13 or later. Set `DATABASE_URL`,
then run `pnpm db:migrate`; migrations live in `apps/web/db/migrations` and only move forward.
`/api/health` reports a database that is missing a migration. Database integration tests run
against a dedicated test database: `TEST_DATABASE_URL=... pnpm --filter @gitdojo/web test:db`
([docs/account-progress.md](docs/account-progress.md)).

## Certificates

Signed-in learners can earn three **completion certificates**, and the separate server-graded
[capstone](docs/assessment.md) can earn an **assessed** credential. The **certification track**
(`/certification`, also in the main navigation and on the dashboard) is the guided path to the
first one, the Git Foundations completion certificate (criteria version 2): ten Git Basics lessons
and one Practice task, listed in order before you start. Signed in, it shows how many are
complete, opens the next one, and lets you get, download and share the certificate when they are
all done. Progress comes from the completions saved to your account, the same records issuing
checks.

- **Issuance** runs on the server against the account's stored completions, once per learner,
  award and criteria version (a database constraint makes retries and concurrent requests safe).
- **Hands-on completion is server verified.** A signed-in browser starts a content-versioned
  attempt, exports canonical Git objects and repository state, and the server rebuilds that state
  and runs the same objectives before a hands-on completion can count toward version 2. Concept
  lessons remain completion records. The capstone is still the separately graded skills credential.
- **PDF:** made on the server from the stored record. It shows the holder's name, issue date and
  credential ID, plus the verification URL as text and as a QR code, and points readers there for
  the current status.
- **Verification:** `/verify/<id>` is public and reads the record on every request. It shows
  **Valid** or **Revoked**, never cached or indexed. The holder's name appears only if they
  agreed when the certificate was issued; otherwise it says "Name withheld by learner".
- **Revocation:** an operator command, run with database credentials and never exposed on the web:
  `node apps/web/scripts/revoke-certificate.mjs <id> --by "<operator>" --reason "<why>"`. The
  operator and reason are kept for audit and never published. Add `--allow-reissue` when the
  learner should be able to get a corrected certificate, such as after a misspelt name.
- **Sharing:** an earned certificate has a **Share certificate** section: **Add to LinkedIn**
  (with each field LinkedIn asks for, ready to copy, since LinkedIn no longer pre-fills them),
  **Copy verification link**, **Download badge image** (a PNG for posts) and **Download signed
  Open Badge**.
- **Open Badges 3.0:** each credential is also an RS256-signed OpenBadgeCredential with a
  Bitstring Status List entry for revocation. It has not been through 1EdTech conformance
  certification. The verification link and QR code are a lookup on GitDojo's site, not a
  cryptographic proof; the signed badge is.

Details, key generation and checks: [docs/certificates.md](docs/certificates.md).

## Deployment

GitDojo deploys to Vercel with a Neon PostgreSQL database and WSO2 Identity Platform. Pull
requests get anonymous Vercel previews. When CI passes on `main`, the **Release** workflow
migrates and deploys **staging**, smoke tests it and drafts a GitHub Release. Publishing that
draft runs **Publish release**, which migrates and promotes **production**.

Each environment has its own variables, set in Vercel (secrets marked Sensitive, never on
Preview) and in the matching GitHub environment for migrations. The full guide, including
first-time setup, smoke tests and rollback, is [docs/deployment.md](docs/deployment.md).
[docs/repository-protection.md](docs/repository-protection.md) covers the GitHub settings that
protect `main`, which have to be set in GitHub.

## Troubleshooting

| Symptom                                                      | Likely cause and fix                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in pages say accounts are unavailable                   | A WSO2 variable is missing, or `ASGARDEO_SECRET` is under 32 characters. Set them; restart `pnpm dev` (or redeploy) after changing `NEXT_PUBLIC_` values. |
| Signed-in progress isn't saved, or `/api/health` returns 503 | `DATABASE_URL` is missing or wrong, or migrations weren't applied. Check the URL, then run `pnpm db:migrate`.                                             |
| "Certificates can't be issued on this site yet"              | `NEXT_PUBLIC_SITE_URL` or a credential key setting is missing or invalid. The server log names which one (never its value).                               |
| "Some completions have not reached your account yet"         | The account doesn't have every required completion yet. Let progress sync (stay signed in and online), then issue again.                                  |
| A verification link shows "Credential not found"             | The ID is mistyped or incomplete: it's the 36 characters after `/verify/`.                                                                                |
| `pnpm test:e2e` can't find a browser                         | Run `pnpm --filter @gitdojo/web exec playwright install chromium`.                                                                                        |
| The editor never loads, or `/monaco/vs/loader.js` is a 404   | Use `pnpm dev` or `pnpm build`, which copy Monaco into `public/`; plain `next dev` doesn't.                                                               |

More deployment failures and fixes: [docs/deployment.md](docs/deployment.md#common-failures).

## Monorepo structure

```text
gitdojo/
├── apps/
│   └── web/                  Next.js app (courses, challenges, playground, workspaces)
├── packages/
│   ├── git-engine/           VirtualFileSystem + GitEngine (isomorphic-git, LightningFS)
│   ├── command-parser/       tokenizer, parser, command router
│   ├── repository-state/     Git snapshot → normalized RepositoryState
│   ├── lesson-engine/        lesson schema, YAML loader, setup/reset, progress, scenarios
│   ├── challenge-engine/     challenge schema, loader, categories, availability
│   ├── validator/            state-based objective validators
│   ├── error-engine/         "Why did this happen?" explanations
│   ├── hints/                progressive hint levels and state
│   ├── progress/             local progress: XP, completions, IndexedDB storage, migration
│   ├── shared-types/         domain types shared by every package
│   ├── ui/                   design tokens and components (see docs/ui.md)
│   └── config/               shared TypeScript, ESLint and Prettier config
├── content/
│   ├── courses/              course definitions (lesson order)
│   ├── lessons/              lesson YAML files, one directory per course
│   ├── challenges/           challenge YAML files
│   ├── practice/             Practice mode task YAML files
│   └── playground/           playground scenario YAML files
└── docs/                     architecture and contributor guides
```

## Contributing

Contributions are very welcome, and **writing a lesson is the easiest place to start**: it's a
single YAML file. See:

- [CONTRIBUTING.md](.github/CONTRIBUTING.md): setup and workflow
- [docs/lesson-authoring.md](docs/lesson-authoring.md): how to write a lesson (and a playground
  scenario)
- [docs/challenge-authoring.md](docs/challenge-authoring.md): how to write a challenge
- [docs/validators.md](docs/validators.md): available validators and how to add one
- [docs/git-engine.md](docs/git-engine.md): how Git commands are implemented
- [docs/command-parser.md](docs/command-parser.md): how input is parsed and routed
- [docs/progress.md](docs/progress.md): local progress, XP and what counts
- [docs/authentication.md](docs/authentication.md): accounts with WSO2 Identity Platform, setup
  and console configuration
- [docs/account-progress.md](docs/account-progress.md): PostgreSQL, migrations and the account
  progress API
- [docs/certificates.md](docs/certificates.md): completion awards, public verification, Open Badges
  and revocation
- [docs/assessment.md](docs/assessment.md): the server-graded Git capstone and assessed credential
- [docs/testing.md](docs/testing.md): tests, accessibility review and performance results
- [docs/ci.md](docs/ci.md): CI jobs, security scans and reports
- [docs/repository-protection.md](docs/repository-protection.md): rulesets for `main`, bypass and
  how to test them
- [docs/deployment.md](docs/deployment.md): Vercel, Neon and WSO2, releases and rollback
- [docs/release-notes.md](docs/release-notes.md): writing the learner highlights for a release
- [docs/theming.md](docs/theming.md): light and dark themes, tokens, and the terminal and editor
- [docs/ui.md](docs/ui.md): the design system

## Roadmap

- [x] Monorepo, CI, design tokens
- [x] Browser virtual filesystem and Git engine (`init`, `status`, `add`, `commit`, `log`,
      `branch`, `switch`, `merge`, and the recovery commands below)
- [x] Safe command parser and router
- [x] Terminal, repository graph, working tree / staging visualization
- [x] Data-driven lessons with state-based validation, and the first-commit lesson
- [x] Courses (`/learn`): Git Basics, Branching, Merging, Merge Conflicts and Undo and Recover
- [x] Branch visualization with lanes, branch labels and HEAD
- [x] Merging (fast-forward, three-way) and hand-resolved merge conflicts
- [x] Code editor (Monaco) with file explorer and Git status letters
- [x] Playground with scenarios, persistence and snapshot export
- [x] Challenge mode: ten real-world challenges
- [x] Recovery commands: `diff`, `restore`, `rm`, `reset`, `revert`, `stash`, `cherry-pick`,
      `reflog`, `rebase`
- [x] Error explanations and progressive hints
- [x] Local progress and dashboard: completions, XP, command and hint stats, export and reset
- [x] Testing and stabilization: integration and end-to-end coverage, accessibility (WCAG AA
      scans), performance fixes
- [x] Accounts with WSO2 Identity Platform: hosted sign-in and sign-up, account menu, sign-out
- [x] Account progress storage: PostgreSQL, migrations, protected progress API
- [x] Account-backed completion progress across devices
- [x] Versioned completion certificates with PDF, signed Open Badge and public verification
- [x] Server-graded Git capstone with an assessed skills credential
- [x] Simulated remotes in the browser: `remote`, `fetch`, `pull` and `push`
- [ ] Real remote repositories (`clone` over the network), then real GitHub

## License

[MIT](LICENSE)
