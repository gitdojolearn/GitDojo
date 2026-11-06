import { type ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { DocsSidebar } from "@/features/docs/components/DocsSidebar";
import { DOCS } from "@/lib/docs";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-14">
        <aside>
          <DocsSidebar
            docs={DOCS.map(({ slug, title, category }) => ({ slug, title, category }))}
          />
        </aside>
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
