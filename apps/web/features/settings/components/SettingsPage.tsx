"use client";

import { Button, cn, toast } from "@gitdojo/ui";
import {
  Code2,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
  SquareTerminal,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, type CSSProperties, type ReactNode } from "react";
import { loadAccountSession, useAccountSession } from "@/features/auth";
import { withReturnPath } from "@/lib/auth/return-path";
import { setTheme, useThemePreference, type ThemePreference } from "@/features/theme";
import { useSettings } from "../hooks/use-settings";
import {
  CURSOR_STYLES,
  FONT_SIZE_RANGE,
  LINE_HEIGHTS,
  MOTION_SETTINGS,
  resetSettings,
  updateSettings,
  type CursorStyle,
  type MotionSetting,
} from "../services/settings";

interface Choice<T> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * A row of mutually exclusive choices: native radio buttons, so arrow keys, forms and assistive
 * technology work as they do everywhere else.
 */
function Segmented<T extends string | number>({
  legend,
  description,
  name,
  value,
  choices,
  onChange,
  testId,
}: {
  legend: string;
  description?: string;
  name: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-small font-medium text-fg">
          {legend}
        </p>
        {description ? (
          <p id={`${id}-description`} className="pt-0.5 text-caption text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        data-testid={testId}
        className="flex shrink-0 flex-wrap gap-1 rounded-lg border border-border-subtle bg-app p-1"
      >
        {choices.map((choice) => (
          <label
            key={String(choice.value)}
            className={cn(
              "relative flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-small text-fg-secondary transition-colors hover:text-fg",
              "has-[:checked]:bg-elevated has-[:checked]:text-fg has-[:checked]:shadow-sm",
              "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-[var(--focus-ring)]",
              "[&_svg]:size-4",
            )}
          >
            <input
              type="radio"
              name={name}
              value={String(choice.value)}
              checked={choice.value === value}
              onChange={() => {
                onChange(choice.value);
              }}
              className="sr-only"
            />
            {choice.icon}
            {choice.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-small font-medium text-fg">
          {label}
        </label>
        {description ? (
          <p id={`${id}-description`} className="pt-0.5 text-caption text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        data-testid={testId}
        onClick={() => {
          onChange(!checked);
        }}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]",
          checked ? "border-accent-strong bg-accent-strong" : "border-border-strong bg-app",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-4 rounded-full transition-transform",
            checked ? "translate-x-6 bg-on-accent" : "translate-x-1 bg-fg-muted",
          )}
        />
      </button>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <label htmlFor={id} className="text-small font-medium text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={FONT_SIZE_RANGE.min}
          max={FONT_SIZE_RANGE.max}
          step={1}
          value={value}
          data-testid={testId}
          onChange={(event) => {
            onChange(Number(event.target.value));
          }}
          aria-valuetext={`${String(value)} pixels`}
          className="w-36 accent-[var(--accent-primary)] sm:w-48"
        />
        <output htmlFor={id} className="w-12 text-right font-mono text-caption text-fg-secondary">
          {value}px
        </output>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-20 rounded-xl border border-border-subtle bg-surface px-5 pt-5 pb-1"
    >
      <h2
        id={`${id}-heading`}
        className="flex items-center gap-2 text-body font-semibold text-fg [&_svg]:size-4 [&_svg]:text-fg-muted"
      >
        {icon}
        {title}
      </h2>
      <p className="mt-1 text-small text-fg-secondary">{description}</p>
      <div className="mt-2 divide-y divide-border-subtle">{children}</div>
    </section>
  );
}

const THEME_CHOICES: readonly Choice<ThemePreference>[] = [
  { value: "dark", label: "Dark", icon: <Moon aria-hidden="true" /> },
  { value: "light", label: "Light", icon: <Sun aria-hidden="true" /> },
  { value: "system", label: "System", icon: <Monitor aria-hidden="true" /> },
];

const MOTION_LABELS: Record<MotionSetting, string> = { normal: "Normal", slow: "Slow", off: "Off" };
const CURSOR_LABELS: Record<CursorStyle, string> = {
  block: "Block",
  bar: "Bar",
  underline: "Underline",
};

/** A few lines in the chosen terminal settings, so a change is visible before opening a lesson. */
function TerminalPreview({
  fontSize,
  lineHeight,
  cursor,
}: {
  fontSize: number;
  lineHeight: number;
  cursor: CursorStyle;
}) {
  const caret =
    cursor === "block"
      ? "inline-block h-[1.1em] w-[0.6em] translate-y-[0.15em] bg-fg"
      : cursor === "bar"
        ? "inline-block h-[1.1em] w-0.5 translate-y-[0.15em] bg-fg"
        : "inline-block h-0.5 w-[0.6em] bg-fg";
  return (
    <div
      aria-hidden="true"
      data-testid="terminal-preview"
      className="my-4 overflow-hidden rounded-lg border border-border-subtle bg-terminal p-3 font-mono text-fg-terminal"
      style={{ fontSize, lineHeight }}
    >
      <p>
        <span className="text-success">~/project</span> <span className="text-accent">(main)</span>{" "}
        $ git status
      </p>
      <p>On branch main</p>
      <p>
        <span className="text-success">~/project</span> <span className="text-accent">(main)</span>{" "}
        $ <span className={caret} />
      </p>
    </div>
  );
}

/** Settings → Appearance, Terminal, Editor and Account. Everything applies immediately. */
export function SettingsPage() {
  const settings = useSettings();
  const theme = useThemePreference();
  const session = useAccountSession((state) => state.session);

  useEffect(() => {
    void loadAccountSession();
  }, []);

  return (
    <div className="space-y-6">
      <Section
        id="appearance"
        title="Appearance"
        description="How GitDojo looks and moves. Saved in this browser."
        icon={<Palette aria-hidden="true" />}
      >
        <Segmented
          legend="Theme"
          description="System follows your device's light or dark setting."
          name="theme"
          value={theme}
          choices={THEME_CHOICES}
          onChange={setTheme}
          testId="setting-theme"
        />
        <Segmented
          legend="Animation speed"
          description="Slow gives you time to watch what each Git command does. Off removes movement."
          name="motion"
          value={settings.motion}
          choices={MOTION_SETTINGS.map((value) => ({ value, label: MOTION_LABELS[value] }))}
          onChange={(motion) => {
            updateSettings({ motion });
          }}
          testId="setting-motion"
        />
        <MotionPreview />
      </Section>

      <Section
        id="terminal"
        title="Terminal"
        description="The Git terminal in lessons, challenges, practice and the playground."
        icon={<SquareTerminal aria-hidden="true" />}
      >
        <TerminalPreview
          fontSize={settings.terminalFontSize}
          lineHeight={settings.terminalLineHeight}
          cursor={settings.terminalCursorStyle}
        />
        <Stepper
          label="Font size"
          value={settings.terminalFontSize}
          onChange={(terminalFontSize) => {
            updateSettings({ terminalFontSize });
          }}
          testId="setting-terminal-font-size"
        />
        <Segmented
          legend="Line height"
          name="terminal-line-height"
          value={settings.terminalLineHeight}
          choices={LINE_HEIGHTS.map((value) => ({ value, label: value.toFixed(2) }))}
          onChange={(terminalLineHeight) => {
            updateSettings({ terminalLineHeight });
          }}
          testId="setting-terminal-line-height"
        />
        <Segmented
          legend="Cursor style"
          name="terminal-cursor"
          value={settings.terminalCursorStyle}
          choices={CURSOR_STYLES.map((value) => ({ value, label: CURSOR_LABELS[value] }))}
          onChange={(terminalCursorStyle) => {
            updateSettings({ terminalCursorStyle });
          }}
          testId="setting-terminal-cursor"
        />
        <Toggle
          label="Blinking cursor"
          description="It stops blinking after a few seconds either way."
          checked={settings.terminalCursorBlink}
          onChange={(terminalCursorBlink) => {
            updateSettings({ terminalCursorBlink });
          }}
          testId="setting-terminal-blink"
        />
      </Section>

      <Section
        id="editor"
        title="Editor"
        description="The file editor next to the terminal."
        icon={<Code2 aria-hidden="true" />}
      >
        <Stepper
          label="Font size"
          value={settings.editorFontSize}
          onChange={(editorFontSize) => {
            updateSettings({ editorFontSize });
          }}
          testId="setting-editor-font-size"
        />
        <Toggle
          label="Wrap long lines"
          checked={settings.editorWordWrap}
          onChange={(editorWordWrap) => {
            updateSettings({ editorWordWrap });
          }}
          testId="setting-editor-wrap"
        />
      </Section>

      <Section
        id="account"
        title="Account"
        description={
          session?.status === "unconfigured"
            ? "Accounts are not available on this GitDojo server. Your progress stays in this browser."
            : session?.status === "signed-in"
              ? "Your profile, certificate name, synced progress and account data."
              : "Sign in to keep your progress across devices and earn certificates."
        }
        icon={<UserRound aria-hidden="true" />}
      >
        <div className="flex flex-wrap gap-3 py-4">
          {session?.status === "signed-in" ? (
            <Button asChild variant="secondary">
              <Link href="/account">Manage account</Link>
            </Button>
          ) : session?.status === "signed-out" ? (
            <Button asChild variant="secondary">
              <Link href={withReturnPath("/sign-in", "/settings")}>Sign in</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link href="/dashboard#manage-heading">Back up or reset progress</Link>
          </Button>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          data-testid="reset-settings"
          onClick={() => {
            resetSettings();
            setTheme("dark");
            toast({ title: "Settings restored to their defaults.", tone: "success" });
          }}
        >
          <RotateCcw /> Restore defaults
        </Button>
      </div>
    </div>
  );
}

/**
 * A branch label gliding from one commit to the next, replayed on demand, so the chosen speed can
 * be seen without leaving the page.
 */
function MotionPreview() {
  const { motion } = useSettings();
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <p className="flex items-center gap-2 text-caption text-fg-muted">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Preview: a branch moving to a new commit
      </p>
      <div aria-hidden="true" className="flex items-center gap-3">
        <span className="size-2.5 rounded-full border-2 border-branch" />
        <span className="h-0.5 w-6 bg-border-strong" />
        <span className="relative size-2.5 rounded-full border-2 border-branch">
          {/* Re-keyed on every speed change, so the preview plays again at the new speed. */}
          <span
            key={motion}
            className="absolute -top-6 left-1/2 -translate-x-1/2 animate-gd-glide rounded-sm border border-branch/40 bg-branch-soft px-1.5 font-mono text-micro text-branch"
            style={{ "--gd-from-x": "-34px" } as CSSProperties}
          >
            main
          </span>
        </span>
      </div>
    </div>
  );
}
