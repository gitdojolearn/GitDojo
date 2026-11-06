/**
 * What the command reference adds to the parser's specs (`GIT_COMMAND_SPECS`): where each
 * command belongs, and which of Git's areas it changes. Examples and related lessons are not
 * authored here: they come from the lessons themselves (see reference.ts).
 */

/** The places a command can change, as the workspace panels show them. */
export type Area = "workingTree" | "staging" | "repository" | "remote";

export const AREAS: readonly { id: Area; label: string; description: string }[] = [
  { id: "workingTree", label: "Working tree", description: "The files you edit" },
  { id: "staging", label: "Staging area", description: "What the next commit will contain" },
  { id: "repository", label: "Repository", description: "Commits, branches, tags and HEAD" },
  { id: "remote", label: "Remote", description: "The server you share with others" },
];

/** `always`: every use changes it. `sometimes`: only some forms do (the note says which). */
export type AreaEffect = "always" | "sometimes";

export interface CommandMode {
  /** How it is written, e.g. `git reset --soft`. */
  form: string;
  summary: string;
  areas: readonly Area[];
}

export interface CommandInfo {
  category: CommandCategory;
  areas: Partial<Record<Area, AreaEffect>>;
  /** Anything the areas alone do not say. */
  note?: string;
  /** Forms that change different areas, shown as a table (reset's --soft, --mixed, --hard). */
  modes?: readonly CommandMode[];
}

export const CATEGORIES = ["Setup", "Changes", "Branches", "History", "Undo", "Remotes"] as const;
export type CommandCategory = (typeof CATEGORIES)[number];

const READ_ONLY = "Only reads: it never changes your files, staging area or history.";

export const COMMAND_INFO: Readonly<Record<string, CommandInfo>> = {
  init: {
    category: "Setup",
    areas: { repository: "always" },
    note: "Creates an empty repository (the .git folder); your files are not touched.",
  },
  clone: {
    category: "Setup",
    areas: { workingTree: "always", staging: "always", repository: "always" },
    note: "Copies every commit, branch and tag, then checks out the default branch.",
  },
  config: {
    category: "Setup",
    areas: {},
    note: "Changes settings such as your name and email, not files or history.",
  },
  status: { category: "Changes", areas: {}, note: READ_ONLY },
  add: { category: "Changes", areas: { staging: "always" } },
  commit: {
    category: "Changes",
    areas: { repository: "always" },
    note: "Records what is staged as a new commit and moves the current branch to it.",
  },
  diff: { category: "Changes", areas: {}, note: READ_ONLY },
  restore: {
    category: "Changes",
    areas: { workingTree: "sometimes", staging: "sometimes" },
    note: "Without --staged it discards changes in the working tree; with --staged it unstages them.",
  },
  rm: {
    category: "Changes",
    areas: { workingTree: "sometimes", staging: "always" },
    note: "--cached keeps the file on disk and only stops tracking it.",
  },
  mv: { category: "Changes", areas: { workingTree: "always", staging: "always" } },
  branch: {
    category: "Branches",
    areas: { repository: "sometimes" },
    note: "Listing only reads; creating or deleting a branch changes the repository.",
  },
  switch: {
    category: "Branches",
    areas: { workingTree: "always", staging: "always", repository: "always" },
    note: "Moves HEAD, and swaps your files for the other branch's. Uncommitted changes come along when they can.",
  },
  checkout: {
    category: "Branches",
    areas: { workingTree: "always", staging: "always", repository: "always" },
    note: "The older way to switch branches; git switch and git restore split its jobs.",
  },
  merge: {
    category: "Branches",
    areas: { workingTree: "always", staging: "always", repository: "always" },
  },
  rebase: {
    category: "Branches",
    areas: { workingTree: "always", staging: "always", repository: "always" },
    note: "Rewrites history: the replayed commits are new commits with new ids.",
  },
  "cherry-pick": {
    category: "Branches",
    areas: { workingTree: "always", staging: "always", repository: "always" },
  },
  log: { category: "History", areas: {}, note: READ_ONLY },
  show: { category: "History", areas: {}, note: READ_ONLY },
  reflog: { category: "History", areas: {}, note: READ_ONLY },
  tag: {
    category: "History",
    areas: { repository: "sometimes" },
    note: "Listing only reads; creating or deleting a tag changes the repository.",
  },
  reset: {
    category: "Undo",
    areas: { repository: "always", staging: "sometimes", workingTree: "sometimes" },
    modes: [
      {
        form: "git reset --soft <commit>",
        summary: "Moves the branch. Undone commits' changes stay staged.",
        areas: ["repository"],
      },
      {
        form: "git reset <commit>",
        summary: "--mixed, the default: moves the branch and unstages, keeping your files.",
        areas: ["repository", "staging"],
      },
      {
        form: "git reset --hard <commit>",
        summary: "Moves the branch and makes staging and files match it. Uncommitted work is lost.",
        areas: ["repository", "staging", "workingTree"],
      },
    ],
  },
  revert: {
    category: "Undo",
    areas: { workingTree: "always", staging: "always", repository: "always" },
    note: "Adds a new commit that undoes an old one, so shared history is never rewritten.",
  },
  stash: {
    category: "Undo",
    areas: { workingTree: "always", staging: "always" },
    note: "Shelves uncommitted changes on a stack outside your branches, and brings them back later.",
  },
  remote: {
    category: "Remotes",
    areas: {},
    note: "Changes which servers this repository knows about, not files or history.",
  },
  fetch: {
    category: "Remotes",
    areas: { repository: "always" },
    note: "Downloads new commits into remote-tracking branches (origin/main); your own branches stay put.",
  },
  pull: {
    category: "Remotes",
    areas: { workingTree: "always", staging: "always", repository: "always" },
    note: "A fetch followed by a merge (or a rebase) into your current branch.",
  },
  push: { category: "Remotes", areas: { remote: "always" } },
};

export function commandHref(name: string): string {
  return `/commands/${name}`;
}
