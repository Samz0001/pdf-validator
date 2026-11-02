import { useEffect, useState } from "react";

/** Tracks the `html.light` class set by the theme toggle, so charts can swap to their light-mode steps. */
export function useIsLight() {
  const read = () => document.documentElement.classList.contains("light");
  const [light, setLight] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setLight(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return light;
}
