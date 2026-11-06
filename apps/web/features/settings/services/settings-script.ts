import { safeJsonForInlineScript } from "@/lib/inline-script";
import { SETTINGS_STORAGE_KEY } from "./settings";

/**
 * Runs in <head> before the first paint, so a learner who slowed or turned off animation never
 * sees one play at normal speed while the page loads. Mirrors `applyMotion`; anything unexpected
 * leaves normal speed in place.
 */
export const SETTINGS_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${safeJsonForInlineScript(SETTINGS_STORAGE_KEY)})||"{}");if(s&&(s.motion==="slow"||s.motion==="off"))document.documentElement.dataset.motion=s.motion;}catch(e){}})();`;
