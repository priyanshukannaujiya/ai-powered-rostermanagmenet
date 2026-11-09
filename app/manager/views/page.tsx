"use client";

import React, { useState } from "react";
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
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DimensionViewsPage() {
  const currentMonth = "2026-11";
  const [activeTab, setActiveTab] = useState<"brand" | "process" | "pod" | "employee">("brand");

  const { data, isLoading } = useSWR(`/api/roster/${currentMonth}`, fetcher, {
    refreshInterval: 20000,
  });

  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [selectedProcessCode, setSelectedProcessCode] = useState<string>("CS");
  const [selectedPodId, setSelectedPodId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const brands = data?.meta?.brands || [];
  const processes = data?.meta?.processes || [];
  const pods = data?.meta?.pods || [];
  const employees = data?.meta?.employees || [];
  const brandProcesses = data?.meta?.brandProcesses || [];
  const days = data?.days || [];

  return (
    <div className="space-y-6">
      {/* Header & Tab Selector */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Dimensional Roster Views</h1>
          <p className="text-xs text-slate-500">Analyze schedules from Brand, Process, Pod, or Employee perspectives</p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("brand")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "brand" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Brand View
          </button>
          <button
            onClick={() => setActiveTab("process")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "process" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> Process View
          </button>
          <button
            onClick={() => setActiveTab("pod")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "pod" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Pod View
          </button>
          <button
            onClick={() => setActiveTab("employee")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "employee" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <User className="w-3.5 h-3.5" /> Employee View
          </button>
        </div>
      </div>

      {/* 1. BRAND VIEW */}
      {activeTab === "brand" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Brand Coverage vs Requirement</h2>
              <p className="text-xs text-slate-500">Color-coded daily coverage per brand-process</p>
            </div>
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Brands</option>
              {brands.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brandProcesses
              .filter((bp: any) => !selectedBrandId || bp.brand_id === selectedBrandId)
              .map((bp: any) => {
                const bpDays = days.filter((d: any) => d.brand_process_id === bp.id && d.status === "working");
                const assignedCount = bpDays.length;

                return (
                  <div key={bp.id} className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">{bp.brand_name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-100 text-indigo-800 font-semibold">
                        {bp.process_code}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Operating Calendar: <span className="font-medium text-slate-700">{bp.operating_calendar}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Requirement: {bp.min_headcount_weekday} weekday / {bp.min_headcount_sunday} Sun
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Total Shifts:</span>
                      <span className="font-bold text-indigo-600">{assignedCount} shifts</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 2. PROCESS VIEW */}
      {activeTab === "process" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Process Cross-Brand Staffing</h2>
              <p className="text-xs text-slate-500">Staff allocations for specific processes (CS, ACC, RET, NDR)</p>
            </div>
            <div className="flex gap-1.5">
              {["CS", "ACC", "RET", "NDR"].map((code) => (
                <button
                  key={code}
                  onClick={() => setSelectedProcessCode(code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedProcessCode === code
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {brandProcesses
              .filter((bp: any) => bp.process_code === selectedProcessCode)
              .map((bp: any) => {
                const workingOnBp = days.filter((d: any) => d.brand_process_id === bp.id && d.status === "working");
                return (
                  <div key={bp.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
                    <div>
                      <div className="font-bold text-slate-900">{bp.brand_name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Calendar: {bp.operating_calendar} • Min weekday: {bp.min_headcount_weekday}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-700">{workingOnBp.length} assigned shifts</div>
                      <div className="text-[10px] text-emerald-600 font-medium">Active Coverage</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 3. POD VIEW */}
      {activeTab === "pod" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Pod Team Rosters</h2>
            <p className="text-xs text-slate-500">Employee rosters grouped by operational pods</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pods.map((pod: any) => {
              const podEmployees = employees.filter((e: any) => e.pod_id === pod.id);
              return (
                <div key={pod.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="font-bold text-xs text-slate-900">{pod.name}</h3>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                      {podEmployees.length} members
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {podEmployees.map((emp: any) => {
                      const empWorking = days.filter((d: any) => d.employee_id === emp.id && d.status === "working").length;
                      return (
                        <div key={emp.id} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-none">
                          <span className="text-slate-800 font-medium">{emp.name}</span>
                          <span className="text-slate-500 text-[11px]">{empWorking} shifts</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. EMPLOYEE VIEW */}
      {activeTab === "employee" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Individual Employee Month Calendar</h2>
              <p className="text-xs text-slate-500">Detailed breakdown of shifts, weekly offs, and approved leave</p>
            </div>
            <select
              value={selectedEmployeeId || employees[0]?.id || ""}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.email})
                </option>
              ))}
            </select>
          </div>

          {/* Employee Schedule Breakdown */}
          {(() => {
            const currentEmpId = selectedEmployeeId || employees[0]?.id;
            const empSchedule = days.filter((d: any) => d.employee_id === currentEmpId);
            const workingCount = empSchedule.filter((d: any) => d.status === "working").length;
            const offCount = empSchedule.filter((d: any) => d.status === "weekly_off").length;
            const leaveCount = empSchedule.filter((d: any) => d.status === "leave").length;

            return (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs">
                    <span className="text-indigo-600 block font-semibold">Working Days</span>
                    <span className="text-xl font-bold text-indigo-900">{workingCount}</span>
                  </div>
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs">
                    <span className="text-slate-600 block font-semibold">Weekly Offs</span>
                    <span className="text-xl font-bold text-slate-900">{offCount}</span>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                    <span className="text-amber-800 block font-semibold">Approved Leave</span>
                    <span className="text-xl font-bold text-amber-900">{leaveCount}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs">
                  {empSchedule.map((d: any) => (
                    <div
                      key={d.date}
                      className={`p-2.5 rounded-xl border text-center ${
                        d.status === "working"
                          ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                          : d.status === "weekly_off"
                          ? "bg-slate-100 border-slate-200 text-slate-700"
                          : d.status === "leave"
                          ? "bg-amber-100 border-amber-300 text-amber-950 font-bold"
                          : "bg-slate-50 border-slate-200 text-slate-400"
                      }`}
                    >
                      <div className="text-[10px] text-slate-500">{d.date.slice(5)}</div>
                      <div className="font-bold uppercase text-[11px] mt-1">{d.status}</div>
                      {d.process_code && <div className="text-[10px] text-indigo-700">{d.process_code}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
