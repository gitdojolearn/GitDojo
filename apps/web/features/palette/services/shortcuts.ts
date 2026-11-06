import { type Shortcut } from "../state/palette-store";

/** Apple keyboards use ⌘ where others use Ctrl. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut, apple: boolean): boolean {
  const mod = apple ? event.metaKey : event.ctrlKey;
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    mod === Boolean(shortcut.mod) &&
    event.shiftKey === Boolean(shortcut.shift) &&
    !event.altKey
  );
}

/** The keys to show for a shortcut, as keycaps. */
export function shortcutKeys(shortcut: Shortcut, apple: boolean): string[] {
  const keys: string[] = [];
  if (shortcut.mod) keys.push(apple ? "⌘" : "Ctrl");
  if (shortcut.shift) keys.push(apple ? "⇧" : "Shift");
  keys.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return keys;
}

/** Inside the terminal or editor, Ctrl+K and friends already mean something there. */
export function isTypingSurface(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(".xterm, .monaco-editor"));
}
