import { useEffect, useRef, useState } from 'react';

export interface MotionPreferences {
  reducedMotion: boolean;
  isDesktop: boolean;
  canTilt: boolean;
}

export function useMotionPreferences(): MotionPreferences {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(min-width: 601px)').matches;
  });

  const [hasFinePointer, setHasFinePointer] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktopQuery = window.matchMedia('(min-width: 601px)');
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    const updateReduce = () => setReducedMotion(reduceQuery.matches);
    const updateDesktop = () => setIsDesktop(desktopQuery.matches);
    const updatePointer = () => setHasFinePointer(pointerQuery.matches);

    updateReduce();
    updateDesktop();
    updatePointer();

    reduceQuery.addEventListener('change', updateReduce);
    desktopQuery.addEventListener('change', updateDesktop);
    pointerQuery.addEventListener('change', updatePointer);

    return () => {
      reduceQuery.removeEventListener('change', updateReduce);
      desktopQuery.removeEventListener('change', updateDesktop);
      pointerQuery.removeEventListener('change', updatePointer);
    };
  }, []);

  return {
    reducedMotion,
    isDesktop,
    canTilt: !reducedMotion && isDesktop && hasFinePointer,
  };
}

export function useRevealOnce<T extends HTMLElement>(
  reducedMotion: boolean,
  threshold = 0.12,
) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }

    const node = ref.current;
    if (!node || revealed) return;

    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
            break;
          }
        }
      },
      {
        threshold,
        rootMargin: '0px 0px -32px 0px',
      },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [reducedMotion, revealed, threshold]);

  return { ref, visible: reducedMotion || revealed };
}
