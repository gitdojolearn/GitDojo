import { type Metadata } from "next";
import { NotFoundState } from "@/components/site/page-states";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100dvh-3.5rem)] px-4 py-16 sm:px-6 sm:py-24">
        <NotFoundState />
      </main>
      <SiteFooter />
    </>
  );
}
