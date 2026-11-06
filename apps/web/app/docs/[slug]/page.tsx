import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { DocsToc } from "@/features/docs/components/DocsToc";
import { DOCS, loadDoc } from "@/lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = DOCS.find((entry) => entry.slug === slug);
  return doc ? { title: doc.title, description: doc.description } : { title: "Docs" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const loading = loadDoc((await params).slug);
  if (!loading) notFound();
  const doc = await loading;
  return (
    <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_200px]">
      <main className="min-w-0">
        <p className="text-small font-medium text-accent">{doc.category}</p>
        {/* The file's own H1 is the page title; a doc without one gets the entry's. */}
        {doc.heading ? null : (
          <h1 className="mt-1 text-h2 font-semibold tracking-tight text-fg sm:text-h1">
            {doc.title}
          </h1>
        )}
        <div
          className="gd-prose mt-1"
          data-testid="doc-content"
          // Our own Markdown, rendered at build time from files in this repository.
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
        <p className="mt-12 border-t border-border-subtle pt-6 text-small text-fg-muted">
          <a
            href={doc.sourceUrl}
            className="inline-flex items-center gap-1.5 hover:text-fg"
            rel="noreferrer"
          >
            Edit this page on GitHub <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </p>
      </main>
      <aside className="max-xl:hidden">
        <DocsToc headings={doc.headings} />
      </aside>
    </div>
  );
}
