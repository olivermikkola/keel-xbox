import { cn } from "@/lib/utils";

type ButtonKind = "A" | "B" | "X" | "Y" | "LB" | "RB" | "RT";

const BADGE_STYLE: Record<ButtonKind, string> = {
  A: "border-[#36b394]/65 bg-[#36b394]/20 text-[#76dfc2]",
  B: "border-[#dc7648]/65 bg-[#dc7648]/20 text-[#f09467]",
  X: "border-[#3f82b5]/60 bg-[#3f82b5]/18 text-[#8bc8f0]",
  Y: "border-[#d7b67a]/55 bg-[#d7b67a]/18 text-[#f2d699]",
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
