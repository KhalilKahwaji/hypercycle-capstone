import { useEffect, useState } from "react";

export default function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (typeof target !== "number" || isNaN(target) || target === 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let raf;
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
