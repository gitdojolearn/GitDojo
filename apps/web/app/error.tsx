"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/site/page-states";
import { SiteHeader } from "@/components/site/site-header";

/** Any page that throws while rendering: the header stays, with a way to try again. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[gitdojo] page error", error);
  }, [error]);
  return (
    <>
      <SiteHeader />
      <main className="px-4 pb-16">
        <ErrorState details={errorDetails(error)} onRetry={retry} />
      </main>
    </>
  );
}

/** What is safe and useful to show: server errors only carry a digest to match the logs. */
function errorDetails(error: unknown): string | null {
  if (!(error instanceof Error)) return typeof error === "string" ? error : null;
  const digest = (error as Error & { digest?: string }).digest;
  return digest ? `${error.message}\nReference: ${digest}` : error.message;
}
