import React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "working"
  | "weekly_off"
  | "leave"
  | "holiday"
  | "comp_off"
  | "unassigned"
  | "blocking"
  | "warning"
  | "success"
  | "info"
  | "draft"
  | "published"
  | "pending"
  | "rejected"
  | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "neutral",
  size = "md",
  dot = false,
  children,
  ...props
}) => {
  const sizeStyles = {
    sm: "text-[10px] px-1.5 py-0.5 rounded gap-1 font-medium",
    md: "text-xs px-2.5 py-0.5 rounded-full gap-1.5 font-medium",
  };

  const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
    working: {
      container: "bg-indigo-50 text-indigo-700 border border-indigo-200/80 font-semibold",
      dot: "bg-indigo-600",
    },
    weekly_off: {
      container: "bg-slate-100 text-slate-700 border border-slate-200",
      dot: "bg-slate-400",
    },
    leave: {
      container: "bg-amber-50 text-amber-800 border border-amber-200 font-semibold",
      dot: "bg-amber-500",
    },
    holiday: {
      container: "bg-rose-50 text-rose-700 border border-rose-200",
      dot: "bg-rose-500",
    },
    comp_off: {
      container: "bg-teal-50 text-teal-700 border border-teal-200 font-semibold",
      dot: "bg-teal-500",
    },
    unassigned: {
      container: "bg-slate-50 text-slate-400 border border-slate-200/60 dashed",
      dot: "bg-slate-300",
    },
    blocking: {
      container: "bg-rose-50 text-rose-700 border border-rose-200 font-bold uppercase tracking-wider text-[10px]",
      dot: "bg-rose-600",
    },
    warning: {
      container: "bg-amber-50 text-amber-700 border border-amber-200 font-semibold",
      dot: "bg-amber-500",
    },
    success: {
      container: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold",
      dot: "bg-emerald-600",
    },
    info: {
      container: "bg-blue-50 text-blue-700 border border-blue-200",
      dot: "bg-blue-600",
    },
    draft: {
      container: "bg-amber-50 text-amber-700 border border-amber-200 font-semibold",
      dot: "bg-amber-500",
    },
    published: {
      container: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold",
      dot: "bg-emerald-600",
    },
    pending: {
      container: "bg-amber-50 text-amber-800 border border-amber-200 font-semibold",
      dot: "bg-amber-500",
    },
    rejected: {
      container: "bg-rose-50 text-rose-700 border border-rose-200",
      dot: "bg-rose-600",
    },
    neutral: {
      container: "bg-slate-100 text-slate-700 border border-slate-200",
      dot: "bg-slate-400",
    },
  };

  const style = variantStyles[variant] || variantStyles.neutral;

  return (
    <span
      className={cn(
        "inline-flex items-center shrink-0 transition-colors",
        sizeStyles[size],
        style.container,
        className
      )}
      {...props}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot)} />}
      {children}
    </span>
  );
};

