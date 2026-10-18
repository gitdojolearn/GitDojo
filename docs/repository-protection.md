# Repository protection

How `main` should be protected, which parts of that live in this repository, and which have to be
set in GitHub's settings. [ci.md](./ci.md#repository-settings) has the short version; this is the
operator's guide.

This guide was written from the repository's files. It does not describe the live rulesets: those
are only visible in **Settings → Rules → Rulesets** (or through the GitHub API with admin access),
and nothing here changes them. Compare it against what is configured before relying on it.

## What is in code, and what is not

| Protection                                                      | Where it lives                                                                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Who owns which files                                            | `.github/CODEOWNERS` (`* @Aakashwije @AshwinJay14`). It only takes effect when a ruleset requires code owner review.         |
| What CI checks                                                  | `.github/workflows/ci.yml`, summarized by one gate job, **`CI required`**                                                    |
| Dependency and code scanning                                    | `.github/workflows/dependency-review.yml` (**`Dependency review`**, pull requests only) and `codeql.yml`                     |
| Staging and production deploys, release approval                | `release.yml` and `publish.yml`, using the GitHub environments `staging` and `production` ([deployment.md](./deployment.md)) |
| Rulesets: required pull requests, reviews, checks, force pushes | **GitHub settings only**                                                                                                     |
| Bypass list                                                     | **GitHub settings only**, per ruleset                                                                                        |
| Environment rules (who may deploy, which tags)                  | **GitHub settings only** (Settings → Environments)                                                                           |

Committing a workflow or `CODEOWNERS` never turns a protection on. A check only blocks merging once
a ruleset lists it as required.

## Recommended ruleset for `main`

Create one branch ruleset (**Settings → Rules → Rulesets → New branch ruleset**), enforcement
**Active**, targeting the default branch:

- **Restrict deletions** and **Block force pushes.**
- **Require a pull request before merging**:
  - **Required approvals: 1.** Raise it when the team grows.
  - **Dismiss stale pull request approvals when new commits are pushed**, so an approval always
    covers the code being merged.
  - **Require approval of the most recent reviewable push**, so nobody can approve their own last
    change.
  - **Require review from Code Owners**, if both owners are meant to review each other's work.
    With the current `CODEOWNERS`, each owner can approve the other's pull request; one owner
    alone can't merge their own. GitHub reads `CODEOWNERS` from the base branch, so a change to
    it applies only after it has merged.
  - **Require conversation resolution before merging.**
- **Require status checks to pass**:
  - **`CI required`.** It fails whenever any CI job fails, is cancelled or is unexpectedly
    skipped, so it stays correct as jobs change. Don't list matrix jobs such as
    `Quality / lint` or `Unit tests / Node 22`; their names change with the matrix.
  - **`Dependency review`**, for pull requests. It runs only on pull requests, so check how it
    behaves before also requiring it in a merge queue.
  - Code scanning: add a **Require code scanning results** rule for CodeQL with the severities
    that should block, if your plan offers it.
  - **Require branches to be up to date before merging**, or use a merge queue instead (CI
    already runs on `merge_group`).
- Leave **Require linear history** off: `main` uses merge commits from pull requests.

If you also protect release tags (`v0.1.*`) with a tag ruleset, make sure the people who publish
releases can still create them; publishing a draft release creates its tag.

## Bypass is not approval

- **An approval** is a review on one pull request. It satisfies the "required approvals" rule and
  nothing else: checks, conversation resolution and code owner review still apply.
- **A bypass** lets an actor ignore the ruleset's rules, for example merging without approval or
  with failing checks. It is granted to roles, teams or apps in that ruleset's bypass list.
- **Bypass is per ruleset.** Being on the bypass list of one ruleset does nothing for another,
  and an organization ruleset and a repository ruleset are evaluated separately; every ruleset
  that applies must be satisfied or bypassed.
- A bypass can be **Always** or **For pull requests only**. Prefer pull requests only: the bypass
  is then a visible, recorded choice on a pull request rather than a silent direct push.

### Who should be able to bypass

- **By default, nobody.** Day-to-day merges should pass the same rules for everyone, admins
  included.
- If an emergency path is needed, add the **repository admin role** only, **for pull requests
  only**, and agree when it may be used, for example a broken release that blocks every pull
  request. Don't add individuals.
- **Don't add Dependabot or other bots.** Their pull requests should pass CI like any other.
- **Never widen the bypass list, or switch a ruleset to Disabled, just to merge one pull
  request.** Fix the check, get the review, or use the agreed emergency path, then restore
  anything you changed. Rulesets record changes in their history, so changes can be audited.

## Find the exact check names

Required checks are matched by name, so copy them from a real run rather than from the workflow
file:

1. Open a recent pull request whose checks passed, then its **Checks** tab. The names listed there
   (`CI required`, `Dependency review`, `CodeQL / JavaScript and TypeScript`...) are the exact
   names to require.
2. Or, with the GitHub CLI signed in:
   `gh api repos/<owner>/<repo>/commits/<sha>/check-runs --jq '.check_runs[].name'`
3. In the ruleset's status check picker, choose the name from the suggestions. A name that has
   never reported on the repository can never pass, and blocks every merge.

## Test the rules

Use an account that is a member, not an admin and not on any bypass list, so you test what a
normal contributor sees:

1. Push directly to `main`. **Expected:** rejected.
2. Force push to `main`. **Expected:** rejected.
3. Open a pull request with a deliberately failing test. **Expected:** merging is blocked until
   `CI required` passes.
4. Merge your pull request with no approval. **Expected:** blocked. (GitHub never lets authors
   approve their own pull requests.)
5. After an approval, push another commit. **Expected:** the approval is dismissed.
6. With code owner review on, have a non-owner approve. **Expected:** still blocked until an
   owner approves.
7. Afterwards, check **Settings → Rules → Insights** to confirm each attempt was evaluated by the
   rulesets you expected.

Repeat steps 3 to 6 after any change to a ruleset.
