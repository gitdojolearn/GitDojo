"use client";

import { type CompletionAttemptBinding, type CompletionKind } from "@gitdojo/shared-types";

/** Starts a server-bound attempt when signed in. Anonymous and unavailable sessions stay local. */
export async function startCompletionAttempt(
  kind: CompletionKind,
  contentId: string,
  fetcher: typeof fetch = fetch,
): Promise<CompletionAttemptBinding | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher("/api/attempts", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, contentId }),
      });
      if (
        response.status === 401 ||
        (!response.ok && response.status < 500 && response.status !== 429)
      )
        return null;
      if (response.ok) {
        const body = (await response.json()) as CompletionAttemptBinding;
        if (body.id && body.nonce && body.contentVersion) return body;
      }
    } catch {
      // A transient network failure gets another chance before the workspace starts.
    }
    if (attempt < 2 && typeof navigator !== "undefined" && navigator.onLine) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  return null;
}
