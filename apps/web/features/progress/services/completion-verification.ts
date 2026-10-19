"use client";

import { type CompletionAttemptBinding, type CompletionKind } from "@gitdojo/shared-types";

/** Starts a server-bound attempt when signed in. Anonymous and unavailable sessions stay local. */
export async function startCompletionAttempt(
  kind: CompletionKind,
  contentId: string,
  fetcher: typeof fetch = fetch,
): Promise<CompletionAttemptBinding | null> {
  try {
    const response = await fetcher("/api/attempts", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, contentId }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as CompletionAttemptBinding;
    return body.id && body.nonce && body.contentVersion ? body : null;
  } catch {
    return null;
  }
}
