"use client";

import { type ExternalCommitDiff, type ExternalFileDiff } from "@gitdojo/git-engine";
import { Badge, cn } from "@gitdojo/ui";

const CHANGE_TONE = { added: "success", modified: "warning", deleted: "danger" } as const;
const LINE_STYLE = {
  add: "bg-success-soft text-fg",
  remove: "bg-danger-soft text-fg",
  context: "text-fg-secondary",
} as const;
const PREFIX = { add: "+", remove: "-", context: " " } as const;

function FileDiff({ file }: { file: ExternalFileDiff }) {
  return (
    <details open className="group rounded-md border border-border-subtle bg-panel">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-caption">
        <Badge tone={CHANGE_TONE[file.change]}>{file.change}</Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-fg">{file.path}</span>
        {file.skipped ? null : (
          <span className="shrink-0 font-mono">
            <span className="text-success">+{file.insertions}</span>{" "}
            <span className="text-danger">-{file.deletions}</span>
          </span>
        )}
      </summary>
      {file.skipped ? (
        <p className="border-t border-border-subtle px-3 py-2 text-caption text-fg-muted">
          {file.skipped === "binary"
            ? "Binary file: there are no lines to compare."
            : "Too large to show in the browser."}
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-border-subtle">
          <pre className="min-w-max py-1 font-mono text-caption leading-5">
            {file.hunks.map((hunk, index) => (
              <div key={index}>
                <div className="px-3 text-info">
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </div>
                {hunk.lines.map((line, lineIndex) => (
                  <div key={lineIndex} className={cn("px-3", LINE_STYLE[line.type])}>
                    {PREFIX[line.type]}
                    {line.text.replace(/\n$/, "")}
                  </div>
                ))}
              </div>
            ))}
          </pre>
        </div>
      )}
    </details>
  );
}

/** A commit's changes compared with its first parent, file by file. */
export function DiffView({ diff, merge }: { diff: ExternalCommitDiff; merge: boolean }) {
  if (diff.files.length === 0) {
    return <p className="text-caption text-fg-muted">No file changes compared with its parent.</p>;
  }
  return (
    <div className="space-y-2">
      {merge ? (
        <p className="text-caption text-fg-muted">
          Compared with the first parent: what the merge brought into the branch.
        </p>
      ) : null}
      {diff.files.map((file) => (
        <FileDiff key={file.path} file={file} />
      ))}
      {diff.truncated ? (
        <p className="text-caption text-fg-muted">
          Only the first {diff.files.length} files are shown.
        </p>
      ) : null}
    </div>
  );
}
