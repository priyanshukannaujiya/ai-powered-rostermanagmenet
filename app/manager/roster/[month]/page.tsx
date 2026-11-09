"use client";

import React, { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
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
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function RosterGridPage({ params }: { params: { month: string } }) {
  const month = params.month || "2026-11";
  const { showToast } = useToast();

  const { data, error, isLoading, mutate } = useSWR(
    `/api/roster/${month}`,
    fetcher,
    {
      refreshInterval: 20000,
      revalidateOnFocus: true,
    }
  );

  // Filters
  const [selectedPod, setSelectedPod] = useState<string>("ALL");
  const [selectedBrand, setSelectedBrand] = useState<string>("ALL");
  const [selectedProcess, setSelectedProcess] = useState<string>("ALL");
  const [searchEmployee, setSearchEmployee] = useState<string>("");

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

  // Index days by `${employeeId}_${date}`
  const dayGridMap = useMemo(() => {
    const map = new Map<string, any>();
    if (data?.days) {
      for (const d of data.days) {
        map.set(`${d.employee_id}_${d.date}`, d);
      }
    }
    return map;
  }, [data]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    if (!data?.meta?.employees) return [];
    return data.meta.employees.filter((emp: any) => {
      if (selectedPod !== "ALL" && emp.pod_id !== selectedPod) return false;
      if (searchEmployee.trim() && !emp.name.toLowerCase().includes(searchEmployee.toLowerCase())) return false;
      return true;
    });
  }, [data, selectedPod, searchEmployee]);

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

    // Optimistic UI state
    const cellKey = `${editingCell.employeeId}_${editingCell.date}`;
    const previousDays = data?.days;

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

      showToast({
        type: "success",
        title: "Shift Updated",
        message: `Updated ${editingCell.employeeName} on ${editingCell.date} to ${newStatus}.`,
      });

      setEditModalOpen(false);
      mutate(); // revalidate
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const getStatusBadgeClass = (status: string, isPinned?: boolean) => {
    switch (status) {
      case "working":
        return "bg-indigo-600 text-white font-medium hover:bg-indigo-700";
      case "weekly_off":
        return "bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300";
      case "leave":
        return "bg-amber-400 text-amber-950 font-bold hover:bg-amber-500";
      case "holiday":
        return "bg-rose-100 text-rose-800 font-medium hover:bg-rose-200";
      case "comp_off":
        return "bg-teal-100 text-teal-800 font-medium hover:bg-teal-200";
      default:
        return "bg-slate-50 text-slate-400 hover:bg-slate-100";
    }
  };

  const getStatusShortLabel = (cell: any) => {
    if (!cell) return "-";
    switch (cell.status) {
      case "working":
        return cell.process_code || "W";
      case "weekly_off":
        return "WO";
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
    <div className="space-y-4">
      {/* Top Filter and Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 mr-1">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>

          <select
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Pods</option>
            {data?.meta?.pods?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search employee..."
            value={searchEmployee}
            onChange={(e) => setSearchEmployee(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 w-36 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Status Legend & Real-Time Pulse */}
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block" /> Working
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-slate-300 inline-block" /> Weekly Off
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" /> Leave
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-rose-200 inline-block" /> Holiday
            </span>
          </div>

          <div className="text-slate-400 pl-2 border-l border-slate-200 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {secondsAgo}s ago
          </div>
        </div>
      </div>

      {/* Main Roster Grid Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100/90 text-slate-700 sticky top-0 z-20 backdrop-blur-sm shadow-sm">
              <tr>
                <th className="p-3 font-semibold sticky left-0 bg-slate-100 z-30 min-w-[160px] border-r border-slate-200">
                  Employee
                </th>
                <th className="p-3 font-semibold sticky left-[160px] bg-slate-100 z-30 min-w-[120px] border-r border-slate-200 hidden sm:table-cell">
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
                      className={`p-1.5 text-center font-semibold min-w-[42px] border-r border-slate-200/80 ${
                        isSun ? "bg-amber-50/80 text-amber-900" : isSat ? "bg-slate-50 text-slate-700" : ""
                      }`}
                    >
                      <div className="text-[10px] uppercase text-slate-500">
                        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][dow]}
                      </div>
                      <div className="font-bold">{dayNum}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map((emp: any) => (
                <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* Fixed Employee Name Column */}
                  <td className="p-2.5 font-medium text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-200 whitespace-nowrap">
                    <div className="font-semibold text-xs text-slate-800">{emp.name}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{emp.email}</div>
                  </td>

                  {/* Fixed Pod Column */}
                  <td className="p-2.5 text-slate-600 sticky left-[160px] bg-white z-10 border-r border-slate-200 hidden sm:table-cell whitespace-nowrap text-[11px]">
                    {emp.pod_name?.split("(")[0] || "Alpha Pod"}
                  </td>

                  {/* Date Cells */}
                  {daysInMonth.map((dateStr) => {
                    const cell = dayGridMap.get(`${emp.id}_${dateStr}`);
                    const status = cell?.status || "unassigned";
                    const isPinned = cell?.pinned;
                    const label = getStatusShortLabel(cell);

                    return (
                      <td
                        key={dateStr}
                        onClick={() => handleCellClick(emp, dateStr)}
                        className="p-1 text-center border-r border-slate-100 cursor-pointer select-none"
                      >
                        <div
                          className={`w-full h-8 rounded-lg flex items-center justify-center text-[11px] transition-all relative ${getStatusBadgeClass(
                            status,
                            isPinned
                          )}`}
                          title={`${emp.name} - ${dateStr}: ${status}${cell?.brand_name ? ` (${cell.brand_name} ${cell.process_code})` : ""}`}
                        >
                          {label}
                          {isPinned && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Edit Cell Modal */}
      {editModalOpen && editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Edit Shift Assignment</h3>
                <p className="text-xs text-slate-500">
                  {editingCell.employeeName} • {editingCell.date}
                </p>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">Constraint Validation Warning</div>
                  <div>{editError}</div>
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                <div>
                  <label className="font-semibold text-amber-800 block mb-1">
                    Manager Override Justification (Required)
                  </label>
                  <textarea
                    rows={2}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Provide operational reason for overriding employee unavailability..."
                    className="w-full px-3 py-2 bg-amber-50/50 border border-amber-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCell}
                disabled={savingEdit || (isOverride && !overrideReason.trim())}
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl shadow-sm transition-all"
              >
                {savingEdit ? "Validating & Saving..." : isOverride ? "Confirm Override & Save" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

