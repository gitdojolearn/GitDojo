import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");

it("uses the reviewed legacy note for PR 71 when its merged description has none", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gitdojo-release-note-"));
  try {
    const gh = path.join(dir, "gh");
    const changelog = path.join(dir, "changelog.md");
    const output = path.join(dir, "notes.md");
    const pullRequest = {
      merged_at: "2026-10-19T02:45:58Z",
      base: { ref: "main" },
      user: { type: "User" },
      title: "Verify hands-on completions on the server",
      body: "## Summary\nAdds verified completions.",
    };
    await writeFile(
      gh,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(pullRequest))});\n`,
    );
    await chmod(gh, 0o755);
    await writeFile(changelog, "## What's Changed\n* Verify completions in #71\n");

    await run(process.execPath, ["apps/web/scripts/compose-release-notes.mjs", changelog, output], {
      cwd: root,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "gitdojolearn/GitDojo",
        PATH: `${dir}:${process.env.PATH ?? ""}`,
      },
    });

    expect(await readFile(output, "utf8")).toContain(
      "- Completed lessons, challenges, and practice tasks can be verified for certification while existing progress remains visible.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
