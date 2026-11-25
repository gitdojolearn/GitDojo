"use client";

import { Badge, cn, IconButton } from "@gitdojo/ui";
import { Check, ChevronRight, Copy, Star, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderInline } from "@/components/content/rich-text";
import { type UndoOption, type UndoSuggestion } from "../services/undo";

/** A command with a copy button. If the clipboard is unavailable, the command is selected. */
function CommandRow({
  option,
  onAnnounce,
}: {
  option: UndoOption;
  onAnnounce: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(option.command);
      setCopied(true);
      onAnnounce("Copied");
    } catch {
      const node = text.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      onAnnounce("Couldn't copy the command. It is selected, so copy it yourself.");
    }
  };

  return (
    <li className="space-y-1" data-testid="undo-option">
      {option.recommended ? (
        <Badge tone="success">
          <Star aria-hidden="true" />
          Recommended
        </Badge>
      ) : null}
      <div className="flex items-center gap-1 rounded-sm border border-border-subtle bg-elevated pl-2">
        <code ref={text} className="min-w-0 flex-1 font-mono text-caption break-all text-fg">
          {option.command}
        </code>
        <IconButton
          aria-label="Copy command"
          title="Copy command"
          onClick={() => {
            void copy();
          }}
          className="size-7"
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </IconButton>
      </div>
      <p className="text-caption text-fg-secondary">{renderInline(option.explanation)}</p>
    </li>
  );
}

/**
 * "How to undo this": commands the learner can copy and run in their own terminal. GitDojo
 * suggests them and never runs them. Collapsed until asked for.
 */
export function UndoPanel({
  suggestion,
  onShowStep,
  className,
}: {
  suggestion: UndoSuggestion;
  /** Shows a timeline step, for "Already recovered by `HEAD@{k}`". */
  onShowStep?: (selector: string) => void;
  className?: string;
}) {
  const [announcement, setAnnouncement] = useState("");
  const { recoveredBy } = suggestion;

  return (
    <details
      className={cn("group rounded-md border border-border-subtle bg-panel", className)}
      data-testid="undo-panel"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1 text-caption font-medium text-fg-secondary hover:text-fg [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
        />
        How to undo this
      </summary>
      <div className="space-y-2 px-2 pt-1 pb-2">
        {suggestion.warning ? (
          <p className="flex gap-1.5 rounded-sm bg-warning-soft px-2 py-1 text-caption text-fg">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>{renderInline(suggestion.warning)}</span>
          </p>
        ) : null}
        {recoveredBy ? (
          <p className="text-caption text-fg">
            Already recovered by{" "}
            {onShowStep ? (
              <button
                type="button"
                onClick={() => {
                  onShowStep(recoveredBy);
                }}
                className="font-mono text-accent underline underline-offset-2 hover:text-fg"
              >
                {recoveredBy}
              </button>
            ) : (
              <code className="gd-code">{recoveredBy}</code>
            )}
            . Nothing to do.
          </p>
        ) : null}
        {suggestion.options.length > 0 ? (
          <ul className="space-y-2">
            {suggestion.options.map((option) => (
              <CommandRow key={option.command} option={option} onAnnounce={setAnnouncement} />
            ))}
          </ul>
        ) : null}
        {suggestion.notes.map((note) => (
          <p key={note} className="text-caption text-fg-secondary">
            {renderInline(note)}
          </p>
        ))}
        <p className="text-caption text-fg-muted">
          These suggestions reflect the repository as it was when you opened it. If you have run git
          commands since, open the folder again. GitDojo never runs them for you.
        </p>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </details>
  );
}
