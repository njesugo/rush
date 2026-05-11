import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "neutral" | "success" | "warning" | "danger" | "info";

const colorMap: Record<Variant, string> = {
  neutral: "bg-surface-2 text-text-body border-border",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  info: "bg-info/10 text-info border-info/20",
};

const dotMap: Record<Variant, string> = {
  neutral: "bg-text-subtle",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function StatusBadge({
  variant = "neutral",
  children,
  withDot = true,
  className,
}: {
  variant?: Variant;
  children: React.ReactNode;
  withDot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        colorMap[variant],
        className
      )}
    >
      {withDot && <span className={cn("h-1.5 w-1.5 rounded-full", dotMap[variant])} />}
      {children}
    </span>
  );
}
