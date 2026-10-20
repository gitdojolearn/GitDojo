"use client";

import { cn } from "@gitdojo/ui";
import { Fragment, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type DemoArea = "working" | "staging" | "repository";

/** One command of the demo. Everything but the command text is rendered on the server. */
export interface DemoStep {
  /** Short name for the step button. */
  name: string;
  command: string;
  /** What the terminal prints. */
  output: ReactNode;
  /** What the command did, in a sentence. */
  caption: ReactNode;
}

/** What one area shows; `id` changes when the content does, so it re-enters (and animates). */
export interface DemoPanel {
  id: string;
  content: ReactNode;
}

/** The three areas after a number of commands have run. */
export interface DemoState {
  panels: Record<DemoArea, DemoPanel>;
  /** The area the last command changed, highlighted. */
  changed?: DemoArea;
}

/** Playback timing (ms). Typing is skipped with reduced motion. */
const START_DELAY = 500;
const TYPE_DELAY = 45;
const RUN_DELAY = 350;
const HOLD_DELAY = 2400;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

function Prompt({ children, cursor }: { children?: ReactNode; cursor?: boolean }) {
  return (
    <p>
      <span className="hidden text-info sm:inline">~/project </span>
      <span className="text-success">$</span> <span className="text-fg">{children}</span>
      {cursor ? (
        <span
          aria-hidden="true"
          className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] animate-gd-blink bg-fg-terminal"
        />
      ) : null}
    </p>
  );
}

/** Lines not reached yet keep their space, so the demo never changes height as it plays. */
function Reserved({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" className="invisible">
      {children}
    </div>
  );
}

function Transcript({
  step,
  state,
  typed,
}: {
  step: DemoStep;
  /** Run already, the one the prompt is waiting on, or still to come. */
  state: "done" | "next" | "later";
  typed: number;
}) {
  if (state === "done") {
    return (
      <div className="animate-gd-enter">
        <Prompt>{step.command}</Prompt>
        {step.output}
      </div>
    );
  }
  return (
    <>
      {state === "next" ? <Prompt cursor>{step.command.slice(0, typed)}</Prompt> : null}
      <Reserved>
        {state === "later" ? <Prompt>{step.command}</Prompt> : null}
        {step.output}
      </Reserved>
    </>
  );
}

function AreaPanel({
  label,
  title,
  changed,
  panel,
}: {
  label: string;
  title: ReactNode;
  changed: boolean;
  panel: DemoPanel;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        // A row per area on phones, three columns from `sm`.
        "flex min-h-[62px] min-w-0 flex-1 items-center gap-3 rounded-md border bg-panel px-3 py-2 transition-colors duration-[250ms] ease-out sm:min-h-[92px] sm:flex-col sm:items-stretch sm:gap-0 sm:p-3",
        changed ? "border-accent-border" : "border-border",
      )}
    >
      <p className="flex w-28 shrink-0 items-center gap-1.5 text-micro font-semibold tracking-wider text-fg-muted uppercase sm:mb-2 sm:w-auto [&_svg]:size-3.5 [&_svg]:shrink-0">
        {title}
      </p>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <Fragment key={panel.id}>{panel.content}</Fragment>
      </div>
    </div>
  );
}

function TransferArrow({ active, icon }: { active: boolean; icon: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "hidden shrink-0 self-center transition-colors duration-[250ms] sm:block [&_svg]:size-4",
        active ? "animate-gd-pulse-x text-accent [animation-iteration-count:2]" : "text-fg-faint",
      )}
    >
      {icon}
    </span>
  );
}

/**
 * Plays the hero demo: types each command, then shows the areas as they are after it. It plays
 * once when scrolled into view (never with reduced motion), and every step can be chosen
 * directly. The content comes from the server, so this ships only the playback logic.
 */
