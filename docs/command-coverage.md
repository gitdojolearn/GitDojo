# Hands-on command coverage

This matrix tracks the commands taught by the curriculum where a walkthrough used to be necessary,
and calls out the boundary of the browser sandbox. “Supported” means the terminal parser, router,
and engine execute the behavior. Mutating lesson objectives are validated from repository state;
read-only commands such as `git show` are demonstrated with runnable examples because they leave
no state change for an objective validator to inspect.

| Curriculum area              | Lesson                                                          | Supported behavior                                                                                                                                                       | Remaining gap                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Amend the latest commit      | `everyday-git/git-commit-amend`                                 | `git commit --amend -m <message>` replaces the tip; `--no-edit` keeps its message. The original author and parent are retained and `git reflog` records the replacement. | No editor-backed `git commit --amend` without `-m`/`--no-edit`; no force push of rewritten history.                                          |
| Inspect a commit             | `everyday-git/git-show`                                         | `git show [<commit>]` prints metadata and the first-parent patch; `<commit>:<path>` prints that file's contents at the revision.                                         | Merge commits show metadata without a combined patch; use `git diff` for explicit comparisons.                                               |
| Rename a file                | `everyday-git/git-mv`                                           | `git mv <source> <destination>` moves a tracked file and stages both sides; the lesson validates the committed path change.                                              | Directories as sources, force-overwrite, and moving untracked files are not supported.                                                       |
| Rewrite a branch             | `recovery/git-rebase-interactive`                               | `git rebase -i` supports pick, reword, squash, fixup and drop using the in-app editor; conflict continuation, skip and abort are implemented.                            | Other todo actions such as `edit`, `exec`, `break`, `label`, `reset` and `merge` are rejected.                                               |
| Publish/synchronize branches | `remotes/git-push`, `remotes/git-pull`, `remotes/push-a-branch` | Fetch, pull modes, fast-forward-only checks, branch pushes, upstream setup and simulated push rejection are supported.                                                   | Remotes are lesson-provided and offline. `clone`, changing remotes, force-pushes, deleting remote branches and pushing tags are unsupported. |

## Prioritization

Interactive rebase and branch-only simulated remotes already have engine implementations and focused
tests, so the curriculum should teach those supported paths directly and keep their unsupported
edges explicit. `git show`, `git mv`, and the common local `git commit --amend` paths are now
available end-to-end without adding a shell, network access, or an external editor dependency.

Run the corresponding package tests and `pnpm validate:content` after changing this matrix or the
lessons it describes.
