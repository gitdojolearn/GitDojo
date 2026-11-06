"use client";

import { Toast as ToastPrimitive } from "radix-ui";
import { useSyncExternalStore } from "react";
import { cn } from "../lib/cn";
import { X } from "./icons";

export type ToastTone = "neutral" | "success" | "danger";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastItem extends Required<Omit<ToastOptions, "description">> {
  id: number;
  description?: string;
  open: boolean;
}

// A tiny module-level queue, so anything (a click handler, a service) can show a toast without a
// provider of its own. <Toaster /> renders it once, in the root layout.
let items: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const MAX_TOASTS = 3;

function emit(next: readonly ToastItem[]) {
  items = next;
  for (const listener of listeners) listener();
}

/**
 * Shows a short message in the corner: confirmation that something happened, or why it could
 * not. It is announced politely to assistive technology and closes itself after a few seconds
 * (paused while hovered or focused).
 */
export function toast({ title, description, tone = "neutral" }: ToastOptions): number {
  const id = nextId++;
  const item: ToastItem = { id, title, tone, open: true, ...(description ? { description } : {}) };
  emit([...items, item].slice(-MAX_TOASTS));
  return id;
}

function close(id: number) {
  emit(items.map((item) => (item.id === id ? { ...item, open: false } : item)));
  // Leave time for the exit animation before forgetting it.
  window.setTimeout(() => {
    emit(items.filter((item) => item.id !== id));
  }, 200);
}

/** For tests: forget every toast. */
export function clearToasts() {
  emit([]);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY: readonly ToastItem[] = [];

const TONES: Record<ToastTone, string> = {
  neutral: "border-border-strong",
  success: "border-success/40",
  danger: "border-danger/40",
};

const DOTS: Record<ToastTone, string> = {
  neutral: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
};

/** Where toasts appear. Render once, near the root. */
export function Toaster({ duration = 4000 }: { duration?: number }) {
  const shown = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );
  return (
    <ToastPrimitive.Provider duration={duration} swipeDirection="right" label="Notification">
      {shown.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          open={item.open}
          onOpenChange={(open) => {
            if (!open) close(item.id);
          }}
          type={item.tone === "danger" ? "foreground" : "background"}
          data-testid="toast"
          data-tone={item.tone}
          className={cn(
            "group pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border bg-elevated py-3 pr-10 pl-4 shadow-xl shadow-shade/40",
            "data-[state=closed]:opacity-0 data-[state=closed]:transition-opacity data-[state=open]:animate-gd-enter",
            "data-[swipe=end]:translate-x-full data-[swipe=end]:transition-transform data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
            TONES[item.tone],
          )}
        >
          <span
            aria-hidden="true"
            className={cn("mt-2 size-1.5 shrink-0 rounded-full", DOTS[item.tone])}
          />
          <div className="min-w-0">
            <ToastPrimitive.Title className="text-small font-medium text-fg">
              {item.title}
            </ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description className="mt-0.5 text-caption text-fg-secondary">
                {item.description}
              </ToastPrimitive.Description>
            ) : null}
          </div>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5 rounded-sm p-1 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <X className="size-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      {/* Above the phone tab bar in the workspace (3.5rem + safe area). */}
      <ToastPrimitive.Viewport className="pointer-events-none fixed right-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[60] m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none md:bottom-0" />
    </ToastPrimitive.Provider>
  );
}
