# Repository explorer

`/explore` opens a Git repository from the learner's own computer and shows what really happened
in it: the branches and commits as a graph, a timeline of what was done (from the reflog), and each
commit explained in plain words with its diff.

## Reading a repository in place

The learner picks a folder: the project folder (with `.git` inside) or the `.git` folder itself.

| Browser         | How the folder is picked                | What is read                                       |
| --------------- | --------------------------------------- | -------------------------------------------------- |
| Chrome, Edge    | `showDirectoryPicker({ mode: "read" })` | only the files Git asks for, lazily                |
| Firefox, Safari | `<input type="file" webkitdirectory>`   | the browser lists every file; only `.git/` is kept |

Either way the web app hands the Git engine a `ReadOnlyTree` (`stat`, `list`, `read`), and
`ExternalRepository` reads it through `createReadOnlyGitFs`, the filesystem shape isomorphic-git
expects with every write failing (`EROFS`) and `..` refused. Nothing is copied into IndexedDB,
stored, or sent to a server, and closing the tab forgets the repository.

Linked worktrees and submodules (where `.git` is a file) are refused with an explanation.

## What is read

`ExternalRepository.readHistory` returns a `GitRepositorySnapshot` with history and refs only (no
working tree, stash or operation in progress), so `toRepositoryState` maps it like any workspace:

- HEAD, local branches, tags (annotated tags peeled to their commits) and remote-tracking
  branches, from loose refs and `packed-refs`;
- the newest 300 commits reachable from any of them, by committer date (`git log --all -n 300`),
  read from loose objects or packfiles through one shared isomorphic-git cache; `truncated` says
  older history exists. A shallow clone's missing parents end the walk quietly;
- each commit's changed paths, from a tree diff with its first parent that skips identical subtrees;
- HEAD's reflog (`logs/HEAD`), newest 500 entries.

`readCommitDiff` diffs one commit with its first parent when it is selected: at most 100 files,
skipping binary files (a NUL byte in the first 8000 bytes) and files over 256 KiB.

## The timeline

`buildTimeline` (`features/explore/services/timeline.ts`) turns each reflog line into a step with
plain words and the command that most likely wrote it, from a table of Git's reflog formats
(`commit (amend): …`, `checkout: moving from a to b`, `reset: moving to HEAD~1`,
`rebase -i (start): checkout main`, …). Unknown lines are shown as Git wrote them.

Steps that move HEAD off its commit (a reset, an amend, a rebase, leaving a detached HEAD) are
checked for work left behind: the commit HEAD left is not an ancestor of where it went. If a later
step reaches that commit again, both steps say so ("brought it back" / "Recovered"); if no branch,
tag or HEAD reaches it any more, the step says only the reflog remembers it. No claim is made when
HEAD moved to a commit outside the graph, or about missing commits when the history is truncated.

## Explaining a commit

`explainCommit` says what kind of commit it is (root, merge of which branch or pull request,
revert of which commit, an ordinary change), then notes: merge parents, cherry-pick origins,
`fixup!` commits, copies made by a rebase or cherry-pick (same author, author date and message),
how the reflog first recorded it, and which branches, tags or remote-tracking branches lead to it.

## Long histories in the graph

The explorer passes `scrollable` to the repository graph: it opens at the newest commits sized to
the panel, scrolls with the wheel, brings a commit selected from the timeline into view, and lays
lanes out with `compact`, reusing a lane once its line of work has joined another (as
`git log --graph` does), so a history of many merged branches stays narrow. Lessons keep the
default layout.
