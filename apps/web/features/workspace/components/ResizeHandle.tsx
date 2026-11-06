"use client";

import { cn } from "@gitdojo/ui";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  KEYBOARD_STEP,
  MIN_COLUMN,
  moveSplitter,
  type ColumnSizes,
} from "../services/column-sizes";

/**
 * The splitter between two workspace columns (desktop only). Drag it, or focus it and use the
 * arrow keys; double-click or Enter puts every column back to its default width.
 */
export function ResizeHandle({
  index,
  sizes,
  onChange,
  onReset,
  label,
}: {
  /** 0: between the first and second column; 1: between the second and third. */
  index: 0 | 1;
  sizes: ColumnSizes;
  onChange: (sizes: ColumnSizes) => void;
  onReset: () => void;
  label: string;
}) {
  const drag = useRef<{ x: number; sizes: ColumnSizes; width: number } | null>(null);
  const left = sizes[index];
  const pair = left + (sizes[index + 1] ?? 0);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const grid = event.currentTarget.parentElement;
    if (!grid) return;
    // Percentages are of the three panel columns: the grid minus padding and both splitters.
    const style = getComputedStyle(grid);
    const width =
      grid.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight) -
      2 * event.currentTarget.offsetWidth;
    drag.current = { x: event.clientX, sizes, width };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.dataset.resizing = "";
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.width <= 0) return;
    const delta = ((event.clientX - start.x) / start.width) * 100;
    onChange(moveSplitter(start.sizes, index, delta));
  };

  const end = () => {
    drag.current = null;
    delete document.body.dataset.resizing;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEYBOARD_STEP * 5 : KEYBOARD_STEP;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onChange(moveSplitter(sizes, index, event.key === "ArrowLeft" ? -step : step));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onChange(moveSplitter(sizes, index, event.key === "Home" ? -100 : 100));
    } else if (event.key === "Enter") {
      event.preventDefault();
      onReset();
    }
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(left)}
      aria-valuemin={MIN_COLUMN}
      aria-valuemax={Math.round(pair - MIN_COLUMN)}
      title="Drag to resize. Double-click to reset."
      data-testid="resize-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative hidden cursor-col-resize touch-none justify-center outline-none lg:flex",
      )}
    >
      <span
        aria-hidden="true"
        className="h-full w-px bg-transparent transition-colors group-hover:bg-border-strong group-focus-visible:bg-accent group-active:bg-accent"
      />
      <span
        aria-hidden="true"
        className="absolute top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-fg-muted group-focus-visible:bg-accent group-active:bg-accent"
      />
    </div>
  );
}
