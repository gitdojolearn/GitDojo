"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_SETTINGS,
  readSettings,
  subscribeSettings,
  type Settings,
} from "../services/settings";

/** The learner's settings, re-rendering when they change here or in another tab. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, readSettings, () => DEFAULT_SETTINGS);
}
