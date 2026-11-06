"use client";

import { type PendingEditorState } from "@gitdojo/shared-types";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@gitdojo/ui";
import { FilePen, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { useGitEditorStore } from "../state/use-git-editor-store";

const COMMIT_MESSAGE_HELP =
  "Write the commit message: a short first line, then a blank line and any details. Lines starting with # are ignored, and an empty message is refused.";

/** What the learner is editing, how to fill it in, and what closing without saving does. */
function describe(editor: PendingEditorState): { help: string; label: string; abort: string } {
  if (editor.purpose === "todo") {
    return {
      help: "Change the word at the start of a line to pick, reword, edit, squash, fixup or drop, or add break, label, reset and merge lines. Move lines to reorder commits, or delete a line to drop its commit. Lines starting with # are ignored.",
      label: "Rebase todo list",
      abort: "Abort rebase",
    };
  }
  if (editor.operation === "tag") {
    return {
      help: "Write the tag's message, usually what this release contains. Lines starting with # are ignored, and an empty message is refused.",
      label: "Tag message",
      abort: "Cancel tag",
    };
  }
  return {
    help: COMMIT_MESSAGE_HELP,
    label: "Commit message",
    abort: editor.operation === "commit" ? "Cancel commit" : "Abort rebase",
  };
}

/**
 * The editor Git opens for `git rebase -i`, `git commit` (and `--amend`) and `git tag -a`, as a dialog.
 * The terminal command stays busy until the learner chooses: **Save and close** hands the text to
 * Git; the other button closes it without saving (`git rebase --abort`, or no commit or tag).
 * Escape and clicking outside do nothing, so an edited file is never thrown away by accident.
 */
export function GitEditorDialog() {
  const editor = useGitEditorStore((state) => state.editor);
  return (
    <Dialog open={editor !== null}>
      <DialogContent
        data-testid="git-editor"
        showClose={false}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
        className="flex max-h-[calc(100dvh-2rem)] max-w-[760px] flex-col gap-0 p-0"
      >
        {/* Keyed by content: every request opens with Git's text, including after a refusal. */}
        {editor ? <GitEditorBody key={`${editor.file}:${editor.content}`} editor={editor} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function GitEditorBody({ editor }: { editor: PendingEditorState }) {
  const answer = useGitEditorStore((state) => state.answer);
  const [draft, setDraft] = useState(editor.content);
  const textareaId = useId();
  const errorId = useId();
  const { help, label, abort } = describe(editor);
  const save = () => {
    answer({ action: "save", content: draft });
  };

  return (
    <>
      <header className="border-b border-border-subtle px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            <FilePen aria-hidden="true" /> Git is waiting
          </Badge>
          <DialogTitle className="font-mono text-body">{editor.file}</DialogTitle>
        </div>
        <DialogDescription className="mt-1.5">{help}</DialogDescription>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-5">
        {editor.error ? (
          <p
            id={errorId}
            role="alert"
            data-testid="git-editor-error"
            className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-small text-danger"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-pre-wrap">{editor.error}</span>
          </p>
        ) : null}
        <label htmlFor={textareaId} className="text-caption font-semibold text-fg-secondary">
          {label}
        </label>
        <textarea
          id={textareaId}
          data-testid="git-editor-text"
          value={draft}
          spellCheck={false}
          autoFocus
          aria-describedby={editor.error ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            // Ctrl/Cmd+Enter saves, like committing in many editors.
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              save();
            }
          }}
          rows={editor.purpose === "todo" ? 16 : 10}
          className="focus-visible:border-border-focus min-h-48 w-full flex-1 resize-y rounded-md border border-border-input bg-editor px-3 py-2.5 font-mono text-caption leading-5 whitespace-pre [tab-size:4] text-fg outline-none"
        />
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
        <p className="mr-auto text-caption text-fg-muted">
          <kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">Enter</kbd> saves
        </p>
        <Button
          variant="secondary"
          data-testid="git-editor-abort"
          onClick={() => {
            answer({ action: "abort" });
          }}
        >
          {abort}
        </Button>
        <Button data-testid="git-editor-save" onClick={save}>
          Save and close
        </Button>
      </footer>
    </>
  );
}
