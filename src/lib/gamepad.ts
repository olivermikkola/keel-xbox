export type NavDirection = "up" | "down" | "left" | "right";

export type GamepadButtonAction =
  | "activate"
  | "back"
  | "actionX"
  | "actionY"
  | "prevTab"
  | "nextTab"
  | "menu";

export type GamepadStatus = {
  connected: boolean;
  label: string;
};

/**
 * Finds the best spatial focus target in `direction` relative to `current`
 * among `candidates` using center-to-center distance weighted toward alignment
 * along the movement axis (standard 10-foot Xbox XY spatial navigation).
 */
export function findSpatialTarget(
  current: HTMLElement | null,
  candidates: HTMLElement[],
  direction: NavDirection,
): HTMLElement | null {
  if (candidates.length === 0) return null;
  if (!current || !candidates.includes(current)) {
    return direction === "up" || direction === "left"
      ? candidates[candidates.length - 1]!
      : candidates[0]!;
  }

  const cur = current.getBoundingClientRect();
  const cx = cur.left + cur.width / 2;
  const cy = cur.top + cur.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const el of candidates) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const dx = ex - cx;
    const dy = ey - cy;

    let primary = 0;
    let secondary = 0;

    if (direction === "right") {
      if (dx <= 6) continue;
      primary = dx;
      secondary = Math.abs(dy);
    } else if (direction === "left") {
      if (dx >= -6) continue;
      primary = -dx;
      secondary = Math.abs(dy);
    } else if (direction === "down") {
      if (dy <= 6) continue;
      primary = dy;
      secondary = Math.abs(dx);
    } else if (direction === "up") {
      if (dy >= -6) continue;
      primary = -dy;
      secondary = Math.abs(dx);
    }

    // Weight off-axis deviation more strongly so rows/columns feel crisp
    const score = primary + secondary * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  // Fallback linear step for pure lists when no geometric neighbor exists
  if (!best) {
    const idx = candidates.indexOf(current);
    if (direction === "down" || direction === "right") {
      return candidates[(idx + 1) % candidates.length] ?? null;
    }
    return candidates[(idx - 1 + candidates.length) % candidates.length] ?? null;
  }

  return best;
}

export function getActiveGamepadStatus(): GamepadStatus {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return { connected: false, label: "Keyboard / Mouse" };
  }
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad && pad.connected) {
      const clean = pad.id.replace(/\s*\(.*?\)\s*/g, "").trim();
      return {
        connected: true,
        label: clean || "Xbox Controller",
      };
    }
  }
  return { connected: false, label: "Keyboard / Mouse" };
}
