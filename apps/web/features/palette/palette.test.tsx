import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./components/CommandPalette";
import { usePaletteActions } from "./hooks/use-palette-actions";
import { groupItems, scoreItem, searchItems, type PaletteLink } from "./services/search";
import { matchesShortcut } from "./services/shortcuts";
import { usePaletteStore, type PaletteAction } from "./state/palette-store";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const LINKS: PaletteLink[] = [
  { id: "page:/playground", group: "Pages", label: "Playground", href: "/playground" },
  { id: "command:reset", group: "Git commands", label: "git reset", href: "/commands/reset" },
  { id: "command:restore", group: "Git commands", label: "git restore", href: "/commands/restore" },
  {
    id: "lesson:a",
    group: "Lessons",
    label: "Undo with reset",
    hint: "Recovery",
    href: "/learn/recovery/git-reset",
  },
];

function PageActions({ run }: { run: () => void }) {
  const actions = useMemo<PaletteAction[]>(
    () => [
      {
        id: "hint",
        group: "This lesson",
        label: "Show the next hint",
        shortcut: { key: "/", mod: true },
        run,
      },
    ],
    [run],
  );
  usePaletteActions(actions);
  return null;
}

beforeEach(() => {
  push.mockReset();
  usePaletteStore.setState({ open: false, sources: new Map() });
  // jsdom has no layout; the active option scrolls into view.
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("palette search", () => {
  it("needs every word, and ranks label prefixes over mentions elsewhere", () => {
    const [playground] = LINKS;
    if (!playground) throw new Error("no links");
    expect(scoreItem(playground, "play")).not.toBeNull();
    expect(scoreItem(playground, "play ground zzz")).toBeNull();
    const results = searchItems(LINKS, "reset");
    expect(results.map((item) => item.id)).toEqual(["command:reset", "lesson:a"]);
    expect(searchItems(LINKS, "recovery").map((item) => item.id)).toEqual(["lesson:a"]);
    // "git " is optional when looking for a command.
    expect(searchItems(LINKS, "restore")[0]?.id).toBe("command:restore");
    expect(searchItems(LINKS, "git restore")[0]?.id).toBe("command:restore");
  });

  it("caps each group and keeps groups in order of their best match", () => {
    expect(searchItems(LINKS, "git", 1).map((item) => item.id)).toEqual(["command:reset"]);
    expect(groupItems(LINKS).map(([group]) => group)).toEqual(["Pages", "Git commands", "Lessons"]);
  });

  it("reads ⌘ on Apple keyboards and Ctrl elsewhere", () => {
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
    expect(matchesShortcut(event, { key: "k", mod: true }, false)).toBe(true);
    expect(matchesShortcut(event, { key: "k", mod: true }, true)).toBe(false);
  });
});

describe("command palette", () => {
  it("opens with Ctrl+K, filters, and goes to the chosen page with the keyboard", async () => {
    const user = userEvent.setup();
    render(<CommandPalette links={LINKS} />);
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Search" });
    await user.type(input, "git re");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0]?.id);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/commands/restore");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves Ctrl+K to the terminal, which uses it to delete to the end of the line", () => {
    render(
      <div className="xterm">
        <textarea aria-label="terminal input" />
        <CommandPalette links={LINKS} />
      </div>,
    );
    const terminal = screen.getByLabelText("terminal input");
    terminal.focus();
    act(() => {
      terminal.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
      );
    });
    expect(usePaletteStore.getState().open).toBe(false);
  });

  it("lists what the page offers first, and runs it from its shortcut too", async () => {
    const run = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <PageActions run={run} />
        <CommandPalette links={LINKS} />
      </>,
    );
    await user.keyboard("{Control>}/{/Control}");
    expect(run).toHaveBeenCalledTimes(1);

    act(() => {
      usePaletteStore.getState().setOpen(true);
    });
    const first = (await screen.findAllByRole("option"))[0];
    expect(first).toHaveTextContent("Show the next hint");
    expect(first).toHaveTextContent("Ctrl");
    await user.keyboard("{Enter}");
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2);
    });
  });

  it("says when nothing matches", async () => {
    const user = userEvent.setup();
    render(<CommandPalette links={LINKS} />);
    act(() => {
      usePaletteStore.getState().setOpen(true);
    });
    await user.type(await screen.findByRole("combobox"), "zzzz");
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });
});
