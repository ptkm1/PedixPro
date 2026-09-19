import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; label?: string };
  className?: string;
  onClick?: () => void;
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
  onClick,
}: StatCardProps) {
  const isPositive = trend ? trend.value >= 0 : true;

  return (
    <div
      className={cn(
        "surface-card-glass relative overflow-hidden p-5 transition-all",
        onClick && "cursor-pointer card-hover",
        className,
      )}
      onClick={onClick}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10" />
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          {trend ? (
            <div
              className={cn(
                "mt-2 flex items-center gap-1 text-sm font-medium",
                isPositive ? "text-primary" : "text-destructive",
              )}
            >
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>
                {isPositive ? "+" : ""}
                {trend.value}%
              </span>
              {trend.label ? (
                <span className="font-normal text-muted-foreground">{trend.label}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {Icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
