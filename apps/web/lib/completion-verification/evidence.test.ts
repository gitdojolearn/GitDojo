// @vitest-environment node
import { createHash } from "node:crypto";
import {
  type AssessmentGitObject,
  type CompletionEvidence,
  type LessonDefinition,
} from "@gitdojo/shared-types";
import { describe, expect, it, vi } from "vitest";
import { type CompletionAttemptRecord, verifyCompletionEvidence } from "./evidence";

vi.mock("server-only", () => ({}));

const ATTEMPT: CompletionAttemptRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  nonce: "server-created-nonce",
  kind: "lesson",
  contentId: "verified-test",
  contentVersion: "a".repeat(64),
  usedAt: null,
  evidenceHash: null,
};

const LESSON: LessonDefinition = {
  id: "verified-test",
  slug: "verified-test",
  title: "Verified test",
  difficulty: "beginner",
  concepts: [],
  setup: {},
  objectives: [
    {
      id: "initialized",
      description: "Initialize Git",
      validator: { type: "repository_initialized" },
    },
    {
      id: "readme",
      description: "Commit a README",
      validator: { type: "file_exists", file: "README.md" },
    },
  ],
};

function object(type: AssessmentGitObject["type"], bytes: Buffer): AssessmentGitObject {
  const oid = createHash("sha1")
    .update(`${type} ${String(bytes.length)}\0`)
    .update(bytes)
    .digest("hex");
  return { oid, type, content: bytes.toString("base64") };
}

function fixture(): CompletionEvidence {
  const readme = object("blob", Buffer.from("# Verified\n"));
  const tree = object(
    "tree",
    Buffer.concat([Buffer.from("100644 README.md\0"), Buffer.from(readme.oid, "hex")]),
  );
  const commit = object(
    "commit",
    Buffer.from(
      [
        `tree ${tree.oid}`,
        "author Learner <learner@gitdojo.local> 1 +0000",
        "committer Learner <learner@gitdojo.local> 1 +0000",
        "",
        "Add README",
        "",
      ].join("\n"),
    ),
  );
  const binding = {
    id: ATTEMPT.id,
    nonce: ATTEMPT.nonce,
    kind: ATTEMPT.kind,
    contentId: ATTEMPT.contentId,
    contentVersion: ATTEMPT.contentVersion,
  };
  return {
    format: "gitdojo-completion-evidence",
    version: 1,
    attemptId: ATTEMPT.id,
    contentVersion: ATTEMPT.contentVersion,
    binding,
    state: {
      initialized: true,
      currentBranch: "main",
      head: commit.oid,
      branches: [{ name: "main", oid: commit.oid, current: true }],
      commits: [],
      allCommits: [],
      files: [],
      stagedFiles: [],
      conflicts: [],
      merge: null,
      stashes: [],
      reflog: [],
      tags: [],
      remotes: [],
      remoteBranches: [],
      editor: null,
    },
    index: [{ path: "README.md", mode: 0o100644, oid: readme.oid, stage: 0 }],
    workingTree: [
      {
        path: "README.md",
        mode: 0o100644,
        oid: readme.oid,
        content: Buffer.from("# Verified\n").toString("base64"),
      },
    ],
    objects: [readme, tree, commit],
  };
}

const digest = (evidence: CompletionEvidence) =>
  createHash("sha256").update(JSON.stringify(evidence)).digest("hex");

describe("completion evidence verification", () => {
  it("rebuilds repository state from canonical objects and runs the shared validators", async () => {
    const checked = await verifyCompletionEvidence(fixture(), ATTEMPT, LESSON);

    expect(checked.result.completed).toBe(true);
    expect(checked.repository.files).toContainEqual({
      path: "README.md",
      status: "committed",
      content: "# Verified\n",
    });
  });

  it("rejects the wrong nonce, a stale content version, and altered object bytes", async () => {
    const wrongNonce = fixture();
    wrongNonce.binding.nonce = "invented";
    await expect(verifyCompletionEvidence(wrongNonce, ATTEMPT, LESSON)).rejects.toThrow(
      "attempt binding mismatch",
    );

    const stale = fixture();
    stale.contentVersion = "b".repeat(64);
    await expect(verifyCompletionEvidence(stale, ATTEMPT, LESSON)).rejects.toThrow(
      "attempt binding mismatch",
    );

    const altered = fixture();
    const firstObject = altered.objects[0];
    if (!firstObject) throw new Error("fixture has no objects");
    firstObject.content = Buffer.from("altered").toString("base64");
    await expect(verifyCompletionEvidence(altered, ATTEMPT, LESSON)).rejects.toThrow(
      "altered object",
    );
  });

  it("allows an identical retry but rejects reusing an attempt for different evidence", async () => {
    const evidence = fixture();
    const used = { ...ATTEMPT, usedAt: new Date(), evidenceHash: digest(evidence) };
    await expect(verifyCompletionEvidence(evidence, used, LESSON)).resolves.toBeDefined();

    const different = fixture();
    different.state.currentBranch = null;
    const firstBranch = different.state.branches[0];
    if (!firstBranch) throw new Error("fixture has no branches");
    different.state.branches = [{ ...firstBranch, current: false }];
    await expect(verifyCompletionEvidence(different, used, LESSON)).rejects.toThrow("already used");
  });
});
