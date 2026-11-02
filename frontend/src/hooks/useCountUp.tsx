import { useEffect, useState } from "react";

export function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Count({ value, decimals = 0, suffix = "", prefix = "" }: { value: number; decimals?: number; suffix?: string; prefix?: string }) {
  const v = useCountUp(value);
  return <>{prefix}{v.toFixed(decimals)}{suffix}</>;
}
