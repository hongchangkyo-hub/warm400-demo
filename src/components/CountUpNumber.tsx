import { useEffect, useRef, useState } from 'react';

interface CountUpNumberProps {
  target: number;
  suffix?: string;
  active: boolean;
  delayMs?: number;
  durationMs?: number;
  reducedMotion: boolean;
}

export function CountUpNumber({
  target,
  suffix = '',
  active,
  delayMs = 0,
  durationMs = 750,
  reducedMotion,
}: CountUpNumberProps) {
  const [value, setValue] = useState<number>(reducedMotion ? target : 0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      return;
    }

    if (!active || startedRef.current) return;
    startedRef.current = true;

    let rafId = 0;
    let delayTimer = 0;

    const startAnimation = () => {
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(target * eased));

        if (progress < 1) {
          rafId = window.requestAnimationFrame(step);
        } else {
          setValue(target);
        }
      };

      rafId = window.requestAnimationFrame(step);
    };

    if (delayMs > 0) {
      delayTimer = window.setTimeout(startAnimation, delayMs);
    } else {
      startAnimation();
    }

    return () => {
      window.clearTimeout(delayTimer);
      window.cancelAnimationFrame(rafId);
    };
  }, [active, delayMs, durationMs, reducedMotion, target]);

  return (
    <span className="tabular-nums">
      {value}
      {suffix}
    </span>
  );
}
