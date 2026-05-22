/**
 * useStableWindowDimensions
 *
 * Android-cold-start fix for the "app looks zoomed in after an update" bug.
 *
 * Root cause: many screens/components capture `Dimensions.get('window')` at
 * module-evaluation time and derive layout / render scale from it (e.g.
 * `RaceCanvas.tsx` does `SCALE = SW / ENGINE_W`). On the very first cold start
 * after an Android app update, the JS bundle can evaluate before the Android
 * activity window has been fully measured, so `Dimensions.get('window')`
 * returns stale/incorrect values. Everything is then sized against a wrong
 * width => the whole UI appears zoomed. The next launch reads the correct
 * window size, which is why "close and reopen" fixes it.
 *
 * This hook reports whether the window dimensions have settled. The root
 * layout uses it to delay rendering the navigator (and therefore delay the
 * lazy import — and module evaluation — of route screen modules) until the
 * window has reported a consistent size. Route modules that capture
 * `Dimensions.get('window')` at import time then capture the correct value.
 */
import { useEffect, useRef, useState } from 'react';
import { Dimensions } from 'react-native';

/** Number of consecutive frames the dimensions must be unchanged to count as
 *  "stable". A change event resets the counter. */
const STABLE_TICKS = 2;

/** Hard cap so we never block the UI indefinitely if no change event fires
 *  (the common case: dimensions were already correct). */
const MAX_WAIT_MS = 1200;

export function useStableWindowDimensions(): boolean {
  const [stable, setStable] = useState(false);
  const lastSize = useRef<{ w: number; h: number } | null>(null);
  const ticks = useRef(0);

  useEffect(() => {
    if (stable) return;

    let cancelled = false;
    let rafId: ReturnType<typeof requestAnimationFrame> | number | null = null;

    const sample = () => {
      const { width, height } = Dimensions.get('window');
      const prev = lastSize.current;
      // Ignore obviously-not-ready (zero) sizes.
      if (width <= 0 || height <= 0) {
        lastSize.current = { w: width, h: height };
        ticks.current = 0;
      } else if (prev && prev.w === width && prev.h === height) {
        ticks.current += 1;
      } else {
        lastSize.current = { w: width, h: height };
        ticks.current = 0;
      }

      if (ticks.current >= STABLE_TICKS) {
        if (!cancelled) setStable(true);
        return;
      }
      rafId = requestAnimationFrame(sample);
    };

    // React to OS-reported metric changes (the event Android fires once the
    // window is properly measured). Each change resets the stability counter.
    const sub = Dimensions.addEventListener('change', () => {
      ticks.current = 0;
      lastSize.current = null;
    });

    // Safety net: never block longer than MAX_WAIT_MS.
    const timeout = setTimeout(() => {
      if (!cancelled) setStable(true);
    }, MAX_WAIT_MS);

    rafId = requestAnimationFrame(sample);

    return () => {
      cancelled = true;
      sub.remove();
      clearTimeout(timeout);
      if (rafId != null) cancelAnimationFrame(rafId as number);
    };
  }, [stable]);

  return stable;
}
