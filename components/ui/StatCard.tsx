import React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  variant?: "primary" | "rose" | "amber" | "emerald" | "slate";
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "primary",
  className,
}) => {
  const variantStyles = {
    primary: {
      iconBg: "bg-indigo-50 border-indigo-100 text-indigo-600",
      accent: "text-indigo-600",
    },
    rose: {
      iconBg: "bg-rose-50 border-rose-100 text-rose-600",
      accent: "text-rose-600",
    },
    amber: {
      iconBg: "bg-amber-50 border-amber-100 text-amber-600",
      accent: "text-amber-600",
    },
    emerald: {
      iconBg: "bg-emerald-50 border-emerald-100 text-emerald-600",
      accent: "text-emerald-600",
    },
    slate: {
      iconBg: "bg-slate-100 border-slate-200 text-slate-600",
      accent: "text-slate-900",
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      className={cn(
        "bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
          {title}
        </span>
        <div
          className={cn(
            "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
            style.iconBg
          )}
        >
          {icon}
        </div>
      </div>

      <div className="mt-3">
        <div className={cn("text-2xl font-bold tracking-tight text-slate-900", style.accent)}>
          {value}
        </div>
        {subtitle && (
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
            {subtitle}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px]">
          {trend.isPositive ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
          )}
          <span
            className={cn(
              "font-semibold",
              trend.isPositive ? "text-emerald-600" : "text-rose-600"
            )}
          >
            {trend.value}
          </span>
          {trend.label && <span className="text-slate-400">{trend.label}</span>}
        </div>
      )}
    </div>
  );
};

