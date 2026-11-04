import { type GitContext } from "../engine/context";
import {
  cleanMessage,
  clearEditorRecord,
  editorOperation,
  isRebaseEditor,
  readEditorRecord,
  refuseEditor,
  type EditorRecord,
} from "../engine/editor-state";
import { failure, gitError, notARepository } from "../engine/errors";
import { type GitEditorResult } from "../engine/git-engine";
import { isRepository } from "../engine/repository";
import { runCommit } from "./commit";
import { closeRebaseEditor, runRebaseControl } from "./rebase";
import { runCreateTag } from "./tag";

const NOT_WAITING = "error: Git is not waiting for an editor.";

/** What Git prints when the learner closes the editor with nothing to keep. */
const EMPTY_MESSAGE: Record<"commit" | "tag", string> = {
  commit: "Aborting commit due to empty commit message.",
  tag: "fatal: no tag message?",
};

async function openRecord(
  ctx: GitContext,
): Promise<{ ok: true; record: EditorRecord } | { ok: false; result: GitEditorResult }> {
  if (!(await isRepository(ctx))) return { ok: false, result: notARepository() };
  const record = await readEditorRecord(ctx);
  if (record === null) {
    return { ok: false, result: failure(gitError("NO_OPERATION", NOT_WAITING)) };
  }
  return { ok: true, record };
}

/** The learner saved and closed the file Git was waiting for. */
export async function runCloseEditor(ctx: GitContext, content: string): Promise<GitEditorResult> {
  const opened = await openRecord(ctx);
  if (!opened.ok) return opened.result;
  const { record } = opened;
  if (isRebaseEditor(record)) return closeRebaseEditor(ctx, record, content);

  const message = cleanMessage(content);
  // An empty message keeps the editor open with the reason, as GitDojo does for rebases.
  if (message === "") return refuseEditor(ctx, record, content, EMPTY_MESSAGE[record.kind]);
  await clearEditorRecord(ctx);

  if (record.kind === "commit") {
    const result = await runCommit(ctx, {
      message,
      amend: true,
      ...(record.resetAuthor ? { resetAuthor: true } : {}),
    });
    return result.ok
      ? {
          ...result,
          data: { status: "committed", ...(result.data ? { oid: result.data.oid } : {}) },
        }
      : { ok: false, output: result.output, ...(result.error ? { error: result.error } : {}) };
  }
  const result = await runCreateTag(ctx, record.tag.name, {
    target: record.tag.target,
    message,
    annotated: true,
  });
  return result.ok
    ? { ...result, data: { status: "tagged", oid: record.tag.target } }
    : { ok: false, output: result.output, ...(result.error ? { error: result.error } : {}) };
}

/**
 * The learner closed the editor without saving. An interactive rebase is aborted, exactly like
 * `git rebase --abort`; an amend or annotated tag is simply not made, as when Git gets an empty
 * message.
 */
export async function runAbortEditor(ctx: GitContext): Promise<GitEditorResult> {
  const opened = await openRecord(ctx);
  if (!opened.ok) return opened.result;
  const { record } = opened;
  const operation = editorOperation(record);
  if (operation === "rebase") return runRebaseControl(ctx, "abort");
  await clearEditorRecord(ctx);
  const message = EMPTY_MESSAGE[operation];
  return {
    ok: false,
    output: message,
    data: { status: "aborted" },
    error: gitError("INVALID_ARGUMENT", message),
  };
}
