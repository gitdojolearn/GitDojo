"use client";

import "./globals.css";

import { useEffect } from "react";
import { ErrorState } from "@/components/site/page-states";
import { THEME_SCRIPT } from "@/features/theme/services/theme-script";

/**
 * The root layout itself failed, so this replaces the whole document: it brings its own styles
 * and applies the learner's theme the same way the layout does.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[gitdojo] application error", error);
  }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <title>Something went wrong · GitDojo</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-app px-4 text-fg">
        <ErrorState
          title="GitDojo couldn't load."
          description="Something went wrong before the page could open. Your progress is safe in this browser."
          details={digest ? `Reference: ${digest}` : null}
          onRetry={retry}
        />
      </body>
    </html>
  );
}
