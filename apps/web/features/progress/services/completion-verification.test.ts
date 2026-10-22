import { afterEach, describe, expect, it, vi } from "vitest";
import { startCompletionAttempt } from "./completion-verification";

describe("startCompletionAttempt", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retries temporary server failures and returns the server binding", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          id: "attempt-1",
          nonce: "nonce",
          contentVersion: "a".repeat(64),
          kind: "lesson",
          contentId: "git-init",
        }),
      );
    await expect(startCompletionAttempt("lesson", "git-init", fetcher)).resolves.toMatchObject({
      id: "attempt-1",
      contentId: "git-init",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry an unauthenticated request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(startCompletionAttempt("lesson", "git-init", fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
