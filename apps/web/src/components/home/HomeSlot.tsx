import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type HomeSlotProps = {
  label: string;
  className?: string;
  minHeightClassName?: string;
  children?: ReactNode;
};

/** Slot vazio do painel — placeholder para widgets futuros. */
export function HomeSlot({
  label,
  className,
  minHeightClassName = "min-h-[7.5rem]",
  children,
}: HomeSlotProps) {
  return (
    <div
      className={cn(
        "surface-card-glass flex flex-col",
        minHeightClassName,
        className,
      )}
    >
      {children ?? (
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
