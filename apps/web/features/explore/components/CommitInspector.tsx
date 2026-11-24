"use client";

import { type CommitState, type RepositoryState } from "@gitdojo/shared-types";
import { IconButton } from "@gitdojo/ui";
import { Lightbulb, X } from "lucide-react";
import { useMemo } from "react";
import { renderInline } from "@/components/content/rich-text";
import { formatRelativeTime, formatTimestamp } from "@/lib/time";
import { useCommitDiff } from "../hooks/use-explore";
import { explainCommit } from "../services/explain-commit";
import { DiffView } from "./DiffView";

/** One commit up close: what it is in plain words, then exactly what it changed. */
export function CommitInspector({
  commit,
  state,
  truncated,
  onClose,
}: {
  commit: CommitState;
  state: RepositoryState;
  truncated: boolean;
  onClose: () => void;
}) {
  const explanation = useMemo(
    () => explainCommit(commit, state, truncated),
    [commit, state, truncated],
  );
  const diff = useCommitDiff(commit.oid);
  const [subject, ...body] = commit.message.split("\n");

  return (
    <article aria-label="Commit" data-testid="explore-commit" className="space-y-4">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-caption text-warning">{commit.shortOid}</p>
          <h3 className="mt-0.5 text-body font-semibold break-words text-fg">{subject}</h3>
          <p className="mt-1 text-caption text-fg-muted">
            {commit.authorName} ·{" "}
            <time
              dateTime={new Date(commit.timestamp * 1000).toISOString()}
              title={formatTimestamp(commit.timestamp)}
            >
              {formatRelativeTime(commit.timestamp)}
            </time>
          </p>
        </div>
        <IconButton aria-label="Close commit" onClick={onClose} className="-mt-1 -mr-2">
          <X />
        </IconButton>
      </header>

      {body.join("\n").trim() ? (
        <p className="text-small whitespace-pre-wrap text-fg-secondary">{body.join("\n").trim()}</p>
      ) : null}

      <section
        aria-label="What happened"
        className="rounded-md border border-accent-border bg-accent-soft p-3"
      >
        <p className="flex items-start gap-1.5 text-small font-semibold text-fg">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
          <span className="min-w-0 break-words">{renderInline(explanation.headline)}</span>
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-small text-fg-secondary marker:text-fg-faint">
          {explanation.notes.map((note) => (
            <li key={note}>{renderInline(note)}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Changes">
        <h4 className="mb-2 text-micro font-semibold tracking-wider text-fg-muted uppercase">
          Changes
        </h4>
        {diff === null || diff.status === "loading" ? (
          <p className="text-caption text-fg-muted">Reading the changes…</p>
        ) : diff.status === "error" ? (
          <p className="text-caption text-danger">
            GitDojo could not read the changes in this commit.
          </p>
        ) : (
          <DiffView diff={diff.diff} merge={commit.parents.length > 1} />
        )}
      </section>
    </article>
  );
}
