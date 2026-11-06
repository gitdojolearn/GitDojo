/**
 * Widths of the workspace's three desktop columns, as percentages that add up to 100. Pure, so the
 * splitter's arithmetic is tested without a browser.
 */
export type ColumnSizes = readonly [number, number, number];

/** No column gets narrower than this, so a panel can never be dragged out of sight. */
export const MIN_COLUMN = 18;
/** Arrow keys move a splitter this far; Shift+arrow five times as far. */
export const KEYBOARD_STEP = 2;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Moves the splitter after column `index` by `delta` percentage points (positive: to the right),
 * growing one neighbour and shrinking the other, never below {@link MIN_COLUMN}.
 */
export function moveSplitter(sizes: ColumnSizes, index: 0 | 1, delta: number): ColumnSizes {
  const left = sizes[index];
  const right = sizes[index + 1] ?? 0;
  const pair = left + right;
  const nextLeft = Math.min(pair - MIN_COLUMN, Math.max(MIN_COLUMN, left + delta));
  const next = [...sizes] as [number, number, number];
  next[index] = round(nextLeft);
  next[index + 1] = round(pair - nextLeft);
  return next;
}

/** Saved sizes, or `null` when they are missing, malformed, or would hide a panel. */
export function parseSizes(raw: string | null): ColumnSizes | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      Array.isArray(value) &&
      value.length === 3 &&
      value.every((size) => typeof size === "number" && size >= MIN_COLUMN) &&
      Math.abs((value as number[]).reduce((sum, size) => sum + size, 0) - 100) < 0.5
    ) {
      return value as unknown as ColumnSizes;
    }
  } catch {
    // Corrupt: the defaults are used.
  }
  return null;
}

/** The CSS grid columns: three panels with a 0.75rem splitter track between each pair. */
export function gridTemplate(sizes: ColumnSizes): string {
  const [a, b, c] = sizes;
  return `minmax(0,${String(a)}fr) 0.75rem minmax(0,${String(b)}fr) 0.75rem minmax(0,${String(c)}fr)`;
}
