/** Set once the intro has started, so it plays on a visitor's first landing-page visit only. */
export const SPLASH_SEEN_KEY = "gitdojo:intro-seen";

/** On <html> while the intro shows: "play", "static" (reduced motion) or "skip" (fading out). */
export const SPLASH_ATTRIBUTE = "data-splash";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Runs in <head> before the first paint, like THEME_SCRIPT, and decides whether the intro shows:
 * only on the landing page itself (never on a deep link, including `/#section`), and only for a
 * visitor who hasn't seen it. The flag is written straight away, so a reload mid-intro doesn't
 * replay it. Without storage, or without JavaScript, the page simply opens with no intro.
 */
export const SPLASH_SCRIPT = `(function(){try{var l=location,d=document.documentElement;if(l.pathname!=="/"||l.hash)return;if(localStorage.getItem(${JSON.stringify(SPLASH_SEEN_KEY)}))return;localStorage.setItem(${JSON.stringify(SPLASH_SEEN_KEY)},"1");d.setAttribute(${JSON.stringify(SPLASH_ATTRIBUTE)},matchMedia(${JSON.stringify(REDUCED_MOTION_QUERY)}).matches?"static":"play");}catch(e){}})();`;
