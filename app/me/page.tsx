"use client";

import React, { useState } from "react";
import useSWR from "swr";
import {
  Calendar as CalendarIcon,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EmployeePortalPage() {
  const { showToast } = useToast();
  const currentMonth = "2026-11";

  // SWR for employee's leaves
  const { data: leavesData, mutate: mutateLeaves } = useSWR("/api/leaves", fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  });

  // SWR for employee's own schedule
  const { data: scheduleData, mutate: mutateSchedule } = useSWR(
    `/api/assistant`,
    (url) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "get my schedule", month: currentMonth }),
      }).then((res) => res.json()),
    {
      refreshInterval: 20000,
      revalidateOnFocus: true,
    }
  );

  // Leave Request Form State
  const [startDate, setStartDate] = useState("2026-11-20");
  const [endDate, setEndDate] = useState("2026-11-21");
  const [leaveType, setLeaveType] = useState<"planned" | "sick" | "other">("planned");
  const [reason, setReason] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLeave(true);

    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          type: leaveType,
          reason,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        showToast({
          type: "success",
          title: "Leave Request Submitted",
          message: "Your leave request is now pending review by your manager / pod lead.",
        });
        setReason("");
        mutateLeaves();
      } else {
        showToast({
          type: "error",
          title: "Submission Failed",
          message: json.error || "Failed to submit request",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
    } finally {
      setSubmittingLeave(false);
    }
  };

  const scheduleList = scheduleData?.data?.schedule || [];
  const leavesList = leavesData?.leaves || [];

  const workingShifts = scheduleList.filter((s: any) => s.status === "working");
  const weeklyOffs = scheduleList.filter((s: any) => s.status === "weekly_off");
  const approvedLeaves = scheduleList.filter((s: any) => s.status === "leave");

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md">
        <h1 className="text-xl font-bold tracking-tight">Your November 2026 Roster</h1>
        <p className="text-xs text-slate-300 mt-1">
          Review your assigned brand shifts, weekly offs, and request planned leaves.
        </p>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10">
            <span className="text-[11px] text-slate-300 block font-medium">Working Shifts</span>
            <span className="text-xl font-bold text-cyan-300 mt-0.5 block">{workingShifts.length} days</span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10">
            <span className="text-[11px] text-slate-300 block font-medium">Weekly Offs</span>
            <span className="text-xl font-bold text-slate-200 mt-0.5 block">{weeklyOffs.length} days</span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10">
            <span className="text-[11px] text-slate-300 block font-medium">Approved Leave</span>
            <span className="text-xl font-bold text-amber-300 mt-0.5 block">{approvedLeaves.length} days</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Calendar on Left, Request Form on Right */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Calendar / Shift Schedule (2 cols) */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-indigo-600" /> Daily Shift Calendar
            </h2>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-indigo-600 inline-block" /> Working
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-slate-300 inline-block" /> Off
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-amber-400 inline-block" /> Leave
              </span>
            </div>
          </div>

          {scheduleList.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
              Roster for November 2026 is being finalized by operations management.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
              {scheduleList.map((item: any) => {
                const isWorking = item.status === "working";
                const isOff = item.status === "weekly_off";
                const isLeave = item.status === "leave";
                const isHol = item.status === "holiday";

                return (
                  <div
                    key={item.date}
                    className={`p-3 rounded-xl border flex flex-col justify-between min-h-[72px] transition-all ${
                      isWorking
                        ? "bg-indigo-50/80 border-indigo-200 text-indigo-950"
                        : isOff
                        ? "bg-slate-50 border-slate-200 text-slate-700"
                        : isLeave
                        ? "bg-amber-50 border-amber-300 text-amber-950"
                        : isHol
                        ? "bg-rose-50 border-rose-200 text-rose-950"
                        : "bg-slate-50/50 border-slate-100 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span>{item.date.slice(5)}</span>
                      <span
                        className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                          isWorking
                            ? "bg-indigo-600 text-white"
                            : isOff
                            ? "bg-slate-200 text-slate-700"
                            : isLeave
                            ? "bg-amber-400 text-amber-950"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {item.status === "weekly_off" ? "Off" : item.status}
                      </span>
                    </div>

                    <div className="mt-1">
                      {isWorking && item.brand_name && (
                        <div className="text-[10px] text-indigo-700 truncate font-semibold">
                          {item.brand_name} ({item.process_code})
                        </div>
                      )}
                      {item.notes && <div className="text-[10px] text-slate-500 truncate">{item.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Leave Request Form (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-cyan-600" /> Request Leave
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Creates a pending request for your pod lead</p>
          </div>

          <form onSubmit={handleLeaveSubmit} className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">End Date</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Leave Type</label>
              <select
                value={leaveType}
                onChange={(e: any) => setLeaveType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="planned">Planned Leave</option>
                <option value="sick">Sick Leave</option>
                <option value="other">Other / Personal</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Reason (Optional)</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Family event, medical appointment, etc."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={submittingLeave}
              className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {submittingLeave ? "Submitting..." : "Submit Leave Request"}
            </button>
          </form>

          {/* Past Leaves Status */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h3 className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">
              Your Recent Requests
            </h3>
            {leavesList.length === 0 ? (
              <p className="text-[11px] text-slate-400">No requests submitted yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {leavesList.map((l: any) => (
                  <div key={l.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px]">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{l.start_date} to {l.end_date}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] uppercase ${
                          l.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : l.status === "rejected"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {l.status}
                      </span>
                    </div>
                    {l.reason && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{l.reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

