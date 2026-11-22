import { useEffect, useRef } from 'react';

interface ScrollProgressBarProps {
  reducedMotion: boolean;
}

export function ScrollProgressBar({ reducedMotion }: ScrollProgressBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reducedMotion) return;

    let rafId = 0;

    const updateProgress = () => {
      rafId = 0;
      const bar = barRef.current;
      if (!bar) return;

      const docEl = document.documentElement;
      const maxScroll = docEl.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(Math.max(window.scrollY / maxScroll, 0), 1) : 0;
      bar.style.transform = `scaleX(${progress})`;
    };

    const scheduleUpdate = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none"
    >
      <div
        ref={barRef}
        style={{ transform: 'scaleX(0)', transformOrigin: 'left center' }}
        className="w-full h-full bg-[#2558d6] will-change-transform"
      />
    </div>
  );
}
