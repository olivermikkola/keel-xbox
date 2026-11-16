import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical Keel sail mark (jade leading surface + rust underside along one curve).
 * Matches docs/brand/mark.svg across Keel CLI, Desktop, and Mobile.
 */
export function KeelMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const jadeId = `keel-jade-${uid}`;
  const rustId = `keel-rust-${uid}`;

  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={jadeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#acd0c0" />
          <stop offset="100%" stopColor="#507e74" />
        </linearGradient>
        <linearGradient id={rustId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#613c30" />
          <stop offset="100%" stopColor="#c77851" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${rustId})`}
        d="M86 426C214 357 316 367 426 391V252C418 337 231 336 86 426Z"
      />
      <path
        fill={`url(#${jadeId})`}
        d="M86 426L426 86V252C426 328 304 324 203 367C157 386 118 408 86 426Z"
      />
    </svg>
  );
}

/**
 * Signature Keel hero sail field — matches Keel Desktop & Mobile welcome screens:
 * quiet deep jade wedge + warm rust underside anchored at bottom-right.
 */
export function KeelSailBackdrop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      preserveAspectRatio="xMaxYMax slice"
      aria-hidden="true"
      className={cn("pointer-events-none select-none", className)}
    >
      <path
        fill="#4f2f21"
        opacity="0.88"
        d="M72 444C212 364 328 372 512 404V238C446 338 242 336 72 444Z"
      />
      <path
        fill="#163029"
        opacity="0.92"
        d="M72 444L512 48V238C454 328 312 326 202 374C152 396 108 422 72 444Z"
      />
    </svg>
  );
}
