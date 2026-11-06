import { Button } from "@gitdojo/ui";
import { ArrowRight, BookOpen, Play } from "lucide-react";
import Link from "next/link";
import { renderInline } from "@/components/content/rich-text";
import { type CommandReference } from "../services/reference";
import { AreasDiagram, ModesTable } from "./AreasDiagram";

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-h4 font-semibold text-fg">
      {children}
    </h2>
  );
}

/** The command a "Try in Playground" link types at the prompt (not run). */
function tryCommand(command: CommandReference): string {
  return command.examples[0]?.command ?? `git ${command.name}`;
}

/** One command: what it does, what it changes, how it is written, and where it is taught. */
export function CommandDetail({ command }: { command: CommandReference }) {
  const { info } = command;
  return (
    <article aria-labelledby="command-title" data-testid="command-detail">
      <p className="text-small font-medium text-accent">{info.category}</p>
      <h1
        id="command-title"
        className="mt-1 font-mono text-h2 font-semibold tracking-tight text-fg sm:text-h1"
      >
        git {command.name}
      </h1>
      <p className="mt-3 text-body-lg text-fg-secondary">{command.summary}.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="primary">
          <Link
            href={`/playground?try=${encodeURIComponent(tryCommand(command))}`}
            data-testid="try-in-playground"
          >
            <Play /> Try in Playground
          </Link>
        </Button>
        {command.lessons[0] ? (
          <Button asChild variant="secondary">
            <Link href={command.lessons[0].href}>
              <BookOpen /> Learn it: {command.lessons[0].title}
            </Link>
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="usage-heading" className="mt-10">
        <SectionHeading id="usage-heading">Usage</SectionHeading>
        <pre
          tabIndex={0}
          className="mt-3 overflow-x-auto rounded-lg border border-border-subtle bg-terminal p-4 font-mono text-small text-fg-terminal"
        >
          <code>{command.usage}</code>
        </pre>
        {command.options.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Options">
            {command.options.map((option) => (
              <li key={option}>
                <code className="gd-code">{option}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="changes-heading" className="mt-10">
        <SectionHeading id="changes-heading">What it changes</SectionHeading>
        <div className="mt-3">
          <AreasDiagram areas={info.areas} />
        </div>
        {info.note ? (
          <p className="mt-3 text-small text-fg-secondary">{renderInline(info.note)}</p>
        ) : null}
        {info.modes ? (
          <div className="mt-4">
            <ModesTable modes={info.modes} />
          </div>
        ) : null}
      </section>

      {command.examples.length > 0 ? (
        <section aria-labelledby="examples-heading" className="mt-10">
          <SectionHeading id="examples-heading">Examples</SectionHeading>
          <ul className="mt-3 space-y-4">
            {command.examples.map((example, index) => (
              <li
                key={`${example.command}-${String(index)}`}
                className="overflow-hidden rounded-lg border border-border-subtle"
              >
                {example.title ? (
                  <p className="border-b border-border-subtle bg-surface px-4 py-2 text-small font-medium text-fg">
                    {example.title}
                  </p>
                ) : null}
                <pre
                  tabIndex={0}
                  className="overflow-x-auto bg-terminal p-4 font-mono text-caption text-fg-terminal"
                >
                  <code>
                    <span className="text-fg-muted select-none">$ </span>
                    {example.command}
                    {example.output ? `\n${example.output}` : ""}
                  </code>
                </pre>
                {example.explanation ? (
                  <p className="px-4 pt-3 text-small text-fg-secondary">
                    {renderInline(example.explanation)}
                  </p>
                ) : null}
                <p className="px-4 pt-2 pb-3 text-caption text-fg-muted">
                  From the lesson{" "}
                  <Link href={example.lesson.href} className="text-accent hover:underline">
                    {example.lesson.title}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {command.lessons.length > 0 ? (
        <section aria-labelledby="lessons-heading" className="mt-10">
          <SectionHeading id="lessons-heading">Lessons that teach it</SectionHeading>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {command.lessons.map((lesson) => (
              <li key={lesson.href}>
                <Link
                  href={lesson.href}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-panel"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-small font-medium text-fg">
                      {lesson.title}
                    </span>
                    <span className="block truncate text-caption text-fg-muted">
                      {lesson.course}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
