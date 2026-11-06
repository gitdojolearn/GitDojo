/** How `git log --graph` draws one commit: the prefixes in front of each of its lines. */
export interface GraphRows {
  /** In front of the commit's first line: `*` in its lane, `|` in the others. */
  commit: string;
  /**
   * Rows drawn under the commit: a merge's fork (`|\`), then lanes joining (`|/`). They prefix the
   * commit's next lines, or stand alone after a one-line commit.
   */
  after: string[];
  /** In front of the commit's remaining lines: a `|` per lane still open. */
  continuation: string;
  /** Every prefix is padded to this width, so the text lines up. */
  width: number;
}

interface GraphCommit {
  oid: string;
  parents: readonly string[];
}

/** One row of `/` and `\` characters, with `|` for lanes that go straight down. */
function drawRow(cells: Map<number, string>): string {
  const width = Math.max(0, ...cells.keys()) + 1;
  return Array.from({ length: width }, (_, column) => cells.get(column) ?? " ")
    .join("")
    .trimEnd();
}

function lanes(count: number): string {
  return Array.from({ length: count }, () => "|").join(" ");
}

/**
 * Lays out `git log --graph` for commits in topological order (children first). Each lane is a
 * commit still to come; a commit takes its lane, then hands it to its first parent and opens a
 * lane to the right for each other parent. Two lanes waiting for the same commit join (`|/`), the
 * leftmost one staying, as in Git. Histories with several lanes joining at once are drawn with
 * one diagonal per lane rather than Git's longer routing.
 */
export function layoutGraph(commits: readonly GraphCommit[]): GraphRows[] {
  let columns: string[] = [];
  return commits.map((commit) => {
    let lane = columns.indexOf(commit.oid);
    if (lane === -1) {
      columns.push(commit.oid);
      lane = columns.length - 1;
    }
    const parents = [...new Set(commit.parents)];
    const next = [...columns];
    if (parents.length === 0) next.splice(lane, 1);
    else next.splice(lane, 1, ...parents);
    const width = 2 * Math.max(columns.length, next.length);
    const commitPrefix = columns.map((_, index) => (index === lane ? "*" : "|")).join(" ");

    const after: string[] = [];
    if (parents.length > 1) {
      // The fork: lanes up to this one go straight down, new and shifted lanes lean right.
      const cells = new Map<number, string>();
      for (let index = 0; index < next.length; index += 1) {
        if (index <= lane) cells.set(2 * index, "|");
        else cells.set(2 * index - 1, "\\");
      }
      after.push(drawRow(cells));
    } else if (parents.length === 0 && lane < columns.length - 1) {
      // A root commit's lane ends; the lanes to its right move left.
      const cells = new Map<number, string>();
      for (let index = 0; index < columns.length; index += 1) {
        if (index < lane) cells.set(2 * index, "|");
        else if (index > lane) cells.set(2 * index - 1, "/");
      }
      after.push(drawRow(cells));
    }

    // Lanes waiting for the same commit join the leftmost one.
    for (;;) {
      const joining = next.findIndex((oid, index) => next.indexOf(oid) !== index);
      if (joining === -1) break;
      const cells = new Map<number, string>();
      for (let index = 0; index < next.length; index += 1) {
        if (index < joining) cells.set(2 * index, "|");
        else cells.set(2 * index - 1, "/");
      }
      after.push(drawRow(cells));
      next.splice(joining, 1);
    }

    columns = next;
    return {
      commit: commitPrefix.padEnd(width),
      after,
      continuation: lanes(next.length).padEnd(width),
      width,
    };
  });
}

/** Puts a commit's lines next to its graph rows, as `git log --graph` prints them. */
export function drawCommitLines(rows: GraphRows, lines: readonly string[]): string[] {
  const drawn = lines.map((line, index) => {
    const prefix = index === 0 ? rows.commit : (rows.after[index - 1] ?? rows.continuation);
    return `${prefix.padEnd(rows.width)}${line}`.trimEnd();
  });
  // A one-line commit (`--oneline`) leaves the fork and joins on rows of their own.
  return [...drawn, ...rows.after.slice(Math.max(0, lines.length - 1))];
}
