import { type Metadata } from "next";
import Link from "next/link";
import { DOCS } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Docs",
  description: "How GitDojo works and how to contribute lessons, challenges and code.",
};

export default function DocsIndex() {
  const categories = [...new Set(DOCS.map((doc) => doc.category))];
  return (
    <main className="min-w-0" data-testid="docs-index">
      <h1 className="text-h2 font-semibold tracking-tight text-fg sm:text-h1">Documentation</h1>
      <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
        How GitDojo works, and how to write lessons, build features and run it yourself. These pages
        are the Markdown files in the repository, so they are always in step with the code.
      </p>
      {categories.map((category) => (
        <section key={category} aria-labelledby={`docs-${category}`} className="mt-10">
          <h2 id={`docs-${category}`} className="text-h4 font-semibold text-fg">
            {category}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {DOCS.filter((doc) => doc.category === category).map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={`/docs/${doc.slug}`}
                  className="block h-full rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-border-strong hover:bg-panel"
                >
                  <span className="block text-small font-medium text-fg">{doc.title}</span>
                  <span className="mt-1 block text-caption text-fg-muted">{doc.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
