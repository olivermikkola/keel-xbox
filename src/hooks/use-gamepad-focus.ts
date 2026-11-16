"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  findSpatialTarget,
  getActiveGamepadStatus,
  type GamepadStatus,
  type NavDirection,
} from "@/lib/gamepad";

type SpatialOptions = {
  containerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  onBack?: () => void;
  onActionX?: () => void;
  onActionY?: () => void;
  onPrevTab?: () => void;
  onNextTab?: () => void;
  onMenu?: () => void;
};

const STICK_DEADZONE = 0.34;
const REPEAT_INITIAL_MS = 340;
const REPEAT_INTERVAL_MS = 105;

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const all = Array.from(
    container.querySelectorAll<HTMLElement>("[data-keel-focus]"),
  );
  return all.filter((el) => {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
      return false;
    }
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export function useGamepadNavigation({
  containerRef,
  enabled = true,
  onBack,
  onActionX,
  onActionY,
  onPrevTab,
  onNextTab,
  onMenu,
}: SpatialOptions) {
  const [gamepadStatus, setGamepadStatus] = useState<GamepadStatus>({
    connected: false,
    label: "Keyboard / Mouse",
  });
  const activeElRef = useRef<HTMLElement | null>(null);
  const lastDirRef = useRef<NavDirection | null>(null);
  const lastDirRepeatAtRef = useRef<number>(0);
  const prevButtonsRef = useRef<boolean[]>([]);

  const applyFocusMarker = useCallback((el: HTMLElement | null) => {
    const prev = activeElRef.current;
    if (prev && prev !== el) {
      prev.removeAttribute("data-keel-active");
    }
    activeElRef.current = el;
    if (el) {
      el.setAttribute("data-keel-active", "true");
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, []);

  const moveFocus = useCallback(
    (direction: NavDirection) => {
      const candidates = getFocusableElements(containerRef.current);
      if (candidates.length === 0) return;

      const current =
        activeElRef.current && candidates.includes(activeElRef.current)
          ? activeElRef.current
          : document.activeElement instanceof HTMLElement &&
              candidates.includes(document.activeElement)
            ? document.activeElement
            : null;

      const next = findSpatialTarget(current, candidates, direction);
      if (next) {
        applyFocusMarker(next);
      }
    },
    [applyFocusMarker, containerRef],
  );

  const activateFocused = useCallback(() => {
    const candidates = getFocusableElements(containerRef.current);
    const current =
      activeElRef.current && candidates.includes(activeElRef.current)
        ? activeElRef.current
        : candidates[0] ?? null;
    if (!current) return;

    if (current.tagName === "TEXTAREA" || current.tagName === "INPUT") {
      current.focus();
      return;
    }
    current.click();
  }, [containerRef]);

  // Ensure initial focus sits on the primary focus element when view opens
  useEffect(() => {
    if (!enabled) return;
    const id = window.requestAnimationFrame(() => {
      const candidates = getFocusableElements(containerRef.current);
      if (candidates.length === 0) return;
      const preferred =
        candidates.find((el) => el.dataset.keelDefaultFocus === "true") ??
        candidates[0]!;
      applyFocusMarker(preferred);
    });
    return () => window.cancelAnimationFrame(id);
  }, [enabled, containerRef, applyFocusMarker]);

  // Sync pointer hover/focus into data-keel-active
  useEffect(() => {
    if (!enabled) return;
    const root = containerRef.current;
    if (!root) return;

    const onFocusIn = (e: FocusEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-keel-focus]",
      );
      if (target) applyFocusMarker(target);
    };

    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, [enabled, containerRef, applyFocusMarker]);

  // Keyboard navigation mirroring Xbox D-pad + bumpers
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if (e.key === "[") {
        if (!inEditable) {
          e.preventDefault();
          onPrevTab?.();
        }
        return;
      }
      if (e.key === "]") {
        if (!inEditable) {
          e.preventDefault();
          onNextTab?.();
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onBack?.();
        return;
      }

      if (inEditable) {
        if (e.key === "ArrowDown" && target instanceof HTMLInputElement) {
          e.preventDefault();
          moveFocus("down");
        } else if (e.key === "ArrowUp" && target instanceof HTMLInputElement) {
          e.preventDefault();
          moveFocus("up");
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveFocus("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveFocus("right");
      } else if (e.key === "Enter") {
        const focused = document.activeElement as HTMLElement | null;
        if (!focused || focused === document.body) {
          e.preventDefault();
          activateFocused();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, moveFocus, activateFocused, onBack, onPrevTab, onNextTab]);

  // Real Xbox Gamepad API polling loop
  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;

    const updateStatus = () => {
      const next = getActiveGamepadStatus();
      setGamepadStatus((prev) =>
        prev.connected === next.connected && prev.label === next.label
          ? prev
          : next,
      );
    };

    const tick = (now: number) => {
      const pads =
        typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
      const pad = Array.from(pads).find((p) => p && p.connected) ?? null;

      if (pad) {
        // Directional input: D-pad (12,13,14,15) + Left stick (0,1)
        const axX = pad.axes[0] ?? 0;
        const axY = pad.axes[1] ?? 0;
        let dir: NavDirection | null = null;
        if (pad.buttons[12]?.pressed || axY < -STICK_DEADZONE) dir = "up";
        else if (pad.buttons[13]?.pressed || axY > STICK_DEADZONE) dir = "down";
        else if (pad.buttons[14]?.pressed || axX < -STICK_DEADZONE) dir = "left";
        else if (pad.buttons[15]?.pressed || axX > STICK_DEADZONE) dir = "right";

        if (dir) {
          if (lastDirRef.current !== dir) {
            lastDirRef.current = dir;
            lastDirRepeatAtRef.current = now + REPEAT_INITIAL_MS;
            moveFocus(dir);
          } else if (now >= lastDirRepeatAtRef.current) {
            lastDirRepeatAtRef.current = now + REPEAT_INTERVAL_MS;
            moveFocus(dir);
          }
        } else {
          lastDirRef.current = null;
        }

        // Right stick Y (axis 3) scrolls the main scroll area smoothly
        const rightY = pad.axes[3] ?? 0;
        if (Math.abs(rightY) > 0.22) {
          const scroller = containerRef.current?.querySelector<HTMLElement>(
            "[data-keel-scroll]",
          );
          if (scroller) {
            scroller.scrollTop += rightY * 14;
          }
        }

        // Edge-triggered face buttons & bumpers
        const pressed = pad.buttons.map((b) => Boolean(b?.pressed));
        const justPressed = (idx: number) =>
          Boolean(pressed[idx] && !prevButtonsRef.current[idx]);

        if (justPressed(0)) activateFocused(); // A
        if (justPressed(1)) onBack?.(); // B
        if (justPressed(2)) onActionX?.(); // X
        if (justPressed(3)) onActionY?.(); // Y
        if (justPressed(4)) onPrevTab?.(); // LB
        if (justPressed(5)) onNextTab?.(); // RB
        if (justPressed(9)) onMenu?.(); // Menu

        prevButtonsRef.current = pressed;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    updateStatus();
    window.addEventListener("gamepadconnected", updateStatus);
    window.addEventListener("gamepaddisconnected", updateStatus);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("gamepadconnected", updateStatus);
      window.removeEventListener("gamepaddisconnected", updateStatus);
    };
  }, [
    enabled,
    containerRef,
    moveFocus,
    activateFocused,
    onBack,
    onActionX,
    onActionY,
    onPrevTab,
    onNextTab,
    onMenu,
  ]);

  return { gamepadStatus, moveFocus, activateFocused };
}
