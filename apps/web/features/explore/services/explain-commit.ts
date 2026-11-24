import { type CommitState, type RepositoryState } from "@gitdojo/shared-types";
import { createAncestry, short, subjectOf } from "./ancestry";
import { describeReflogMessage } from "./timeline";

export interface CommitExplanation {
  /** One sentence: what kind of commit this is. */
  headline: string;
  /** Further facts, each a sentence with `code` for names. */
  notes: string[];
}

const MERGE_SUBJECTS: readonly [RegExp, (match: RegExpExecArray) => string][] = [
  [
    /^Merge pull request #(\d+) from ([^\s]+)/,
    ([, number = "", source = ""]) => `This merge joined pull request #${number} (\`${source}\`).`,
  ],
  [
    /^Merge (?:remote-tracking )?branch '([^']+)'(?: of [^\s]+)? into (.+)$/,
    ([, from = "", into = ""]) => `This merge joined \`${from}\` into \`${into}\`.`,
  ],
  [
    /^Merge (?:remote-tracking )?branch '([^']+)'/,
    ([, from = ""]) => `This merge joined \`${from}\` into the branch it was made on.`,
  ],
];

function list(names: readonly string[]): string {
  const coded = names.map((name) => `\`${name}\``);
  if (coded.length <= 1) return coded.join("");
  return `${coded.slice(0, -1).join(", ")} and ${coded.at(-1) ?? ""}`;
}

function headline(commit: CommitState, explicitRevert: RegExpExecArray | null): string {
  if (commit.parents.length > 1) {
    const subject = subjectOf(commit.message);
    for (const [pattern, describe] of MERGE_SUBJECTS) {
      const match = pattern.exec(subject);
      if (match) return describe(match);
    }
    return `A merge commit: it joins ${String(commit.parents.length)} lines of history.`;
  }
  if (explicitRevert) return `This commit undoes \`${short(explicitRevert[1] ?? "")}\`.`;
  if (commit.parents.length === 0)
    return "The first commit: this repository's history starts here.";
  const count = commit.changedPaths.length;
  return count === 0
    ? "A commit that changed no files."
    : `A commit that changed ${String(count)} file${count === 1 ? "" : "s"}.`;
}

/**
 * Explains one commit of an explored repository: what kind of commit it is, how it was made
 * (from the reflog), whether it is a copy, and where it lives now.
 */
export function explainCommit(
  commit: CommitState,
  state: RepositoryState,
  truncated: boolean,
): CommitExplanation {
  const ancestry = createAncestry(state.allCommits);
  const revert = /This reverts commit ([0-9a-f]{40})/.exec(commit.message);
  const notes: string[] = [];

  if (commit.parents.length > 1) {
    const [ours = "", ...theirs] = commit.parents;
    notes.push(
      `Its first parent \`${short(ours)}\` is the branch it was made on; ${list(theirs.map(short))} came in from the other side.`,
    );
  }
  if (revert) {
    notes.push(
      "`git revert` adds a new commit with the opposite changes, so history is added to instead of rewritten.",
    );
  }
  const picked = /\(cherry picked from commit ([0-9a-f]{40})\)/.exec(commit.message);
  if (picked) notes.push(`Copied from \`${short(picked[1] ?? "")}\` with \`git cherry-pick -x\`.`);
  if (/^(fixup|squash)! /.test(commit.message)) {
    notes.push(
      "Made with `git commit --fixup` (or `--squash`): `git rebase -i --autosquash` folds it into the commit it names.",
    );
  }

  // A rebase or cherry-pick copy keeps the author, the author date and the message.
  const twins = state.allCommits.filter(
    (other) =>
      other.oid !== commit.oid &&
      other.timestamp === commit.timestamp &&
      other.authorEmail === commit.authorEmail &&
      other.message === commit.message,
  );
  if (twins.length > 0) {
    notes.push(
      `${list(twins.map((twin) => short(twin.oid)))} has the same author, date and message: one is a copy of the other, made by a rebase or a cherry-pick. Copies get new hashes because their parents differ.`,
    );
  }

  // How HEAD first arrived at this commit, which is usually how it was made.
  const arrival = [...state.reflog].reverse().find((entry) => entry.oid === commit.oid);
  if (arrival) {
    const step = describeReflogMessage(arrival.message);
    const how = step.command ? ` (\`${step.command}\`)` : "";
    notes.push(`The reflog first records it at \`${arrival.selector}\`: ${step.title}${how}.`);
  }

  const missingParents = commit.parents.filter((parent) => !ancestry.commit(parent));
  if (truncated && missingParents.length > 0) {
    notes.push(
      `Its parent ${list(missingParents.map(short))} is older than the history the explorer read.`,
    );
  }

  const branches = state.branches
    .filter((branch) => branch.oid !== null && ancestry.contains(branch.oid, commit.oid))
    .map((branch) => branch.name);
  const tags = state.tags.filter((tag) => tag.oid === commit.oid).map((tag) => tag.name);
  if (commit.oid === state.head) {
    notes.push("`HEAD` is here: your files are checked out from this commit.");
  }
  if (tags.length > 0) notes.push(`Tagged ${list(tags)}.`);
  if (branches.length > 0) {
    notes.push(`Part of ${list(branches)}.`);
  } else {
    const remotes = state.remoteBranches
      .filter((ref) => ancestry.contains(ref.oid, commit.oid))
      .map((ref) => ref.name);
    const leading = state.tags
      .filter((tag) => ancestry.contains(tag.oid, commit.oid))
      .map((tag) => tag.name);
    const shown = leading.slice(0, 3);
    const more = leading.length - shown.length;
    notes.push(
      remotes.length > 0
        ? `On no local branch, only on ${list(remotes)}.`
        : leading.length > 0
          ? `On no branch: only ${leading.length === 1 ? "tag" : "tags"} ${list(shown)}${more > 0 ? ` (and ${String(more)} more)` : ""} lead${leading.length === 1 ? "s" : ""} to it.`
          : "On no branch: only `HEAD` leads to it, so switching away would leave it behind.",
    );
  }

  return { headline: headline(commit, revert), notes };
}
