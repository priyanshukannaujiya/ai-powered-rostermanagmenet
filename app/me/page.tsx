"use client";

import React, { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import {
  Calendar as CalendarIcon,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Sparkles,
  Building2,
  FileCheck,
  UserCheck,
  CalendarDays,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Coffee,
  Info,
  Bell,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, parseDateString, cn } from "@/lib/utils";
import { dashboardSWR, liveSWR, realtimeSWR } from "@/lib/swr-config";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/** Shape of one row from GET /api/me/schedule, mapped into the calendar view model. */
interface ScheduleView {
  cleanDate: string;
  dayNum: number;
  status: string;
  brand_name: string | null;
  brand_code: string | null;
  process_code: string | null;
  notes: string | null;
  pendingLeave: boolean;
  holidayName: string | null;
  assignments: Array<{ brandName: string | null; brandCode: string | null; processCode: string | null; notes: string | null }>;
}

interface ApiScheduleDay {
  date: string;
  dayNum: number;
  status: string;
  brandName: string | null;
  brandCode: string | null;
  processCode: string | null;
  notes: string | null;
  holidayName: string | null;
  pendingLeave: boolean;
  assignments?: Array<{ brandName: string | null; brandCode: string | null; processCode: string | null; notes: string | null }>;
}

interface ApiScheduleResponse {
  success?: boolean;
  month: string;
  employee?: { id: string; name: string; email: string; podName: string | null };
  schedule?: ApiScheduleDay[];
  summary?: {
    working: number;
    weeklyOff: number;
    leave: number;
    holiday: number;
    pendingLeave: number;
    unassigned: number;
  };
  error?: string;
}

export default function EmployeePortalPage() {
  const { showToast } = useToast();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = currentMonth.split("-").map(Number);
  const [viewMode, setViewMode] = useState<"calendar" | "agenda">("calendar");

  // Deterministic schedule: a direct DB read via GET /api/me/schedule.
  // No LLM round-trip, so approvals and reassignments appear immediately.
  const {
    data: scheduleData,
    mutate: mutateSchedule,
    isLoading: scheduleLoading,
    error: scheduleError,
  } = useSWR<ApiScheduleResponse>(
    `/api/me/schedule?month=${currentMonth}`,
    fetcher,
    liveSWR
  );

  const activeEmployeeId = scheduleData?.employee?.id || "session";

  // SWR for employee's leaves, isolated to the authenticated employee identity
  const { data: leavesData, mutate: mutateLeaves, isLoading: leavesLoading } = useSWR(
    `/api/leaves?emp=${activeEmployeeId}`,
    fetcher,
    dashboardSWR
  );

  // SWR for employee notifications (shift appointments & alerts), isolated by active employee
  const { data: notifData, mutate: mutateNotifs } = useSWR(
    `/api/notifications?emp=${activeEmployeeId}`,
    fetcher,
    liveSWR
  );

  // Revalidate schedule, leaves and notifications after any write anywhere.
  useEffect(() => {
    const handleRefresh = () => {
      mutateLeaves();
      mutateSchedule();
      mutateNotifs();
    };
    window.addEventListener("roster:refresh", handleRefresh);
    window.addEventListener("leave:refresh", handleRefresh);
    return () => {
      window.removeEventListener("roster:refresh", handleRefresh);
      window.removeEventListener("leave:refresh", handleRefresh);
    };
  }, [mutateLeaves, mutateSchedule, mutateNotifs]);

  const handleAcknowledgeNotification = async (notifId: string) => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", notificationId: notifId }),
      });
      mutateNotifs();
      showToast({ type: "success", title: "Acknowledged", message: "Notification marked as read." });
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
    }
  };

  // Leave Request Form State
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [leaveType, setLeaveType] = useState<"planned" | "sick" | "other">("planned");
  const [reason, setReason] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const allMonthDates = useMemo(() => {
    const dates: string[] = [];
    const [monthYear, monthIndex] = currentMonth.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(monthYear, monthIndex, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(`${currentMonth}-${String(day).padStart(2, "0")}`);
    }
    return dates;
  }, [currentMonth]);

  // The API already returns a gap-free calendar; map it into the view model.
  const rawScheduleList = Array.isArray(scheduleData?.schedule) ? scheduleData!.schedule! : [];

  const canonicalMonthShifts = useMemo<ScheduleView[]>(() => {
    const byDate = new Map<string, ScheduleView>();
    for (const day of rawScheduleList) {
      const parsed = parseDateString(day.date);
      if (!parsed || !parsed.dateStr.startsWith(currentMonth)) continue;
      byDate.set(parsed.dateStr, {
        cleanDate: parsed.dateStr,
        dayNum: parsed.day,
        status: day.status,
        brand_name: day.brandName,
        brand_code: day.brandCode,
        process_code: day.processCode,
        notes: day.notes,
        pendingLeave: Boolean(day.pendingLeave),
        holidayName: day.holidayName,
        assignments: day.assignments || [],
      });
    }
    // Defensive: guarantee one entry per calendar day even if a row is missing.
    return allMonthDates.map((dateStr) => {
      const existing = byDate.get(dateStr);
      if (existing) return existing;
      return {
        cleanDate: dateStr,
        dayNum: parseInt(dateStr.slice(8), 10),
        status: "unassigned",
        brand_name: null,
        brand_code: null,
        process_code: null,
        notes: null,
        pendingLeave: false,
        holidayName: null,
        assignments: [],
      };
    });
  }, [rawScheduleList, allMonthDates, currentMonth]);

  const workingShifts = canonicalMonthShifts.filter((s) => s.status === "working");
  const weeklyOffs = canonicalMonthShifts.filter((s) => s.status === "weekly_off");
  const approvedLeaves = canonicalMonthShifts.filter((s) => s.status === "leave");

  const employeeName =
    scheduleData?.employee?.name ||
    leavesData?.leaves?.[0]?.employee_name ||
    "Employee";
  const primaryBrand = workingShifts[0]?.brand_name || "No assigned brand";

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
          type: json.notificationWarning ? "warning" : "success",
          title: "Leave Request Submitted",
          message: json.notificationWarning || "Your leave request has been submitted to your pod lead for review.",
        });
        setReason("");
        // Force every employee-side cache to re-read the database.
        mutateLeaves();
        mutateNotifs();
        mutateSchedule();
        window.dispatchEvent(new CustomEvent("leave:refresh"));
      } else {
        showToast({
          type: "error",
          title: "Submission Blocked",
          message: json.error || "Failed to submit request",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
    } finally {
      setSubmittingLeave(false);
    }
  };

  const leavesList = leavesData?.leaves || [];

  const calendarDays = useMemo(() => {
    // 0 = Sunday, 1 = Monday ... 6 = Saturday
    const firstDayDow = new Date(year, monthNumber - 1, 1).getDay();
    // Create padding slots before day 1
    const padSlots = Array.from({ length: firstDayDow }).map((_, i) => null);
    return [...padSlots, ...canonicalMonthShifts];
  }, [canonicalMonthShifts, year, monthNumber]);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Real-Time Shift Appointment & Coverage Notifications Banner */}
      {notifData?.notifications && notifData.notifications.length > 0 && (
        <div className="space-y-3">
          {notifData.notifications.map((n: any) => (
            <div
              key={n.id}
              className={cn(
                "p-4 sm:p-5 rounded-3xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4",
                !n.read
                  ? "bg-gradient-to-r from-amber-50 via-amber-50/90 to-amber-100/80 border-amber-300 shadow-sm"
                  : "bg-slate-50 border-slate-200 opacity-90"
              )}
            >
              <div className="flex items-start sm:items-center gap-3.5">
                <div
                  className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                    !n.read ? "bg-amber-600 text-white shadow-amber-600/30" : "bg-slate-200 text-slate-600"
                  )}
                >
                  <Bell className={cn("w-5 h-5", !n.read && "animate-bounce")} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                        !n.read ? "bg-amber-200 text-amber-950 font-extrabold" : "bg-slate-200 text-slate-700"
                      )}
                    >
                      {n.title || "Shift Appointment"}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(n.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 mt-1">
                    {n.message}
                  </p>
                </div>
              </div>

              {!n.read && (
                <button
                  onClick={() => handleAcknowledgeNotification(n.id)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-all self-end sm:self-auto shrink-0 cursor-pointer"
                >
                  Acknowledge
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Account Linking / Schedule Error Alert */}
      {(scheduleData?.error || scheduleError) && (
        <div className="p-5 rounded-3xl bg-amber-50 border border-amber-200 text-amber-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Employee Profile Notice
              </h2>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                {scheduleData?.error || "Unable to load employee schedule. No active employee record is linked to your user account."}
                {" "}Please contact your operations manager to verify your employee profile association.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Welcome & KPI Hero Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-card p-6 sm:p-7 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-cyan-600 flex items-center justify-center text-white shadow-md shadow-cyan-600/30">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Welcome, {employeeName}
                </h1>
                <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="font-semibold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200/60">
                    {primaryBrand}
                  </span>
                  <span>•</span>
                  <span>{new Date(year, monthNumber - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })} Roster</span>
                </p>
              </div>
            </div>
          </div>

          {/* Quick Date Badge */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="px-3 py-1.5 bg-slate-100 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-xs">
              <CalendarIcon className="w-3.5 h-3.5 text-cyan-600" />
              <span>{allMonthDates.length} Days in {new Date(year, monthNumber - 1).toLocaleDateString(undefined, { month: "long" })}</span>
            </div>
          </div>
        </div>

        {/* Month Stats Grid (Accurate for 30 days) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6">
          <div className="p-4 rounded-2xl bg-cyan-50/60 border border-cyan-100/90">
            <span className="text-[11px] text-cyan-700 block font-semibold uppercase tracking-wider">
              Working Days
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-slate-900">{workingShifts.length}</span>
              <span className="text-xs text-slate-500">days</span>
            </div>
            <span className="text-[10px] text-cyan-600 mt-1 block font-medium">
              ~{workingShifts.length * 8} operating hours
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] text-slate-600 block font-semibold uppercase tracking-wider">
              Weekly Offs
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-slate-900">{weeklyOffs.length}</span>
              <span className="text-xs text-slate-500">days</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block font-medium">
              Mandatory rest periods
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100/90">
            <span className="text-[11px] text-amber-800 block font-semibold uppercase tracking-wider">
              Approved Leave
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-amber-950">{approvedLeaves.length}</span>
              <span className="text-xs text-amber-800">days</span>
            </div>
            <span className="text-[10px] text-amber-700 mt-1 block font-medium">
              Confirmed unavailabilities
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100/90">
            <span className="text-[11px] text-emerald-800 block font-semibold uppercase tracking-wider">
              Roster Status
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-bold text-emerald-950">
                {rawScheduleList.length > 0 ? "Loaded" : "No data"}
              </span>
            </div>
            <span className="text-[10px] text-emerald-700 mt-1 block font-medium">
              {rawScheduleList.length > 0 ? "Imported roster records" : "No roster records available"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Calendar / Agenda (2 cols), Right Leave Request (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Schedule */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle>My {new Date(year, monthNumber - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })} Schedule</CardTitle>
                <CardDescription>
                  Your assigned shifts, operating brand tasks, and weekly rest days
                </CardDescription>
              </div>

              {/* View Switcher & Legend */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setViewMode("calendar")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5",
                      viewMode === "calendar"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <CalendarDays className="w-3.5 h-3.5" /> Month
                  </button>
                  <button
                    onClick={() => setViewMode("agenda")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5",
                      viewMode === "agenda"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <ListFilter className="w-3.5 h-3.5" /> Agenda
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {scheduleLoading && !scheduleData ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : viewMode === "calendar" ? (
                /* True 7-Column Calendar View */
                <div className="space-y-2">
                  {/* Day of Week Headers */}
                  <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100">
                    <span className="text-amber-800">Sun</span>
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {calendarDays.map((item, idx) => {
                      if (!item) {
                        return (
                          <div
                            key={`empty-${idx}`}
                            className="min-h-[82px] rounded-xl bg-slate-50/30 border border-transparent"
                          />
                        );
                      }

                      const isWorking = item.status === "working";
                      const isOff = item.status === "weekly_off";
                      const isLeave = item.status === "leave";
                      const isHoliday = item.status === "holiday";

                      return (
                        <div
                          key={item.cleanDate}
                          className={cn(
                            "min-h-[88px] rounded-xl border p-2 flex flex-col justify-between transition-all group",
                            isWorking
                              ? "bg-indigo-50/60 border-indigo-200/80 hover:border-indigo-300"
                              : isOff
                              ? "bg-slate-50/80 border-slate-200/70 hover:border-slate-300"
                              : isLeave
                              ? "bg-amber-50/80 border-amber-200 hover:border-amber-300"
                              : isHoliday
                              ? "bg-rose-50/70 border-rose-200"
                              : "bg-white border-slate-200/60"
                          )}
                        >
                          {/* Day Number Header */}
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                "text-xs font-bold font-mono",
                                isWorking ? "text-indigo-950" : isOff ? "text-slate-500" : isLeave ? "text-amber-950" : "text-slate-700"
                              )}
                            >
                              {item.dayNum}
                            </span>
                            <span
                              className={cn(
                                "text-[9px] px-1 py-0.2 rounded font-bold uppercase",
                                isWorking
                                  ? "bg-indigo-600 text-white"
                                  : isOff
                                  ? "bg-slate-200 text-slate-600"
                                  : isLeave
                                  ? "bg-amber-400 text-amber-950"
                                  : "bg-slate-100 text-slate-400"
                              )}
                            >
                              {isWorking ? "Shift" : isOff ? "Off" : isLeave ? "Leave" : "-"}
                            </span>
                          </div>

                          {/* Shift Details Content */}
                          <div className="mt-1 space-y-0.5">
                            {isWorking && (
                              <div>
                                {item.notes && item.notes.toLowerCase().includes("appointed") ? (
                                  <div className="p-1 rounded-lg bg-amber-100/90 border border-amber-300 text-amber-950 text-[9px] font-bold leading-tight">
                                    <span className="block text-[8px] uppercase tracking-wider text-amber-800 font-extrabold flex items-center gap-0.5">
                                      ⭐ Appointed
                                    </span>
                                    <div className="truncate text-amber-900 font-bold" title={item.brand_name ?? undefined}>
                                      {item.brand_name || "Client"}
                                    </div>
                                    {item.process_code && (
                                      <span className="text-[8px] font-mono font-bold text-amber-800 bg-amber-200/90 px-1 py-0.2 rounded inline-block mt-0.5">
                                        {item.process_code}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <div className="text-[10px] font-bold text-indigo-900 truncate" title={item.brand_name ?? undefined}>
                                      {item.brand_name || "Assigned"}
                                    </div>
                                    {item.process_code && (
                                      <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-100/80 px-1 py-0.2 rounded inline-block">
                                        {item.process_code}
                                      </span>
                                    )}
                                  </>
                                )}
                                {(item.assignments || []).slice(1).map((assignment, index) => (
                                  <div key={`${assignment.brandCode || assignment.brandName || "brand"}-${assignment.processCode || index}`} className="mt-1 border-t border-indigo-100 pt-1">
                                    <div className="text-[10px] font-bold text-indigo-900 truncate" title={assignment.brandName || undefined}>
                                      {assignment.brandName || "Assigned"}
                                    </div>
                                    {assignment.processCode && (
                                      <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-100/80 px-1 rounded inline-block">
                                        {assignment.processCode}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {isOff && (
                              <span className="text-[10px] text-slate-400 font-medium block">
                                Rest Day
                              </span>
                            )}

                            {isLeave && (
                              <span className="text-[10px] text-amber-800 font-semibold block">
                                Approved
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Agenda List View */
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {canonicalMonthShifts.map((shift) => {
                    const isWorking = shift.status === "working";
                    const isOff = shift.status === "weekly_off";
                    const isLeave = shift.status === "leave";

                    return (
                      <div
                        key={shift.cleanDate}
                        className="py-3 px-2 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                              {new Date(year, monthNumber - 1).toLocaleDateString(undefined, { month: "short" })}
                            </span>
                            <span className="text-base font-bold text-slate-900 font-mono">
                              {shift.dayNum}
                            </span>
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span>
                                {isWorking
                                  ? shift.brand_name || "General Shift"
                                  : isOff
                                  ? "Weekly Off (Rest Day)"
                                  : isLeave
                                  ? "Approved Leave"
                                  : "Unassigned"}
                              </span>
                              {shift.process_code && (
                                <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.2 rounded font-bold">
                                  {shift.process_code}
                                </span>
                              )}
                              {shift.notes && shift.notes.toLowerCase().includes("appointed") && (
                                <span className="font-sans text-[10px] text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded-md font-bold flex items-center gap-1">
                                  ⭐ Appointed Backup
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {shift.notes && shift.notes.toLowerCase().includes("appointed")
                                ? shift.notes
                                : isWorking
                                ? "Full Day Operational Shift"
                                : "No active shifts scheduled"}
                            </div>
                          </div>
                        </div>

                        <Badge
                          variant={isWorking ? "working" : isOff ? "weekly_off" : isLeave ? "leave" : "neutral"}
                          size="sm"
                          dot
                        >
                          {isWorking ? "Working" : isOff ? "Weekly Off" : isLeave ? "Leave" : "Off"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Leave Request Form & Recent Requests */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Request Leave</CardTitle>
                <CardDescription>
                  Submits an unavailability request to your pod lead
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <form onSubmit={handleLeaveSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    min={today}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-800 shadow-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-800 shadow-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Leave Category
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e: any) => setLeaveType(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-800 cursor-pointer shadow-xs"
                  >
                    <option value="planned">Planned Annual / Casual Leave</option>
                    <option value="sick">Medical / Sick Leave</option>
                    <option value="other">Personal / Urgent Leave</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Reason (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Brief note for your pod lead..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder:text-slate-400 text-xs shadow-xs"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submittingLeave}
                  loading={submittingLeave}
                  variant="primary"
                  size="md"
                  className="w-full bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 shadow-cyan-600/20"
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  Submit Leave Request
                </Button>
              </form>

              {/* Past Leaves Status List */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <h4 className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">
                  Your Recent Requests
                </h4>
                {leavesList.length === 0 ? (
                  <p className="text-[11px] text-slate-400">No requests submitted yet.</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {leavesList.map((l: any) => {
                      const formattedStart = formatDate(l.start_date);
                      const formattedEnd = formatDate(l.end_date);
                      const dateRangeDisplay =
                        formattedStart === formattedEnd
                          ? formattedStart
                          : `${formattedStart} - ${formattedEnd}`;

                      return (
                        <div
                          key={l.id}
                          className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-[11px] space-y-1.5 shadow-xs"
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span className="font-mono text-slate-900 font-bold">
                              {dateRangeDisplay}
                            </span>
                            <Badge
                              variant={
                                l.status === "approved"
                                  ? "success"
                                  : l.status === "rejected"
                                  ? "rejected"
                                  : "pending"
                              }
                              size="sm"
                              dot
                            >
                              {l.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span className="capitalize">{l.type} leave</span>
                            {l.reason && (
                              <span className="text-slate-400 italic truncate max-w-[120px]">
                                "{l.reason}"
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
