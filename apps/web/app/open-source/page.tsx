import { Button } from "@gitdojo/ui";
import { ArrowDown, BookOpen, Bug, FileText, Hammer, Swords, type LucideIcon } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { GitHubIcon } from "@/components/site/github-icon";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Open source",
  description: `${SITE.name} is MIT-licensed and built in the open. Write lessons, build features, fix bugs or improve the docs.`,
};

const PATHS: readonly {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
}[] = [
  {
    icon: BookOpen,
    title: "Write lessons",
    body: "Lessons are YAML files: a starting repository, objectives, hints and reference content. No React needed.",
    href: "/docs/lesson-authoring",
    cta: "Lesson authoring guide",
  },
  {
    icon: Swords,
    title: "Create challenges",
    body: "Set up a tricky repository and a goal, and let learners work out the commands themselves.",
    href: "/docs/challenge-authoring",
    cta: "Challenge authoring guide",
  },
  {
    icon: Hammer,
    title: "Build features",
    body: "A TypeScript monorepo: a Next.js app over small packages for parsing, the Git engine and validation.",
    href: "/docs/architecture",
    cta: "Read the architecture",
  },
  {
    icon: Bug,
    title: "Fix bugs",
    body: "Found Git behaving differently from the real thing, or a lesson that gets stuck? Issues are the place.",
    href: `${SITE.githubUrl}/issues`,
    cta: "Browse issues",
  },
  {
    icon: FileText,
    title: "Improve docs",
    body: "Every page under Docs is a Markdown file in the repository. Clearer is always welcome.",
    href: "/docs",
    cta: "Open the docs",
  },
];

/** The learner's command, top to bottom, as in docs/architecture.md. */
const PIPELINE: readonly [string, string, string][] = [
  ["Terminal", "apps/web", "xterm.js: what you type"],
  ["Command parser", "packages/command-parser", "Text → a Git command, or a friendly error"],
  ["Git engine", "packages/git-engine", "isomorphic-git on a virtual filesystem in IndexedDB"],
  ["Repository state", "packages/repository-state", "A snapshot of branches, commits and files"],
  ["Validator", "packages/validator", "Checks each lesson objective against the state"],
  ["UI", "apps/web", "Graph, file panels, hints and progress"],
];

export default function OpenSourcePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-14 sm:px-6 sm:py-20">
        <section className="max-w-2xl">
          <p className="text-small font-medium text-accent">Open source · MIT license</p>
          <h1 className="mt-3 text-h1 font-bold tracking-tight text-fg sm:text-[52px] sm:leading-[60px]">
            Built in the open.
          </h1>
          <p className="mt-4 text-body-lg text-fg-secondary">
            Every lesson, every line of the Git engine and every design decision is public. GitDojo
            gets better when people who just learned something help the next person learn it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="lg">
              <a href={SITE.githubUrl} rel="noreferrer">
                <GitHubIcon /> View on GitHub
              </a>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/docs/contributing">Read the contributing guide</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="paths-heading" className="mt-20">
          <h2 id="paths-heading" className="text-h3 font-semibold text-fg">
            Ways to contribute
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PATHS.map(({ icon: Icon, title, body, href, cta }) => (
              <li
                key={title}
                className="flex flex-col rounded-xl border border-border-subtle bg-surface p-5"
              >
                <Icon className="size-5 text-accent" aria-hidden="true" />
                <h3 className="mt-3 text-body font-semibold text-fg">{title}</h3>
                <p className="mt-1 flex-1 text-small text-fg-secondary">{body}</p>
                <Link
                  href={href}
                  className="mt-4 text-small font-medium text-accent hover:underline"
                >
                  {cta} →
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="architecture-heading" className="mt-20">
          <h2 id="architecture-heading" className="text-h3 font-semibold text-fg">
            How a command runs
          </h2>
          <p className="mt-2 max-w-2xl text-body text-fg-secondary">
            Everything happens in your browser: there is no server-side shell. Each step is its own
            package, so you can work on one without learning the rest.
          </p>
          <ol className="mt-8 max-w-xl" data-testid="architecture-diagram">
            {PIPELINE.map(([name, where, what], index) => (
              <li key={name}>
                <div className="flex items-start gap-4 rounded-xl border border-border-subtle bg-surface px-5 py-4">
                  <span className="mt-0.5 font-mono text-caption text-fg-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-fg">{name}</p>
                    <p className="text-caption text-fg-secondary">{what}</p>
                    <code className="mt-1 block font-mono text-micro text-fg-muted">{where}</code>
                  </div>
                </div>
                {index < PIPELINE.length - 1 ? (
                  <ArrowDown className="mx-auto my-1.5 size-4 text-fg-faint" aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ol>
          <Link
            href="/docs/architecture"
            className="mt-6 inline-block text-small font-medium text-accent hover:underline"
          >
            The full architecture →
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
