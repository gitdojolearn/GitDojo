/** Something the command palette can open or do. */
export interface PaletteItem {
  id: string;
  /** Heading the item is listed under. */
  group: string;
  label: string;
  /** A second, quieter line: the course a lesson is in, what a command does. */
  hint?: string;
  /** Extra words that should find it ("dark mode" for the theme switch). */
  keywords?: string;
}

/** A page to go to. Built on the server and handed to the palette. */
export interface PaletteLink extends PaletteItem {
  href: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * How well `item` matches `query`, or `null` when it does not. Every word of the query must appear
 * somewhere in the label, hint or keywords; labels that start with the query rank first, then
 * labels containing it, then matches only in the hint or keywords.
 */
export function scoreItem(item: PaletteItem, query: string): number | null {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  // "git " is optional: "cherry" should find git cherry-pick as readily as "git cherry".
  const label = normalize(item.label).replace(/^git (?=\S)/, "");
  const rest = normalize(`${item.hint ?? ""} ${item.keywords ?? ""} ${item.group}`);
  let score = 0;
  for (const word of words) {
    if (label.startsWith(word)) score += 3;
    else if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(label)) {
      score += 2;
    } else if (label.includes(word)) score += 1.5;
    else if (rest.includes(word)) score += 0.5;
    else return null;
  }
  const whole = normalize(query)
    .trim()
    .replace(/^git (?=\S)/, "");
  if (label === whole) score += 5;
  else if (label.startsWith(whole)) score += 2;
  return score;
}

/**
 * The items to list for `query`, best first, with at most `perGroup` from each group so one large
 * group (lessons) never hides the others. With no query, items keep their order.
 */
export function searchItems<T extends PaletteItem>(
  items: readonly T[],
  query: string,
  perGroup = 6,
): T[] {
  const scored = items
    .map((item, index) => ({ item, index, score: scoreItem(item, query) }))
    .filter((entry): entry is { item: T; index: number; score: number } => entry.score !== null);
  if (query.trim()) scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const counts = new Map<string, number>();
  const result: T[] = [];
  for (const { item } of scored) {
    const count = counts.get(item.group) ?? 0;
    if (count >= perGroup) continue;
    counts.set(item.group, count + 1);
    result.push(item);
  }
  return result;
}

/** Items grouped for display, groups in the order their best item appears. */
export function groupItems<T extends PaletteItem>(items: readonly T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.group);
    if (list) list.push(item);
    else groups.set(item.group, [item]);
  }
  return [...groups];
}
