"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  toast,
} from "@gitdojo/ui";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { usePaletteActions, type PaletteAction } from "@/features/palette";

export interface ResetLessonButtonProps {
  /** Only ask for confirmation when there is work to lose. */
  confirm: boolean;
  onReset: () => Promise<void>;
  disabled?: boolean;
  /** Confirmation wording; defaults describe resetting a lesson. */
  title?: string;
  description?: string;
  confirmLabel?: string;
  /** Shown once the reset is done. */
  doneMessage?: string;
}

export function ResetLessonButton({
  confirm,
  onReset,
  disabled,
  title = "Reset this lesson?",
  description = "The repository goes back to its starting state and your progress on this lesson is cleared.",
  confirmLabel = "Reset lesson",
  doneMessage = "Lesson reset. The repository is back to its starting state.",
}: ResetLessonButtonProps) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    try {
      await onReset();
      setOpen(false);
      toast({ title: doneMessage, tone: "success" });
    } finally {
      setResetting(false);
    }
  };

  const start = () => {
    if (confirm) setOpen(true);
    else void reset();
  };
  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      {
        id: "workspace-reset",
        group: "This page",
        label: confirmLabel,
        hint: "Start again from the beginning",
        keywords: "reset restart start over undo",
        disabled: Boolean(disabled) || resetting,
        run: start,
      },
    ],
    // `start` only reads the props and state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmLabel, disabled, resetting, confirm, onReset, doneMessage],
  );
  usePaletteActions(paletteActions);

  return (
    <>
      <Button variant="ghost" size="sm" disabled={disabled || resetting} onClick={start}>
        <RotateCcw /> <span className="max-sm:sr-only">Reset</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" disabled={resetting} onClick={() => void reset()}>
              <RotateCcw /> {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
