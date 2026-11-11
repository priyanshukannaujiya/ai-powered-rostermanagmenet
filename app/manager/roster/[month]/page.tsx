"use client";

import React, { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Filter,
  RefreshCw,
  Send,
  AlertCircle,
  ShieldCheck,
  Check,
  X,
  Lock,
  Clock,
  ChevronRight,
  Info,
  Search,
  Sparkles,
  User,
  SlidersHorizontal,
  Download,
  Printer,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMonthYear, parseDateString, cn } from "@/lib/utils";
import { realtimeSWR } from "@/lib/swr-config";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function RosterGridPage({ params }: { params: { month: string } }) {
  const router = useRouter();
  const month = params.month || new Date().toISOString().slice(0, 7);
  const { showToast } = useToast();

  const { data, error, isLoading, mutate } = useSWR(
    `/api/roster/${month}`,
    fetcher,
    realtimeSWR
  );

  // Filters
  const [selectedPod, setSelectedPod] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchEmployee, setSearchEmployee] = useState<string>("");
  const [generating, setGenerating] = useState<boolean>(false);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    employeeId: string;
    employeeName: string;
    date: string;
    currentStatus: string;
    currentBpId?: string | null;
    isPinned?: boolean;
  } | null>(null);

  const [newStatus, setNewStatus] = useState<string>("working");
  const [newBpId, setNewBpId] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [isOverride, setIsOverride] = useState<boolean>(false);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string>("");
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Polling tracker for new conflicts notification
  const [lastConflictCount, setLastConflictCount] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setSecondsAgo((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen for live AI updates or cross-tab replan changes
  useEffect(() => {
    const handleRefresh = () => {
      mutate();
    };
    window.addEventListener("roster:refresh", handleRefresh);
    window.addEventListener("leave:refresh", handleRefresh);
    return () => {
      window.removeEventListener("roster:refresh", handleRefresh);
      window.removeEventListener("leave:refresh", handleRefresh);
    };
  }, [mutate]);

  useEffect(() => {
    if (data) {
      setSecondsAgo(0);
      const currentCount = data.conflicts?.length || 0;
      if (lastConflictCount !== null && currentCount > lastConflictCount) {
        showToast({
          type: "warning",
          title: "New Conflict Detected",
          message: `${currentCount - lastConflictCount} new schedule conflict(s) appeared after update.`,
        });
      }
      setLastConflictCount(currentCount);
    }
  }, [data, lastConflictCount, showToast]);

  const daysInMonth = useMemo(() => {
    const [yStr, mStr] = month.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const count = new Date(y, m, 0).getDate();
    const arr: string[] = [];
    for (let i = 1; i <= count; i++) {
      arr.push(`${month}-${String(i).padStart(2, "0")}`);
    }
    return arr;
  }, [month]);

  // Index days by `${employeeId}_${date}` with clean date normalization
  const dayGridMap = useMemo(() => {
    const map = new Map<string, any>();
    if (data?.days) {
      for (const d of data.days) {
        const parsed = parseDateString(d.date);
        const cleanDate = parsed ? parsed.dateStr : String(d.date).slice(0, 10);
        map.set(`${d.employee_id}_${cleanDate}`, {
          ...d,
          date: cleanDate,
        });
      }
    }
    return map;
  }, [data]);

  // Daily Headcount Totals for Footer (with clean date parsing)
  const dailyHeadcounts = useMemo(() => {
    const counts = new Map<string, { working: number; off: number; leave: number }>();
    for (const d of daysInMonth) {
      counts.set(d, { working: 0, off: 0, leave: 0 });
    }
    if (data?.days) {
      for (const cell of data.days) {
        const parsed = parseDateString(cell.date);
        const cleanDate = parsed ? parsed.dateStr : String(cell.date).slice(0, 10);
        const current = counts.get(cleanDate);
        if (current) {
          if (cell.status === "working") current.working += 1;
          else if (cell.status === "weekly_off") current.off += 1;
          else if (cell.status === "leave") current.leave += 1;
        }
      }
    }
    return counts;
  }, [data, daysInMonth]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    if (!data?.meta?.employees) return [];
    return data.meta.employees.filter((emp: any) => {
      if (selectedPod !== "ALL" && emp.pod_id !== selectedPod) return false;
      if (
        searchEmployee.trim() &&
        !emp.name.toLowerCase().includes(searchEmployee.toLowerCase()) &&
        !emp.email?.toLowerCase().includes(searchEmployee.toLowerCase())
      )
        return false;
      if (statusFilter !== "ALL") {
        // Check if employee has at least one cell matching statusFilter
        const hasStatus = daysInMonth.some((d) => {
          const cell = dayGridMap.get(`${emp.id}_${d}`);
          return cell?.status === statusFilter;
        });
        if (!hasStatus) return false;
      }
      return true;
    });
  }, [data, selectedPod, searchEmployee, statusFilter, daysInMonth, dayGridMap]);

  const handleGenerateRoster = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/roster/${month}`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        showToast({
          type: (json.conflictsCount ?? 0) > 0 ? "warning" : "success",
          title: (json.conflictsCount ?? 0) > 0 ? "Roster generated with conflicts" : "Roster generated",
          message: `Generated schedule for ${formatMonthYear(month)} with ${json.conflictsCount ?? 0} conflict(s). Review all conflicts before publishing.`,
        });
        mutate();
        window.dispatchEvent(new CustomEvent("roster:refresh"));
      } else {
        showToast({
          type: "error",
          title: "Generation Failed",
          message: json.error || "Failed to generate roster",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Network Error", message: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const exportRows = useMemo(() => {
    if (!data?.days || !data?.meta?.employees) return [];
    const employeeMap = new Map((data.meta.employees || []).map((emp: any) => [emp.id, emp]));
    const rows: Array<{ date: string; employee: string; pod: string; status: string; brand: string; process: string; notes: string }> = [];

    for (const emp of filteredEmployees) {
      for (const date of daysInMonth) {
        const cell = dayGridMap.get(`${emp.id}_${date}`);
        rows.push({
          date,
          employee: emp.name,
          pod: emp.pod_name || "Unassigned",
          status: cell?.status || "unassigned",
          brand: cell?.brand_name || "-",
          process: cell?.process_code || "-",
          notes: cell?.notes || "",
        });
      }
    }

    return rows;
  }, [data, filteredEmployees, dayGridMap, daysInMonth]);

  const escapeCsvValue = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadRosterCsv = () => {
    if (!exportRows.length) {
      showToast({ type: "warning", title: "Nothing to export", message: "No roster rows match the current filters." });
      return;
    }

    const headers = ["Date", "Employee", "Pod", "Status", "Brand", "Process", "Notes"];
    const csv = [headers.join(",")]
      .concat(
        exportRows.map((row) =>
          [
            escapeCsvValue(row.date),
            escapeCsvValue(row.employee),
            escapeCsvValue(row.pod),
            escapeCsvValue(row.status),
            escapeCsvValue(row.brand),
            escapeCsvValue(row.process),
            escapeCsvValue(row.notes),
          ].join(",")
        )
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `roster-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast({ type: "success", title: "CSV ready", message: `Downloaded roster for ${formatMonthYear(month)}.` });
  };

  const downloadRosterPdf = () => {
    if (!exportRows.length) {
      showToast({ type: "warning", title: "Nothing to export", message: "No roster rows match the current filters." });
      return;
    }

    const rowsHtml = exportRows
      .map(
        (row) => `
          <tr>
            <td>${row.date}</td>
            <td>${row.employee}</td>
            <td>${row.pod}</td>
            <td>${row.status}</td>
            <td>${row.brand}</td>
            <td>${row.process}</td>
            <td>${row.notes || "-"}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      showToast({ type: "error", title: "Print blocked", message: "Your browser blocked the PDF pop-up. Please allow pop-ups and retry." });
      return;
    }

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>Roster ${month}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { font-size: 24px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>Roster Export - ${formatMonthYear(month)}</h1>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Pod</th>
                <th>Status</th>
                <th>Brand</th>
                <th>Process</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);

    showToast({ type: "success", title: "PDF export started", message: "Use the browser print dialog to save as PDF." });
  };

  const handleCellClick = (emp: any, date: string) => {
    const cell = dayGridMap.get(`${emp.id}_${date}`);
    setEditingCell({
      employeeId: emp.id,
      employeeName: emp.name,
      date,
      currentStatus: cell?.status || "unassigned",
      currentBpId: cell?.brand_process_id || null,
      isPinned: cell?.pinned || false,
    });
    setNewStatus(cell?.status || "working");
    setNewBpId(cell?.brand_process_id || (data?.meta?.brandProcesses?.[0]?.id || ""));
    setOverrideReason("");
    setIsOverride(false);
    setEditError("");
    setEditModalOpen(true);
  };

  const handleSaveCell = async () => {
    if (!editingCell) return;
    setSavingEdit(true);
    setEditError("");

    try {
      const res = await fetch(`/api/roster/${month}/cell`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: editingCell.employeeId,
          date: editingCell.date,
          status: newStatus,
          brandProcessId: newStatus === "working" ? newBpId : null,
          overrideReason: overrideReason || undefined,
          isOverride,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.requiresOverride) {
          setEditError(json.message);
          setIsOverride(true);
        } else {
          setEditError(json.message || json.error || "Failed to update cell");
        }
        setSavingEdit(false);
        return;
      }

      // Apply the authoritative day returned by the API to the SWR cache first, so
      // the grid repaints instantly and never shows the superseded assignment.
      if (json.day && data) {
        const savedDay = json.day;
        const remainingDays = (data.days || []).filter(
          (d: any) =>
            !(
              d.employee_id === savedDay.employee_id &&
              parseDateString(d.date)?.dateStr === savedDay.date
            )
        );
        await mutate(
          { ...data, days: [...remainingDays, savedDay] },
          { revalidate: true }
        );
      } else {
        await mutate();
      }

      showToast({
        type: json.notificationWarning ? "warning" : "success",
        title: "Shift Assignment Saved",
        message:
          json.notificationWarning ||
          `Updated ${editingCell.employeeName} on ${editingCell.date} to ${newStatus}.`,
      });

      setEditModalOpen(false);
      window.dispatchEvent(new CustomEvent("roster:refresh"));
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const getStatusCellStyles = (status: string, isPinned?: boolean) => {
    switch (status) {
      case "working":
        return "bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs border border-indigo-700/40";
      case "weekly_off":
        return "bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 border border-slate-300/60";
      case "leave":
        return "bg-amber-400 text-amber-950 font-bold hover:bg-amber-500 shadow-xs border border-amber-500/50";
      case "holiday":
        return "bg-rose-100 text-rose-800 font-bold hover:bg-rose-200 border border-rose-300/60";
      case "comp_off":
        return "bg-teal-100 text-teal-800 font-bold hover:bg-teal-200 border border-teal-300/60";
      default:
        return "bg-slate-50 text-slate-300 hover:bg-slate-100 border border-slate-200/50";
    }
  };

  const getStatusShortLabel = (cell: any) => {
    if (!cell) return "-";
    switch (cell.status) {
      case "working":
        return cell.process_code || "W";
      case "weekly_off":
        return "OFF";
      case "leave":
        return "LV";
      case "holiday":
        return "HOL";
      case "comp_off":
        return "CO";
      default:
        return "-";
    }
  };

  return (
    <div className="space-y-4 animate-fade-in font-sans">
      {/* Top Filter and Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Left Side: Month navigation + Filters */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs">
          <MonthPicker
            currentMonth={month}
            onMonthChange={(newM) => router.push(`/manager/roster/${newM}`)}
          />

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Search Employee */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchEmployee}
              onChange={(e) => setSearchEmployee(e.target.value)}
              className="pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400"
            />
            {searchEmployee && (
              <button
                onClick={() => setSearchEmployee("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Pod Filter */}
          <select
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
          >
            <option value="ALL">All Pods</option>
            {data?.meta?.pods?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="working">Working Only</option>
            <option value="weekly_off">Weekly Offs</option>
            <option value="leave">Leaves</option>
            <option value="holiday">Holidays</option>
          </select>

          {/* Quick Regenerate action if roster is empty or needs refresh */}
          <Button
            onClick={handleGenerateRoster}
            loading={generating}
            variant="secondary"
            size="xs"
            icon={<RefreshCw className="w-3 h-3" />}
          >
            {data?.rosterMonth ? "Regenerate" : "Generate"}
          </Button>

          <Button
            onClick={downloadRosterCsv}
            variant="secondary"
            size="xs"
            icon={<Download className="w-3 h-3" />}
          >
            CSV
          </Button>

          <Button
            onClick={downloadRosterPdf}
            variant="secondary"
            size="xs"
            icon={<Printer className="w-3 h-3" />}
          >
            PDF
          </Button>
        </div>

        {/* Right Side: Status Legend & Real-Time Sync Indicator */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] self-start xl:self-auto">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block shadow-xs" />
              <span className="text-slate-600 font-medium">Working</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-300 inline-block" />
              <span className="text-slate-600 font-medium">Off</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block shadow-xs" />
              <span className="text-slate-600 font-medium">Leave</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-200 inline-block" />
              <span className="text-slate-600 font-medium">Holiday</span>
            </span>
          </div>

          <div className="text-slate-400 pl-3 border-l border-slate-200 flex items-center gap-1.5 font-mono text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Synced {secondsAgo}s ago</span>
          </div>
        </div>
      </div>

      {/* Roster Un-generated Notice Banner */}
      {data && !data.rosterMonth && (
        <div className="p-4 bg-amber-50 border border-amber-200/90 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-slide-down">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-amber-900 font-medium">
              Roster for <strong>{formatMonthYear(month)}</strong> has not been generated yet. Click to run the constraint solver.
            </span>
          </div>
          <Button
            onClick={handleGenerateRoster}
            loading={generating}
            variant="primary"
            size="xs"
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Solve & Generate Roster
          </Button>
        </div>
      )}

      {/* Main Roster Grid Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-card overflow-hidden flex flex-col">
        {isLoading && !data ? (
          <div className="p-8 space-y-4">
            <div className="flex gap-3">
              <Skeleton className="h-8 w-44" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-8 flex-1" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={<User className="w-6 h-6 text-slate-400" />}
            title="No Staff Matching Filters"
            description="Adjust your search criteria, selected pod, or status filter to view shift assignments."
            actionText="Clear Filters"
            onAction={() => {
              setSelectedPod("ALL");
              setSearchEmployee("");
              setStatusFilter("ALL");
            }}
          />
        ) : (
          <div className="overflow-x-auto max-h-[72vh] relative bg-white rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-xs text-left border-separate border-spacing-0 table-fixed">
              {/* Header */}
              <thead className="sticky top-0 z-40 bg-slate-100">
                <tr>
                  <th className="p-3 font-bold sticky top-0 left-0 bg-slate-100 z-50 w-[190px] min-w-[190px] max-w-[190px] border-b border-r border-slate-200 text-slate-800">
                    Employee
                  </th>
                  <th className="p-3 font-semibold sticky top-0 left-[190px] bg-slate-100 z-50 w-[140px] min-w-[140px] max-w-[140px] border-b border-r-2 border-r-slate-300 shadow-[4px_0_12px_-2px_rgba(15,23,42,0.12)] hidden sm:table-cell text-slate-800">
                    Pod
                  </th>
                  {daysInMonth.map((dateStr) => {
                    const dayNum = dateStr.slice(8);
                    const dow = new Date(dateStr).getDay();
                    const isSun = dow === 0;
                    const isSat = dow === 6;
                    return (
                      <th
                        key={dateStr}
                        className={cn(
                          "p-1.5 text-center font-bold w-[48px] min-w-[48px] sticky top-0 z-40 border-b border-r border-slate-200 transition-colors",
                          isSun
                            ? "bg-amber-100 text-amber-950 font-extrabold"
                            : isSat
                            ? "bg-slate-200 text-slate-800"
                            : "bg-slate-50 text-slate-700"
                        )}
                      >
                        <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][dow]}
                        </div>
                        <div className="text-xs font-bold leading-tight">{dayNum}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Rows */}
              <tbody>
                {filteredEmployees.map((emp: any) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                    {/* Fixed Employee Column (190px) */}
                    <td className="p-2.5 font-medium sticky left-0 bg-white group-hover:bg-slate-50 z-30 w-[190px] min-w-[190px] max-w-[190px] border-b border-r border-slate-200 whitespace-nowrap transition-colors">
                      <div className="font-bold text-xs text-slate-900 truncate">{emp.name}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[165px] font-mono">
                        {emp.email}
                      </div>
                    </td>

                    {/* Fixed Pod Column (140px at left-[190px]) with drop shadow */}
                    <td className="p-2.5 text-slate-600 sticky left-[190px] bg-white group-hover:bg-slate-50 z-30 w-[140px] min-w-[140px] max-w-[140px] border-b border-r-2 border-r-slate-300 shadow-[4px_0_12px_-2px_rgba(15,23,42,0.12)] hidden sm:table-cell whitespace-nowrap text-[11px] transition-colors">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 font-semibold text-slate-700 text-[10px] truncate block">
                        {emp.pod_name?.split("(")[0] || "Alpha Pod"}
                      </span>
                    </td>

                    {/* Date Cells */}
                    {daysInMonth.map((dateStr) => {
                      const cell = dayGridMap.get(`${emp.id}_${dateStr}`);
                      const status = cell?.status || "unassigned";
                      const isPinned = cell?.pinned;
                      const label = getStatusShortLabel(cell);
                      const dow = new Date(dateStr).getDay();
                      const isSun = dow === 0;

                      return (
                        <td
                          key={dateStr}
                          onClick={() => handleCellClick(emp, dateStr)}
                          className={cn(
                            "p-1 text-center border-b border-r border-slate-200/70 cursor-pointer select-none w-[48px] min-w-[48px] z-10 transition-colors",
                            isSun ? "bg-amber-50/25 hover:bg-amber-100/40" : "bg-white hover:bg-slate-50"
                          )}
                        >
                          <div
                            className={cn(
                              "w-full h-8 rounded-lg flex items-center justify-center text-[10px] transition-all relative font-mono tracking-tight active:scale-95",
                              getStatusCellStyles(status, isPinned)
                            )}
                            title={`${emp.name} • ${dateStr}\nStatus: ${status}${
                              cell?.brand_name ? `\nBrand: ${cell.brand_name} (${cell.process_code})` : ""
                            }${isPinned ? "\n[Pinned by Manager]" : ""}`}
                          >
                            <span>{label}</span>
                            {isPinned && (
                              <span
                                className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-300 rounded-full shadow-xs"
                                title="Pinned Assignment"
                              />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              {/* Headcount Totals Footer */}
              <tfoot className="sticky bottom-0 z-40 bg-slate-100">
                <tr>
                  <td className="p-2.5 font-bold text-xs sticky bottom-0 left-0 bg-slate-100 z-50 w-[190px] min-w-[190px] max-w-[190px] border-t-2 border-t-slate-300 border-r border-r-slate-200 text-slate-900">
                    Total Staff Working
                  </td>
                  <td className="p-2.5 text-xs sticky bottom-0 left-[190px] bg-slate-100 z-50 w-[140px] min-w-[140px] max-w-[140px] border-t-2 border-t-slate-300 border-r-2 border-r-slate-300 shadow-[4px_0_12px_-2px_rgba(15,23,42,0.12)] hidden sm:table-cell text-slate-600 font-mono font-bold">
                    Headcount
                  </td>
                  {daysInMonth.map((dateStr) => {
                    const count = dailyHeadcounts.get(dateStr);
                    const dow = new Date(dateStr).getDay();
                    const isSun = dow === 0;
                    return (
                      <td
                        key={dateStr}
                        className={cn(
                          "p-1.5 text-center text-[11px] font-mono sticky bottom-0 z-40 border-t-2 border-t-slate-300 border-r border-r-slate-200 w-[48px] min-w-[48px]",
                          isSun ? "bg-amber-100 text-amber-950 font-bold" : "bg-slate-100 text-slate-800 font-semibold"
                        )}
                        title={`Date ${dateStr}:\n${count?.working ?? 0} Working\n${count?.off ?? 0} Off\n${count?.leave ?? 0} On Leave`}
                      >
                        {count?.working ?? 0}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Manual Edit Cell Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Edit Shift Assignment</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {editingCell?.employeeName} • {editingCell?.date}
            </p>
          </div>
        }
        size="md"
      >
        <div className="space-y-4">
          {editError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-start gap-2.5 animate-slide-down">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">Constraint Conflict Warning</div>
                <div className="text-rose-700 leading-relaxed">{editError}</div>
              </div>
            </div>
          )}

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Shift Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
              >
                <option value="working">Working</option>
                <option value="weekly_off">Weekly Off</option>
                <option value="leave">Leave</option>
                <option value="holiday">Holiday</option>
                <option value="comp_off">Comp Off</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>

            {newStatus === "working" && (
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Brand & Process Assignment
                </label>
                <select
                  value={newBpId}
                  onChange={(e) => setNewBpId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                >
                  {data?.meta?.brandProcesses?.map((bp: any) => (
                    <option key={bp.id} value={bp.id}>
                      {bp.brand_name} - {bp.process_code} ({bp.operating_calendar})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isOverride && (
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5 animate-slide-down">
                <label className="font-bold text-amber-900 block">
                  Manager Override Justification (Required)
                </label>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Provide explicit operational justification for overriding leave or skill conflict..."
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs placeholder:text-slate-400"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant={isOverride ? "danger" : "primary"}
              size="sm"
              onClick={handleSaveCell}
              loading={savingEdit}
              disabled={isOverride && !overrideReason.trim()}
            >
              {isOverride ? "Confirm Override & Save" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
