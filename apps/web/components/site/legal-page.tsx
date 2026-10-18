import { type ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** A plain, readable document page: the privacy notice and the terms. */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  /** ISO date the text last changed. */
  updated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  const date = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${updated}T00:00:00Z`),
  );
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-h2 font-bold tracking-tight text-fg sm:text-h1">{title}</h1>
        <p className="mt-2 text-small text-fg-muted">
          Last updated <time dateTime={updated}>{date}</time>
        </p>
        <div className="mt-6 text-body-lg text-fg-secondary">{intro}</div>
        <div className="legal mt-10 space-y-10 text-body text-fg-secondary [&_a]:text-accent [&_a]:underline [&_h2]:text-h4 [&_h2]:font-semibold [&_h2]:text-fg [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
