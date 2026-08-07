/**
 * Decides whether the Assembly intro plays — BEFORE the first paint.
 *
 * This is a blocking inline script on purpose. The overlay has to be
 * covering the page on frame one; if the decision waits for React to
 * hydrate and run an effect, the browser has already painted the homepage
 * and the visitor sees it flash before the intro drops over it. That single
 * frame is the difference between "an intro" and "a page that stutters".
 *
 * It stamps `data-intro="playing" | "done"` on <html>, which the rules in
 * globals.css act on. Same technique a no-flash theme switcher uses, and
 * for the same reason.
 *
 * It also OWNS the once-per-session write. Doing it here rather than in the
 * component means a visitor who navigates away mid-intro still doesn't get
 * it again on the next page.
 *
 * `?intro=1` forces a replay — this exists so the intro can actually be
 * reviewed. Without it the thing is unwatchable after the first load, which
 * is precisely the trap this component was written to get out of.
 */

const SCRIPT = `(function(){
  var d = document.documentElement;
  try {
    var path = location.pathname.replace(/\\/+$/, "");
    var isHome = path === "" || /^\\/(en|ar)$/.test(path);
    if (new URLSearchParams(location.search).get("intro") === "1" && isHome) {
      d.setAttribute("data-intro", "playing");
      return;
    }
    var c = navigator.connection || {};
    var blocked =
      !isHome ||
      sessionStorage.getItem("ac_intro_played") ||
      (Number(localStorage.getItem("ac_intro_skip_until")) > Date.now()) ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      c.saveData === true ||
      c.effectiveType === "2g" ||
      c.effectiveType === "slow-2g" ||
      (navigator.deviceMemory !== undefined && navigator.deviceMemory < 4);
    if (blocked) {
      d.setAttribute("data-intro", "done");
    } else {
      d.setAttribute("data-intro", "playing");
      sessionStorage.setItem("ac_intro_played", "1");
    }
  } catch (e) {
    // Any storage/API failure must fail OPEN — showing the site beats
    // trapping the visitor behind an overlay that may never animate.
    d.setAttribute("data-intro", "done");
  }
})();`;

/**
 * `nonce` comes from the middleware via the `x-nonce` request header. It is
 * required, not optional: under the CSP in docs/04 §24.1 an inline script
 * without one is blocked, `data-intro` is never stamped, and the rules in
 * globals.css that depend on it never fire.
 */
export function IntroGate({ nonce }: { nonce: string | undefined }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
