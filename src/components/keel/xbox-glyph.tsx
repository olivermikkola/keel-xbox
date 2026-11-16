import { cn } from "@/lib/utils";

type ButtonKind = "A" | "B" | "X" | "Y" | "LB" | "RB" | "RT";

const BADGE_STYLE: Record<ButtonKind, string> = {
  A: "border-[#709c8f]/60 bg-[#709c8f]/18 text-[#acd0c0]",
  B: "border-[#c77851]/60 bg-[#c77851]/18 text-[#e59a74]",
  X: "border-[#7ea6c8]/50 bg-[#7ea6c8]/15 text-[#a8cde8]",
  Y: "border-[#d7b67a]/50 bg-[#d7b67a]/15 text-[#e6cca0]",
  LB: "border-white/20 bg-white/8 text-[color:var(--keel-foam)]",
  RB: "border-white/20 bg-white/8 text-[color:var(--keel-foam)]",
  RT: "border-white/20 bg-white/8 text-[color:var(--keel-foam)]",
};

export function XboxGlyph({
  button,
  label,
  className,
}: {
  button: ButtonKind;
  label?: string;
  className?: string;
}) {
  const isBumper = button === "LB" || button === "RB" || button === "RT";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center border font-mono text-[10px] font-semibold leading-none",
          isBumper ? "h-5 rounded-md px-1.5" : "size-5 rounded-full",
          BADGE_STYLE[button],
        )}
      >
        {button}
      </span>
      {label && (
        <span className="text-[11px] tracking-wide text-[color:var(--keel-muted)]">
          {label}
        </span>
      )}
    </span>
  );
}
