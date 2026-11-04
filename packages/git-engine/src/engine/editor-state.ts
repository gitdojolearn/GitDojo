import { type GitCommandResult } from "@gitdojo/shared-types";
import { hasErrorCode } from "../filesystem/fs-errors";
import { ensureDirectory } from "../filesystem/fs-helpers";
import { type GitContext } from "./context";
import { gitError } from "./errors";
import { type GitPendingEditor } from "./git-engine";
import { type RebaseRecord } from "./merge-state";

/**
 * Real Git starts an editor and waits for it to exit. GitDojo's editor is part of the page, so
 * "waiting" is state: this record says which file Git opened and what happens once the learner
 * saves it. It survives between commands like the rest of `.git`.
 */
interface EditorRecordBase {
  purpose: "todo" | "message";
  /** `git-rebase-todo`, `COMMIT_EDITMSG` or `TAG_EDITMSG`, as Git names them. */
  file: string;
  content: string;
  error?: string;
}

/**
 * An interactive rebase is waiting.
 *
 * - `todo`: `git rebase -i` is waiting for the plan. Nothing has changed yet.
 * - `message`: waiting for a reworded or combined commit message. HEAD is detached at the commit
 *   whose message it will replace.
 *
 * Records written before commit and tag editors existed have no `kind`: they are rebases.
 */
export interface RebaseEditorRecord extends EditorRecordBase {
  kind?: "rebase";
  rebase: RebaseRecord;
  /** Todo: what was typed after `git rebase -i`, for the reflog (`rebase (start): checkout main`). */
  upstream?: string;
  /** Message: whether the message rewords one commit or combines a squash chain. */
  reason?: "reword" | "squash";
}

/** `git commit --amend` without `-m`: waiting for the amended commit's message. Nothing changed. */
export interface CommitEditorRecord extends EditorRecordBase {
  kind: "commit";
  purpose: "message";
  /** `--reset-author`: the amended commit is by the learner. */
  resetAuthor?: boolean;
}

/** `git tag -a <name>` without `-m`: waiting for the tag's message. Nothing changed. */
export interface TagEditorRecord extends EditorRecordBase {
  kind: "tag";
  purpose: "message";
  tag: { name: string; target: string };
}

export type EditorRecord = RebaseEditorRecord | CommitEditorRecord | TagEditorRecord;

export type EditorOperation = NonNullable<EditorRecord["kind"]>;

export function editorOperation(record: Pick<EditorRecord, "kind">): EditorOperation {
  return record.kind ?? "rebase";
}

export function isRebaseEditor(record: EditorRecord): record is RebaseEditorRecord {
  return editorOperation(record) === "rebase";
}

const STATE_FILE = "GITDOJO_EDITOR.json";

function statePath(ctx: GitContext): string {
  return `${ctx.dir}/.git/${STATE_FILE}`;
}

export async function readEditorRecord(ctx: GitContext): Promise<EditorRecord | null> {
  try {
    const raw = await ctx.fs.promises.readFile(statePath(ctx), { encoding: "utf8" });
    return JSON.parse(
      typeof raw === "string" ? raw : new TextDecoder().decode(raw),
    ) as EditorRecord;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

/** Saves the record, and the file Git would have opened, where Git keeps it. */
export async function writeEditorRecord(ctx: GitContext, record: EditorRecord): Promise<void> {
  await ctx.fs.promises.writeFile(statePath(ctx), JSON.stringify(record), "utf8");
  const dir = record.purpose === "todo" ? `${ctx.dir}/.git/rebase-merge` : `${ctx.dir}/.git`;
  await ensureDirectory(ctx.fs.promises, dir);
  await ctx.fs.promises.writeFile(`${dir}/${record.file}`, record.content, "utf8");
}

export async function clearEditorRecord(ctx: GitContext): Promise<void> {
  for (const path of [statePath(ctx), `${ctx.dir}/.git/rebase-merge/git-rebase-todo`]) {
    try {
      await ctx.fs.promises.unlink(path);
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    }
  }
}

export function toPendingEditor(record: EditorRecord): GitPendingEditor {
  return {
    file: record.file,
    purpose: record.purpose,
    operation: editorOperation(record),
    content: record.content,
    ...(record.error === undefined ? {} : { error: record.error }),
  };
}

export const WAITING_FOR_EDITOR = "hint: Waiting for your editor to close the file...";

/** How to get out of each editor without saving. */
const CANCEL_HINT: Record<EditorOperation, string> = {
  rebase: 'or run "git rebase --abort" to cancel',
  commit: "or close it without saving to cancel the commit",
  tag: "or close it without saving to cancel the tag",
};

/** The refusal for anything that would change the repository while Git waits for the editor. */
export function editorOpenMessage(record: Pick<EditorRecord, "file" | "kind">): string {
  return [
    `error: Git is waiting for you to close the editor (${record.file}).`,
    `hint: Save and close the editor to go on, ${CANCEL_HINT[editorOperation(record)]}.`,
  ].join("\n");
}

/** Keeps the editor open with the learner's text and says why it could not be closed. */
export async function refuseEditor(
  ctx: GitContext,
  record: EditorRecord,
  content: string,
  message: string,
): Promise<GitCommandResult<{ status: "editing" }>> {
  const hint = `hint: Fix it and save again, ${CANCEL_HINT[editorOperation(record)]}.`;
  await writeEditorRecord(ctx, { ...record, content, error: message });
  return {
    ok: false,
    output: `${message}\n${hint}`,
    data: { status: "editing" },
    error: gitError(
      record.purpose === "todo" ? "INVALID_TODO" : "INVALID_ARGUMENT",
      `${message}\n${hint}`,
    ),
  };
}

/** Comment lines out and surrounding blank lines trimmed, as Git cleans a commit message. */
export function cleanMessage(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
