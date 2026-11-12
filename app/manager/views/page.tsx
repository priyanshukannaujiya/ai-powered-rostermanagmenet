"use client";

import React, { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Layers,
  Building2,
  Cpu,
  Users,
  User,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Sparkles,
  Search,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { cn } from "@/lib/utils";
import { realtimeSWR } from "@/lib/swr-config";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DimensionViewsPage() {
  const [currentMonth, setCurrentMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [activeTab, setActiveTab] = useState<"brand" | "process" | "pod" | "employee">("brand");

  const { data, isLoading, mutate } = useSWR(`/api/roster/${currentMonth}`, fetcher, realtimeSWR);

  // Reflect approvals and reassignments made elsewhere in the app immediately.
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

  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [selectedProcessCode, setSelectedProcessCode] = useState<string>("");
  const [selectedPodId, setSelectedPodId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const brands = data?.meta?.brands || [];
  const processes = data?.meta?.processes || [];
  const pods = data?.meta?.pods || [];
  const employees = data?.meta?.employees || [];
  const brandProcesses = data?.meta?.brandProcesses || [];
  const days = data?.days || [];

  useEffect(() => {
    if (!selectedProcessCode && processes.length > 0) {
      setSelectedProcessCode(processes[0].code);
    }
  }, [processes, selectedProcessCode]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header & Tab Selector */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Dimensional Roster Views
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Analyze staffing capacity from Brand, Process, Pod, or Employee vantage points.
          </p>
        </div>

        {/* Tab Controls & Month Picker */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          <MonthPicker currentMonth={currentMonth} onMonthChange={setCurrentMonth} />
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab("brand")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0",
                activeTab === "brand"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Building2 className="w-3.5 h-3.5" /> Brand
            </button>
            <button
              onClick={() => setActiveTab("process")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0",
                activeTab === "process"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Cpu className="w-3.5 h-3.5" /> Process
            </button>
            <button
              onClick={() => setActiveTab("pod")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0",
                activeTab === "pod"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Users className="w-3.5 h-3.5" /> Pod
            </button>
            <button
              onClick={() => setActiveTab("employee")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0",
                activeTab === "employee"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <User className="w-3.5 h-3.5" /> Employee
            </button>
          </div>
        </div>
      </div>

      {/* 1. BRAND VIEW */}
      {activeTab === "brand" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Brand Coverage vs Operating Requirement</CardTitle>
              <CardDescription>
                Inspect scheduled shift volume versus weekday/Sunday minimum requirements
              </CardDescription>
            </div>
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
            >
              <option value="">All 12 D2C Brands</option>
              {brands.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {brandProcesses
                  .filter((bp: any) => !selectedBrandId || bp.brand_id === selectedBrandId)
                  .map((bp: any) => {
                    const bpDays = days.filter(
                      (d: any) => d.brand_process_id === bp.id && d.status === "working"
                    );
                    const assignedCount = bpDays.length;

                    return (
                      <div
                        key={bp.id}
                        className="p-5 rounded-2xl border border-slate-200/80 bg-white hover:border-indigo-200 hover:shadow-card-hover transition-all duration-200 space-y-3 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-sm tracking-tight">
                            {bp.brand_name}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-indigo-50 text-indigo-700 font-bold border border-indigo-200/60">
                            {bp.process_code}
                          </span>
                        </div>

                        <div className="space-y-1 text-xs text-slate-500">
                          <div className="flex justify-between">
                            <span>Operating Calendar:</span>
                            <span className="font-semibold text-slate-700">
                              {bp.operating_calendar}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Min Headcount:</span>
                            <span className="font-semibold text-slate-700">
                              {bp.min_headcount_weekday} Wk / {bp.min_headcount_sunday} Sun
                            </span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">Scheduled Capacity:</span>
                          <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                            {assignedCount} shifts
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. PROCESS VIEW */}
      {activeTab === "process" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cross-Brand Process Allocation</CardTitle>
              <CardDescription>
                Compare resource staffing allocations by business process function
              </CardDescription>
            </div>
            <div className="flex gap-1.5">
              {["CS", "ACC", "RET", "NDR"].map((code) => (
                <button
                  key={code}
                  onClick={() => setSelectedProcessCode(code)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all",
                    selectedProcessCode === code
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {brandProcesses
                .filter((bp: any) => bp.process_code === selectedProcessCode)
                .map((bp: any) => {
                  const workingOnBp = days.filter(
                    (d: any) => d.brand_process_id === bp.id && d.status === "working"
                  );
                  return (
                    <div
                      key={bp.id}
                      className="p-5 flex items-center justify-between text-xs hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-900 text-sm">{bp.brand_name}</div>
                        <div className="text-[11px] text-slate-400">
                          Calendar: <strong className="text-slate-600">{bp.operating_calendar}</strong> • Min Weekday:{" "}
                          {bp.min_headcount_weekday}
                        </div>
                      </div>
                      <div className="text-right space-y-0.5">
                        <div className="font-bold text-indigo-700 text-sm">
                          {workingOnBp.length} shifts
                        </div>
                        <Badge variant="success" size="sm" dot>
                          Coverage Active
                        </Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. POD VIEW */}
      {activeTab === "pod" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pod Team Rosters</CardTitle>
              <CardDescription>
                Operating pods, designated members, and individual monthly shift loads
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pods.map((pod: any) => {
                const podEmployees = employees.filter((e: any) => e.pod_id === pod.id);
                return (
                  <div
                    key={pod.id}
                    className="p-5 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="font-bold text-sm text-slate-900">{pod.name}</h3>
                      <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                        {podEmployees.length} members
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      {podEmployees.map((emp: any) => {
                        const empDays = days.filter((d: any) => d.employee_id === emp.id);
                        const empWorking = empDays.filter((d: any) => d.status === "working").length;
                        const empOff = empDays.filter((d: any) => d.status === "weekly_off").length;
                        const empLeaveDays = empDays.filter((d: any) => d.status === "leave");
                        return (
                          <div
                            key={emp.id}
                            className="py-2 border-b border-slate-50 last:border-none space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-slate-800 font-semibold">{emp.name}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500 font-mono text-[11px] bg-slate-50 px-2 py-0.5 rounded">
                                  {empWorking} shifts
                                </span>
                                {empOff > 0 && (
                                  <span className="text-slate-500 font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                                    {empOff} off
                                  </span>
                                )}
                                {empLeaveDays.length > 0 && (
                                  <span className="text-amber-950 font-mono text-[10px] bg-amber-200 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                                    {empLeaveDays.length} leave
                                  </span>
                                )}
                              </div>
                            </div>
                            {empLeaveDays.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {empLeaveDays.map((d: any) => (
                                  <span
                                    key={d.date}
                                    className="text-[10px] font-bold text-amber-950 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded-md"
                                    title={`${emp.name} approved leave on ${d.date}`}
                                  >
                                    Leave {d.date.slice(5)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. EMPLOYEE VIEW */}
      {activeTab === "employee" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Individual Employee Schedule Breakdown</CardTitle>
              <CardDescription>
                Calendar view of assigned brand shifts, weekly offs, and approved leave
              </CardDescription>
            </div>
            <select
              value={selectedEmployeeId || employees[0]?.id || ""}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs max-w-xs"
            >
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.email})
                </option>
              ))}
            </select>
          </CardHeader>

          <CardContent className="space-y-5">
            {(() => {
              const currentEmpId = selectedEmployeeId || employees[0]?.id;
              const empSchedule = days.filter((d: any) => d.employee_id === currentEmpId);
              const workingCount = empSchedule.filter((d: any) => d.status === "working").length;
              const offCount = empSchedule.filter((d: any) => d.status === "weekly_off").length;
              const leaveCount = empSchedule.filter((d: any) => d.status === "leave").length;

              return (
                <div className="space-y-5">
                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs">
                      <span className="text-indigo-600 block font-semibold text-[11px] uppercase tracking-wider">
                        Working Shifts
                      </span>
                      <span className="text-2xl font-bold text-indigo-950 mt-1 block">
                        {workingCount}
                      </span>
                    </div>
                    <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl text-xs">
                      <span className="text-slate-600 block font-semibold text-[11px] uppercase tracking-wider">
                        Weekly Offs
                      </span>
                      <span className="text-2xl font-bold text-slate-900 mt-1 block">
                        {offCount}
                      </span>
                    </div>
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs">
                      <span className="text-amber-800 block font-semibold text-[11px] uppercase tracking-wider">
                        Approved Leave
                      </span>
                      <span className="text-2xl font-bold text-amber-950 mt-1 block">
                        {leaveCount}
                      </span>
                    </div>
                  </div>

                  {/* Calendar Grid Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs">
                    {empSchedule.map((d: any) => (
                      <div
                        key={d.date}
                        className={cn(
                          "p-3 rounded-xl border text-center transition-all flex flex-col justify-between min-h-[70px]",
                          d.status === "working"
                            ? "bg-indigo-50/80 border-indigo-200 text-indigo-950"
                            : d.status === "weekly_off"
                            ? "bg-slate-50 border-slate-200 text-slate-700"
                            : d.status === "leave"
                            ? "bg-amber-100 border-amber-300 text-amber-950 font-bold"
                            : "bg-slate-50/40 border-slate-100 text-slate-400"
                        )}
                      >
                        <div className="text-[10px] text-slate-400 font-mono font-medium">
                          {d.date.slice(5)}
                        </div>
                        <div className="font-bold uppercase text-[11px] my-1">
                          {d.status === "weekly_off" ? "Off" : d.status}
                        </div>
                        {d.process_code && (
                          <div className="text-[10px] text-indigo-700 font-bold font-mono">
                            {d.process_code}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
