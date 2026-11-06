import Link from "next/link";
import { AREAS, CATEGORIES, commandHref } from "../services/catalog";
import { type CommandReference } from "../services/reference";

/** /commands: every command, by category, with what it changes at a glance. */
export function CommandIndex({ commands }: { commands: readonly CommandReference[] }) {
  return (
    <div data-testid="command-index">
      <h1 className="text-h2 font-semibold tracking-tight text-fg sm:text-h1">Git commands</h1>
      <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
        Every command the GitDojo terminal runs: what it does, which parts of the repository it
        changes, and the lessons that teach it.
      </p>
      {CATEGORIES.map((category) => {
        const inCategory = commands.filter((command) => command.info.category === category);
        return (
          <section key={category} aria-labelledby={`category-${category}`} className="mt-10">
            <h2 id={`category-${category}`} className="text-h4 font-semibold text-fg">
              {category}
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {inCategory.map((command) => {
                const changed = AREAS.filter((area) => command.info.areas[area.id]);
                return (
                  <li key={command.name}>
                    <Link
                      href={commandHref(command.name)}
                      className="block h-full rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-border-strong hover:bg-panel"
                    >
                      <code className="font-mono text-body font-semibold text-fg">
                        git {command.name}
                      </code>
                      <span className="mt-1 block text-small text-fg-secondary">
                        {command.summary}
                      </span>
                      <span className="mt-3 block text-caption text-fg-muted">
                        {changed.length === 0
                          ? "Read-only"
                          : `Changes: ${changed.map((area) => area.label.toLowerCase()).join(", ")}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
