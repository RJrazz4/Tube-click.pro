import { useRef, useCallback } from "react";

const CLICK_COUNT = 3;
const TIME_WINDOW = 2000;

export function useGhostTrigger(onTrigger: () => void) {
  const clickTimestamps = useRef<number[]>([]);

  const handleClick = useCallback(() => {
    const now = Date.now();
    clickTimestamps.current.push(now);

    // Keep only recent timestamps
    clickTimestamps.current = clickTimestamps.current.filter(
      (t) => now - t < TIME_WINDOW
    );

    if (clickTimestamps.current.length >= CLICK_COUNT) {
      clickTimestamps.current = [];
      onTrigger();
    }
  }, [onTrigger]);

  return handleClick;
}
