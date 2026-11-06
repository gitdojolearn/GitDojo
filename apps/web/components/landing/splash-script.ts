import { safeJsonForInlineScript } from "@/lib/inline-script";

/** On <html> while the intro shows: "play", "static" (reduced motion) or "skip" (fading out). */
export const SPLASH_ATTRIBUTE = "data-splash";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Runs in <head> before the first paint, like THEME_SCRIPT, and decides whether the intro shows:
 * on each landing-page visit (never on a deep link, including `/#section`). It runs before paint
 * and does not depend on browser storage. Without JavaScript, the page simply opens with no intro.
 */
export const SPLASH_SCRIPT = `(function(){try{var l=location,d=document.documentElement;if(l.pathname!=="/"||l.hash)return;d.setAttribute(${safeJsonForInlineScript(SPLASH_ATTRIBUTE)},matchMedia(${safeJsonForInlineScript(REDUCED_MOTION_QUERY)}).matches?"static":"play");}catch(e){}})();`;
