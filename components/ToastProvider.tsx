"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "warning" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toastIcons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
    error: <XCircle className="w-4 h-4 text-rose-600 shrink-0" />,
    info: <Info className="w-4 h-4 text-indigo-600 shrink-0" />,
  };

  const toastStyles = {
    success: "border-emerald-200/80 bg-white text-slate-900 shadow-dropdown",
    warning: "border-amber-200/80 bg-white text-slate-900 shadow-dropdown",
    error: "border-rose-200/80 bg-white text-slate-900 shadow-dropdown",
    info: "border-indigo-200/80 bg-white text-slate-900 shadow-dropdown",
  };

  const badgeBackgrounds = {
    success: "bg-emerald-50 border-emerald-100",
    warning: "bg-amber-50 border-amber-100",
    error: "bg-rose-50 border-rose-100",
    info: "bg-indigo-50 border-indigo-100",
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-card backdrop-blur-md transition-all duration-200 animate-slide-in",
              toastStyles[t.type]
            )}
          >
            <div
              className={cn(
                "w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 mt-0.5",
                badgeBackgrounds[t.type]
              )}
            >
              {toastIcons[t.type]}
            </div>

            <div className="flex-1 text-xs">
              <div className="font-bold text-slate-900">{t.title}</div>
              {t.message && (
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-normal">
                  {t.message}
                </div>
              )}
            </div>

            <button
              onClick={() => removeToast(t.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
