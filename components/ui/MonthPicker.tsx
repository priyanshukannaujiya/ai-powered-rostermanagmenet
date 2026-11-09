import React from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { formatMonthYear, getMonthOffset } from "@/lib/utils";

export interface MonthPickerProps {
  currentMonth: string;
  onMonthChange: (newMonth: string) => void;
  className?: string;
  showStepper?: boolean;
}

export const MonthPicker: React.FC<MonthPickerProps> = ({
  currentMonth,
  onMonthChange,
  className,
  showStepper = true,
}) => {
  const handlePrev = () => {
    onMonthChange(getMonthOffset(currentMonth, -1));
  };

  const handleNext = () => {
    onMonthChange(getMonthOffset(currentMonth, 1));
  };

  const months = [
    { value: "2026-09", label: "September 2026" },
    { value: "2026-10", label: "October 2026" },
    { value: "2026-11", label: "November 2026" },
    { value: "2026-12", label: "December 2026" },
    { value: "2027-01", label: "January 2027" },
  ];

  return (
    <div
      className={`inline-flex items-center gap-1 bg-white border border-slate-200/90 rounded-xl px-1.5 py-1 shadow-xs text-xs font-semibold text-slate-700 ${
        className || ""
      }`}
    >
      {showStepper && (
        <button
          type="button"
          onClick={handlePrev}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Previous Month"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="flex items-center gap-1.5 px-2">
        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
        <select
          value={currentMonth}
          onChange={(e) => onMonthChange(e.target.value)}
          className="bg-transparent border-none text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer py-0.5"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {showStepper && (
        <button
          type="button"
          onClick={handleNext}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Next Month"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

