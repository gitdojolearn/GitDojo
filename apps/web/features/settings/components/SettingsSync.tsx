"use client";

import { useEffect } from "react";
import { applyMotion, readSettings, subscribeSettings } from "../services/settings";

/**
 * Keeps every page on the learner's animation speed: re-applies the saved choice after hydration
 * and follows changes made in other tabs.
 */
export function SettingsSync() {
  useEffect(() => {
    applyMotion(readSettings().motion);
    return subscribeSettings(() => undefined);
  }, []);
  return null;
}
