import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        "p-10 text-center flex flex-col items-center justify-center max-w-sm mx-auto",
        className
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500 mb-3.5 shadow-xs">
        {icon}
      </div>
      <h4 className="text-sm font-bold text-slate-900 tracking-tight">{title}</h4>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
      {actionText && onAction && (
        <Button variant="secondary" size="xs" onClick={onAction} className="mt-4">
          {actionText}
        </Button>
      )}
    </div>
  );
};

