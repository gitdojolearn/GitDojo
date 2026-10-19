import {
  type AssessmentGitObject,
  type CompletionAttemptBinding,
  type CompletionEvidence,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { Buffer } from "buffer";
import git from "isomorphic-git";
import { type GitContext } from "./context";

const OID = /^[0-9a-f]{40}$/;
const BINDING_FILE = "GITDOJO_COMPLETION_ATTEMPT.json";

function bindingPath(ctx: GitContext): string {
  return `${ctx.dir}/.git/${BINDING_FILE}`;
}

export async function bindCompletionAttempt(
  ctx: GitContext,
  binding: CompletionAttemptBinding,
): Promise<void> {
  await ctx.fs.promises.writeFile(bindingPath(ctx), JSON.stringify(binding), "utf8");
}

async function readBinding(ctx: GitContext): Promise<CompletionAttemptBinding> {
  const raw = await ctx.fs.promises.readFile(bindingPath(ctx), { encoding: "utf8" });
  return JSON.parse(
    typeof raw === "string" ? raw : new TextDecoder().decode(raw),
  ) as CompletionAttemptBinding;
}

function rootsOf(state: RepositoryState): string[] {
  return [
    state.head,
    ...state.branches.map((branch) => branch.oid),
    ...state.tags.map((tag) => tag.oid),
    ...state.remoteBranches.map((branch) => branch.oid),
    ...state.remotes.flatMap((remote) => remote.branches.map((branch) => branch.oid)),
    ...state.reflog.map((entry) => entry.oid),
    state.merge?.oid,
  ].filter((oid): oid is string => typeof oid === "string" && OID.test(oid));
}

async function canonicalObjects(
  ctx: GitContext,
  roots: readonly string[],
): Promise<AssessmentGitObject[]> {
  const pending = [...new Set(roots)];
  const seen = new Set<string>();
  const objects: AssessmentGitObject[] = [];
  while (pending.length > 0) {
    const oid = pending.pop();
    if (!oid || seen.has(oid)) continue;
    seen.add(oid);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const raw = await git.readObject({ fs: ctx.fs, dir: ctx.dir, oid, format: "content" });
    if (raw.type !== "blob" && raw.type !== "tree" && raw.type !== "commit") continue;
    if (!(raw.object instanceof Uint8Array)) throw new Error("Git returned a non-canonical object");
    objects.push({ oid, type: raw.type, content: Buffer.from(raw.object).toString("base64") });
    if (raw.type === "commit") {
      const parsed = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
      pending.push(parsed.commit.tree, ...parsed.commit.parent);
    } else if (raw.type === "tree") {
      const parsed = await git.readTree({ fs: ctx.fs, dir: ctx.dir, oid });
      pending.push(...parsed.tree.map((entry) => entry.oid));
    }
  }
  return objects.sort((a, b) => a.oid.localeCompare(b.oid));
}

/** Export everything objective validators can observe, without exporting a browser-side grade. */
export async function completionEvidence(
  ctx: GitContext,
  state: RepositoryState,
): Promise<CompletionEvidence> {
  const binding = await readBinding(ctx);
  const index: CompletionEvidence["index"] = [];
  const workingTree: CompletionEvidence["workingTree"] = [];
  await git.walk({
    fs: ctx.fs,
    dir: ctx.dir,
    trees: [git.STAGE(), git.WORKDIR({ refresh: false })],
    map: async (path, [stage, worktree]) => {
      if (path === ".") return undefined;
      if (path === ".git" || path.startsWith(".git/")) return null;
      const stageType = stage ? await stage.type() : null;
      const worktreeType = worktree ? await worktree.type() : null;
      if (stage && stageType === "blob")
        index.push({ path, mode: await stage.mode(), oid: await stage.oid(), stage: 0 });
      if (worktree && worktreeType === "blob") {
        const content = (await worktree.content()) ?? new Uint8Array();
        const { oid } = await git.hashBlob({ object: content });
        workingTree.push({
          path,
          mode: await worktree.mode(),
          oid,
          content: Buffer.from(content).toString("base64"),
        });
      }
      return undefined;
    },
  });
  return {
    format: "gitdojo-completion-evidence",
    version: 1,
    attemptId: binding.id,
    contentVersion: binding.contentVersion,
    binding,
    state,
    index,
    workingTree,
    objects: await canonicalObjects(ctx, [...rootsOf(state), ...index.map((entry) => entry.oid)]),
  };
}
