import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "sm", loading = false, disabled, children, icon, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";

    const sizeStyles = {
      xs: "text-xs px-2.5 py-1.5 rounded-lg gap-1.5 h-7",
      sm: "text-xs px-3.5 py-2 rounded-lg gap-2 h-9",
      md: "text-sm px-4 py-2.5 rounded-xl gap-2 h-10",
      lg: "text-sm px-5 py-3 rounded-xl gap-2.5 h-12 font-semibold",
    };

    const variantStyles = {
      primary:
        "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 shadow-sm shadow-indigo-600/20 border border-transparent",
      secondary:
        "bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 border border-slate-200/60 shadow-xs",
      outline:
        "bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-xs hover:border-slate-400",
      ghost:
        "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent",
      danger:
        "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 shadow-sm shadow-rose-600/20 border border-transparent",
      success:
        "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 shadow-sm shadow-emerald-600/20 border border-transparent",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

