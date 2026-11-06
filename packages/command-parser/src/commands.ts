import { type GitCommandSpec } from "./types";

/** Git commands GitDojo can execute. Adding a command starts here. */
export const GIT_COMMAND_SPECS = {
  init: {
    name: "init",
    summary: "Create an empty Git repository",
    usage: "git init",
    flags: [],
    acceptsArguments: false,
  },
  status: {
    name: "status",
    summary: "Show the working tree status",
    usage: "git status",
    flags: [],
    acceptsArguments: false,
  },
  add: {
    name: "add",
    summary: "Stage file contents (use . for everything)",
    usage: "git add <path>...",
    flags: [],
    acceptsArguments: true,
  },
  commit: {
    name: "commit",
    summary: "Record staged changes (-a: all tracked changes; --amend: replace the latest commit)",
    usage: 'git commit [-a] [-m "<message>"] [--amend [--no-edit] [--reset-author]]',
    // Without `-m`, the engine opens the editor (or uses a merge's prepared message).
    flags: [
      { name: "m", aliases: ["message"], takesValue: true, repeatSeparator: "\n\n" },
      { name: "a", aliases: ["all"], takesValue: false },
      { name: "amend", takesValue: false },
      { name: "no-edit", takesValue: false },
      { name: "reset-author", takesValue: false },
    ],
    acceptsArguments: false,
  },
  log: {
    name: "log",
    summary: "Show commit history (of HEAD, a branch, or --all; --graph draws branches)",
    usage:
      "git log [--oneline] [--graph] [--all] [-n <number> | -<number>] [--stat | -p] [<branch>]",
    flags: [
      { name: "oneline", takesValue: false },
      { name: "all", takesValue: false },
      { name: "graph", takesValue: false },
      { name: "n", aliases: ["max-count"], takesValue: true },
      { name: "stat", takesValue: false },
      { name: "p", aliases: ["patch", "u"], takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
    countFlag: "n",
  },
  show: {
    name: "show",
    summary: "Show a commit and its changes, or a file at a revision",
    usage: "git show [<commit> | <commit>:<path>]",
    flags: [],
    acceptsArguments: true,
    maxArguments: 1,
  },
  mv: {
    name: "mv",
    summary: "Move or rename tracked files and directories, staging the rename",
    usage: "git mv [-f] <source>... <destination>",
    flags: [{ name: "f", aliases: ["force"], takesValue: false }],
    acceptsArguments: true,
  },
  branch: {
    name: "branch",
    summary: "List (-r remote, -a all, -v details), create, rename (-m) or delete branches",
    usage: "git branch [-r | -a] [-v] [-d | -D] [-m | -M] [<name> [<start-point> | <new-name>]]",
    flags: [
      { name: "d", aliases: ["delete"], takesValue: false },
      { name: "D", takesValue: false },
      { name: "m", aliases: ["move"], takesValue: false },
      { name: "M", takesValue: false },
      { name: "r", aliases: ["remotes"], takesValue: false },
      { name: "a", aliases: ["all"], takesValue: false },
      // `-vv` is two of these; GitDojo shows the upstream for either.
      { name: "v", aliases: ["verbose"], takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 2,
  },
  switch: {
    name: "switch",
    summary: "Switch branches (-c creates one, --detach visits a commit)",
    usage: "git switch [-c <new-branch>] [--detach] <branch | start-point>",
    flags: [
      { name: "c", aliases: ["create"], takesValue: true },
      { name: "detach", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  checkout: {
    name: "checkout",
    summary:
      "Older way to switch branches, visit a commit or restore files (prefer switch/restore)",
    usage:
      "git checkout [-b <new-branch>] <branch | commit> | git checkout [<commit>] -- <path>...",
    flags: [{ name: "b", takesValue: true }],
    acceptsArguments: true,
  },
  merge: {
    name: "merge",
    summary: "Join another branch into the current one",
    usage: "git merge [--no-ff | --ff-only] <branch>",
    flags: [
      { name: "no-ff", takesValue: false },
      { name: "ff-only", takesValue: false },
      { name: "abort", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  diff: {
    name: "diff",
    summary: "Show unstaged changes (--staged: staged ones), or compare commits",
    usage: "git diff [--staged] [<commit> [<commit>] | <commit>..<commit>] [--] [<path>...]",
    flags: [{ name: "staged", aliases: ["cached"], takesValue: false }],
    acceptsArguments: true,
  },
  restore: {
    name: "restore",
    summary: "Discard changes to files, or unstage them (--staged)",
    usage: "git restore [--staged] [--worktree] [--source <commit>] <path>...",
    flags: [
      { name: "staged", aliases: ["S"], takesValue: false },
      { name: "worktree", aliases: ["W"], takesValue: false },
      { name: "source", aliases: ["s"], takesValue: true },
    ],
    acceptsArguments: true,
  },
  rm: {
    name: "rm",
    summary: "Delete tracked files (--cached: just stop tracking)",
    usage: "git rm [--cached] [-r] [-f] <path>...",
    flags: [
      { name: "cached", takesValue: false },
      { name: "r", takesValue: false },
      { name: "f", aliases: ["force"], takesValue: false },
    ],
    acceptsArguments: true,
  },
  reset: {
    name: "reset",
    summary: "Move the branch back (--soft, --mixed, --hard), or unstage files",
    usage: "git reset [--soft | --mixed | --hard] [<commit>] [-- <path>...]",
    flags: [
      { name: "soft", takesValue: false },
      { name: "mixed", takesValue: false },
      { name: "hard", takesValue: false },
    ],
    acceptsArguments: true,
  },
  revert: {
    name: "revert",
    summary: "Undo a commit with a new commit",
    usage: "git revert <commit>",
    flags: [
      { name: "continue", takesValue: false },
      { name: "abort", takesValue: false },
      { name: "skip", takesValue: false },
      // Accepted for compatibility with tutorials; GitDojo never opens an editor anyway.
      { name: "no-edit", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  stash: {
    name: "stash",
    summary: "Shelve uncommitted work (list, apply, pop, drop, show)",
    usage: "git stash [push [-m <message>] [-u] | list | apply | pop | drop | show] [stash@{n}]",
    flags: [
      { name: "m", aliases: ["message"], takesValue: true },
      { name: "u", aliases: ["include-untracked"], takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 2,
  },
  "cherry-pick": {
    name: "cherry-pick",
    summary: "Copy a commit onto the current branch",
    usage: "git cherry-pick <commit>",
    flags: [
      { name: "continue", takesValue: false },
      { name: "abort", takesValue: false },
      { name: "skip", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  reflog: {
    name: "reflog",
    summary: "Show where HEAD has been (find lost commits)",
    usage: "git reflog [show] [<branch>]",
    flags: [],
    acceptsArguments: true,
    maxArguments: 2,
  },
  rebase: {
    name: "rebase",
    summary: "Replay your branch's commits on top of another (-i: edit them first)",
    usage: "git rebase [-i] <upstream>",
    flags: [
      { name: "continue", takesValue: false },
      { name: "abort", takesValue: false },
      { name: "skip", takesValue: false },
      { name: "i", aliases: ["interactive"], takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 1,
  },
  tag: {
    name: "tag",
    summary: "List, create (-a -m: annotated) or delete (-d) tags",
    usage: 'git tag [-l [<pattern>] | -n] | [-a -m "<message>"] <name> [<commit>] | -d <name>',
    flags: [
      { name: "l", aliases: ["list"], takesValue: false },
      { name: "n", takesValue: false },
      { name: "a", aliases: ["annotate"], takesValue: false },
      { name: "m", aliases: ["message"], takesValue: true, repeatSeparator: "\n\n" },
      { name: "d", aliases: ["delete"], takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 2,
  },
  config: {
    name: "config",
    summary: "Read or set options such as user.name (--global: for every repository)",
    usage: "git config [--global] [--get | --unset | --list] <name> [<value>]",
    flags: [
      { name: "global", takesValue: false },
      { name: "local", takesValue: false },
      { name: "list", aliases: ["l"], takesValue: false },
      { name: "get", takesValue: false },
      { name: "unset", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 2,
  },
  remote: {
    name: "remote",
    summary: "List (-v: with URLs), add, remove, rename or re-point remotes",
    usage:
      "git remote [-v] | add <name> <url> | remove <name> | rename <old> <new> | set-url <name> <url>",
    flags: [{ name: "v", aliases: ["verbose"], takesValue: false }],
    acceptsArguments: true,
    maxArguments: 3,
  },
  clone: {
    name: "clone",
    summary: "Copy a (simulated) repository into this empty workspace",
    usage: "git clone <url> [.]",
    flags: [],
    acceptsArguments: true,
    maxArguments: 2,
  },
  fetch: {
    name: "fetch",
    summary: "Download a remote's new commits into origin/* (simulated remote)",
    usage: "git fetch [<remote>]",
    flags: [],
    acceptsArguments: true,
    maxArguments: 1,
  },
  pull: {
    name: "pull",
    summary: "Fetch, then integrate the upstream (--rebase, --no-rebase, --ff-only)",
    usage: "git pull [--rebase | --no-rebase | --ff-only] [<remote> [<branch>]]",
    flags: [
      { name: "rebase", aliases: ["r"], takesValue: false },
      { name: "no-rebase", takesValue: false },
      { name: "ff-only", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 2,
  },
  push: {
    name: "push",
    summary: "Publish a branch (-u: remember it as upstream; --tags: tags) to a remote",
    usage:
      "git push [-u] [--force-with-lease | --force] [--delete] [--tags] [<remote> [<branch | tag>]]",
    flags: [
      { name: "u", aliases: ["set-upstream"], takesValue: false },
      { name: "f", aliases: ["force"], takesValue: false },
      { name: "force-with-lease", takesValue: false },
      { name: "d", aliases: ["delete"], takesValue: false },
      { name: "tags", takesValue: false },
    ],
    acceptsArguments: true,
    maxArguments: 2,
  },
} as const satisfies Record<string, GitCommandSpec>;

export type SupportedGitCommand = keyof typeof GIT_COMMAND_SPECS;

export function isSupportedGitCommand(command: string): command is SupportedGitCommand {
  return Object.hasOwn(GIT_COMMAND_SPECS, command);
}

/** Real Git commands that later GitDojo phases will support; they get a friendlier message. */
export const PLANNED_GIT_COMMANDS: ReadonlySet<string> = new Set<string>();

/** Terminal built-ins. They are parsed like any other input and never reach an OS shell. */
export const BUILTIN_PROGRAMS = {
  clear: "Clear the terminal",
  help: "Show available commands",
} as const;

export type BuiltinProgram = keyof typeof BUILTIN_PROGRAMS;

export function isBuiltinProgram(program: string): program is BuiltinProgram {
  return Object.hasOwn(BUILTIN_PROGRAMS, program);
}
