// @vitest-environment node
import "fake-indexeddb/auto";
import { type CompletionEvidence } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import {
  deletePendingCompletionEvidence,
  readPendingCompletionEvidence,
  savePendingCompletionEvidence,
} from "./completion-evidence-outbox";

const evidence = {
  format: "gitdojo-completion-evidence" as const,
  version: 1 as const,
  attemptId: "attempt-1",
  contentVersion: "a".repeat(64),
  binding: {
    id: "attempt-1",
    nonce: "nonce",
    kind: "lesson" as const,
    contentId: "git-init",
    contentVersion: "a".repeat(64),
  },
  state: { initialized: true },
  index: [],
  workingTree: [],
  objects: [],
} as unknown as CompletionEvidence;

describe("completion evidence outbox", () => {
  it("persists evidence across reads, scopes it to its account, and removes it after acceptance", async () => {
    const factory = indexedDB;
    await savePendingCompletionEvidence(
      { accountId: "account-a", kind: "lesson", contentId: "git-init", evidence },
      factory,
    );
    expect(await readPendingCompletionEvidence("account-b", factory)).toEqual([]);
    expect(await readPendingCompletionEvidence("account-a", factory)).toMatchObject([
      { accountId: "account-a", kind: "lesson", contentId: "git-init", evidence },
    ]);

    await deletePendingCompletionEvidence("account-a", "lesson", "git-init", factory);
    expect(await readPendingCompletionEvidence("account-a", factory)).toEqual([]);
  });

  it("replaces an older failed submission with newer evidence for the same requirement", async () => {
    const first = { ...evidence, attemptId: "attempt-1" };
    const second = { ...evidence, attemptId: "attempt-2" };
    const factory = indexedDB;
    await savePendingCompletionEvidence(
      { accountId: "account-a", kind: "practice", contentId: "commit-one-change", evidence: first },
      factory,
    );
    await savePendingCompletionEvidence(
      {
        accountId: "account-a",
        kind: "practice",
        contentId: "commit-one-change",
        evidence: second,
      },
      factory,
    );
    expect(await readPendingCompletionEvidence("account-a", factory)).toMatchObject([
      { evidence: second },
    ]);
  });
});
