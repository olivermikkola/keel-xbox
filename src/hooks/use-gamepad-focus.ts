"use client";

import { useCallback, useEffect, useState } from "react";

type Options = {
  count: number;
  enabled?: boolean;
  columns?: number;
  onActivate?: (index: number) => void;
};

/**
 * D-pad / arrow-key focus for 10-foot UI. Gamepad buttons map via KeyboardEvent
 * polyfills in Edge on Xbox; arrow keys cover desktop preview.
 */
export function useGamepadFocus({
  count,
  enabled = true,
  columns = 1,
  onActivate,
}: Options) {
  const [index, setIndex] = useState(0);
  const clampedIndex = Math.min(index, Math.max(count - 1, 0));

  const move = useCallback(
    (delta: number) => {
      if (count <= 0) return;
      setIndex((i) => (Math.min(i, count - 1) + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        move(columns);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-columns);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate?.(clampedIndex);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, move, columns, onActivate, clampedIndex]);

  return { index: clampedIndex, setIndex };
}
