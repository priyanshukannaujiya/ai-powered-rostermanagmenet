import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ className, hover = false, ...props }) => {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-slate-200/80 shadow-card transition-all duration-200",
        hover && "hover:shadow-card-hover hover:border-slate-300/90",
        className
      )}
      {...props}
    />
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  return (
    <div
      className={cn("p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-4", className)}
      {...props}
    />
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  ...props
}) => {
  return (
    <h3
      className={cn("text-sm sm:text-base font-bold text-slate-900 tracking-tight", className)}
      {...props}
    />
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className,
  ...props
}) => {
  return <p className={cn("text-xs text-slate-500 mt-0.5", className)} {...props} />;
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  return (
    <div
      className={cn("p-4 sm:p-5 bg-slate-50/50 border-t border-slate-100 rounded-b-2xl flex items-center justify-between", className)}
      {...props}
    />
  );
};

