import { cn } from "@gitdojo/ui";
import { Cloud, FileCode2, GitCommitHorizontal, Layers } from "lucide-react";
import { type ReactNode } from "react";
import { AREAS, type Area, type AreaEffect } from "../services/catalog";

const ICONS: Record<Area, ReactNode> = {
  workingTree: <FileCode2 />,
  staging: <Layers />,
  repository: <GitCommitHorizontal />,
  remote: <Cloud />,
};

const EFFECT_LABEL: Record<AreaEffect | "none", string> = {
  always: "Changes",
  sometimes: "Sometimes",
  none: "Untouched",
};

/**
 * Git's four areas, left to right as changes travel, with the ones a command changes lit up.
 * Each box says it in words too, so the state never depends on color alone.
 */
export function AreasDiagram({
  areas,
  compact = false,
}: {
  areas: Partial<Record<Area, AreaEffect>>;
  compact?: boolean;
}) {
  return (
    <ol
      className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4")}
      data-testid="areas-diagram"
    >
      {AREAS.map((area) => {
        const effect = areas[area.id] ?? "none";
        return (
          <li
            key={area.id}
            data-area={area.id}
            data-effect={effect}
            className={cn(
              "rounded-lg border p-3 [&_svg]:size-4",
              effect === "always" && "border-accent-border bg-accent-soft",
              effect === "sometimes" && "border-dashed border-accent-border bg-surface",
              effect === "none" && "border-border-subtle bg-surface",
            )}
          >
            <span
              className={cn(
                "flex items-center gap-2 text-small font-medium",
                effect === "none" ? "text-fg-muted" : "text-fg",
              )}
            >
              <span className={effect === "none" ? "text-fg-muted" : "text-accent"}>
                {ICONS[area.id]}
              </span>
              {area.label}
            </span>
            {compact ? null : (
              <span className="mt-1 block text-caption text-fg-muted">{area.description}</span>
            )}
            <span
              className={cn(
                "mt-2 inline-block rounded-sm px-1.5 text-micro font-semibold tracking-wide uppercase",
                effect === "always" && "bg-accent-strong text-on-accent",
                effect === "sometimes" && "border border-accent-border text-fg",
                effect === "none" && "text-fg-muted",
              )}
            >
              {EFFECT_LABEL[effect]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** reset's --soft / --mixed / --hard (and anything like it) as a table of what each changes. */
export function ModesTable({
  modes,
}: {
  modes: readonly { form: string; summary: string; areas: readonly Area[] }[];
}) {
  const columns = AREAS.filter((area) => area.id !== "remote");
  return (
    // Focusable, so the table can be scrolled from the keyboard on narrow screens.
    <div
      tabIndex={0}
      role="region"
      aria-label="What each form changes"
      className="overflow-x-auto rounded-lg border border-border-subtle"
    >
      <table className="w-full min-w-[560px] text-left text-small" data-testid="modes-table">
        <thead className="bg-surface text-caption text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Form
            </th>
            {columns.map((area) => (
              <th key={area.id} scope="col" className="px-3 py-2 text-center font-medium">
                {area.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {modes.map((mode) => (
            <tr key={mode.form}>
              <th scope="row" className="px-3 py-2.5 align-top font-normal">
                <code className="font-mono text-caption text-fg">{mode.form}</code>
                <span className="mt-1 block text-caption text-fg-secondary">{mode.summary}</span>
              </th>
              {columns.map((area) => {
                const changes = mode.areas.includes(area.id);
                return (
                  <td key={area.id} className="px-3 py-2.5 text-center align-top">
                    <span
                      className={cn(
                        "inline-block rounded-sm px-1.5 text-micro font-semibold uppercase",
                        changes ? "bg-warning-soft text-warning" : "text-fg-muted",
                      )}
                    >
                      {changes ? "Changes" : "Kept"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