export function DemoPlayer({
  title,
  action,
  steps,
  intro,
  states,
  areas,
  icons,
}: {
  title: string;
  /** Shown at the right of the title bar. */
  action: ReactNode;
  steps: DemoStep[];
  /** The caption before any command has run. */
  intro: ReactNode;
  /** The areas after 0, 1, … steps.length commands. */
  states: DemoState[];
  /** Each area's accessible name and its visible title (icon + text). */
  areas: Record<DemoArea, { label: string; title: ReactNode }>;
  icons: { arrow: ReactNode; play: ReactNode; pause: ReactNode; replay: ReactNode };
}) {
  const reduced = useReducedMotion();
  // Commands run so far, and how much of the next one has been typed.
  const [done, setDone] = useState(0);
  const [typed, setTyped] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Announce captions only once the visitor drives the demo, not during autoplay.
  const [announce, setAnnounce] = useState(false);
  const started = useRef(false);
  const root = useRef<HTMLElement>(null);

  const finished = done === steps.length;
  const running = playing && !finished;

  // Autoplay once, the first time most of the demo is on screen.
  useEffect(() => {
    const element = root.current;
    if (reduced || started.current || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !started.current) {
          started.current = true;
          setPlaying(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [reduced]);

  useEffect(() => {
    if (!running) return;
    const command = steps[done]?.command ?? "";
    let timer: ReturnType<typeof setTimeout>;
    if (typed < command.length) {
      const wait = typed > 0 ? TYPE_DELAY : done === 0 ? START_DELAY : HOLD_DELAY;
      timer = setTimeout(() => {
        setTyped(reduced ? command.length : typed + 1);
      }, wait);
    } else {
      timer = setTimeout(() => {
        setDone(done + 1);
        setTyped(0);
      }, RUN_DELAY);
    }
    return () => {
      clearTimeout(timer);
    };
  }, [running, done, typed, reduced, steps]);

  function show(count: number) {
    started.current = true;
    setPlaying(false);
    setAnnounce(true);
    setDone(count);
    setTyped(0);
  }

  function toggle() {
    started.current = true;
    setAnnounce(true);
    if (finished) {
      setDone(0);
      setTyped(0);
      setPlaying(true);
    } else {
      setPlaying(!running);
    }
  }

  const state = states[done] ?? states[0];
  const changed = state?.changed;
  const captions = [intro, ...steps.map((step) => step.caption)];

  return (
    <figure
      ref={root}
      aria-labelledby="hero-demo-title"
      className="relative min-w-0 rounded-xl border border-border bg-surface shadow-2xl shadow-shade/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
          </span>
          <p id="hero-demo-title" className="truncate text-caption font-medium text-fg-secondary">
            <span className="sr-only">Demo: </span>
            {title}
          </p>
        </div>
        {action}
      </div>

      <div className="p-3 sm:p-4">
        <div
          role="region"
          aria-label="Terminal"
          className="rounded-lg border border-border-subtle bg-terminal px-3 py-3 font-mono text-[12.5px] leading-5 text-fg-terminal sm:px-4"
        >
          {steps.map((step, index) => (
            <Transcript
              key={step.name}
              step={step}
              state={index < done ? "done" : index === done ? "next" : "later"}
              typed={index === done ? typed : 0}
            />
          ))}
          {/* Once every command has run, the prompt waits on its own line (reserved until then). */}
          {finished ? (
            <Prompt cursor />
          ) : (
            <Reserved>
              <Prompt />
            </Reserved>
          )}
        </div>

        {state ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <AreaPanel
              {...areas.working}
              changed={changed === "working"}
              panel={state.panels.working}
            />
            <TransferArrow active={changed === "staging"} icon={icons.arrow} />
            <AreaPanel
              {...areas.staging}
              changed={changed === "staging"}
              panel={state.panels.staging}
            />
            <TransferArrow active={finished && changed === "repository"} icon={icons.arrow} />
            <AreaPanel
              {...areas.repository}
              changed={changed === "repository"}
              panel={state.panels.repository}
            />
          </div>
        ) : null}

        {/* Every caption sits in the same cell, hidden but for the current one, so the demo is
            always as tall as its longest caption and never shifts the page as it plays. */}
        <div className="mt-3 grid text-small text-fg-secondary">
          {captions.map((text, index) => (
            <p key={index} aria-hidden="true" className="invisible col-start-1 row-start-1">
              {text}
            </p>
          ))}
          <p aria-live={announce ? "polite" : "off"} className="col-start-1 row-start-1">
            {captions[done]}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-3 py-2 sm:px-4">
        <ol aria-label="Demo steps" className="flex min-w-0 items-center gap-1">
          {steps.map((step, index) => {
            const current = done === index + 1;
            return (
              <li key={step.name}>
                <button
                  type="button"
                  onClick={() => {
                    show(index + 1);
                  }}
                  aria-label={`Step ${String(index + 1)}: git ${step.name}`}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-sm px-1.5 font-mono text-caption transition-colors duration-150 ease-out hover:bg-hover hover:text-fg sm:px-2",
                    current
                      ? "bg-accent-soft text-accent"
                      : index < done
                        ? "text-fg"
                        : "text-fg-muted",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      index < done ? "bg-accent" : "bg-border-strong",
                    )}
                  />
                  {step.name}
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={toggle}
          className="flex h-7 min-w-[5.5rem] shrink-0 items-center justify-end gap-1.5 rounded-sm px-2 text-caption font-medium text-fg-secondary transition-colors duration-150 ease-out hover:bg-hover hover:text-fg [&_svg]:size-3.5"
        >
          {finished ? (
            <>{icons.replay} Replay</>
          ) : running ? (
            <>{icons.pause} Pause</>
          ) : (
            <>
              {icons.play} {done === 0 && typed === 0 ? "Play" : "Resume"}
            </>
          )}
        </button>
      </div>
    </figure>
  );
}
