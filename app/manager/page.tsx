"use client";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Users,
  RefreshCw,
  Send,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ManagerDashboard() {
  const currentMonth = "2026-11";
  const { showToast } = useToast();

  const { data, error, isLoading, mutate } = useSWR(
    `/api/roster/${currentMonth}`,
    fetcher,
    {
      refreshInterval: 20000,
      revalidateOnFocus: true,
    }
  );

  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Timer for "Updated X seconds ago"
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (data) {
      setSecondsAgo(0);
    }
  }, [data]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/roster/${currentMonth}`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        showToast({
          type: "success",
          title: "Roster Generated",
          message: `Solved with ${json.metrics?.coveragePercentage}% coverage and ${json.conflictsCount} conflict(s).`,
        });
        mutate();
      } else {
        showToast({
          type: "error",
          title: "Generation Failed",
          message: json.error || "Failed to generate roster",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/roster/${currentMonth}/publish`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        showToast({
          type: "success",
          title: "Roster Published",
          message: "All shift assignments have been frozen and published.",
        });
        mutate();
      } else {
        showToast({
          type: "error",
          title: "Publish Blocked",
          message: json.message || json.error,
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
    } finally {
      setPublishing(false);
    }
  };

  const conflicts = data?.conflicts || [];
  const blockingConflicts = conflicts.filter((c: any) => c.severity === "blocking");
  const warnings = conflicts.filter((c: any) => c.severity === "warning");
  const rosterMonth = data?.rosterMonth;
  const isPublished = rosterMonth?.status === "published";

  // Calculate coverage stats
  const totalDays = data?.days?.length || 0;
  const workingSlots = data?.days?.filter((d: any) => d.status === "working").length || 0;
  const coveragePercentage = totalDays > 0 ? Math.min(100, Math.round((workingSlots / (totalDays * 0.75)) * 100)) : 0;

  // Top 5 at-risk brand process days
  const topAtRisk = blockingConflicts.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Page Title & Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Operations Roster Dashboard</h1>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                isPublished
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : rosterMonth
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {isPublished ? "Published" : rosterMonth ? "Draft" : "Not Generated"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span>Target Month: <strong>November 2026</strong></span>
            <span>•</span>
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3 h-3" /> Updated {secondsAgo}s ago
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleGenerate}
            disabled={generating || isPublished}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
            {rosterMonth ? "Regenerate Roster" : "Generate Roster"}
          </button>

          {!isPublished && rosterMonth && (
            <button
              onClick={handlePublish}
              disabled={publishing || blockingConflicts.length > 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              Publish Roster
            </button>
          )}

          <Link
            href={`/manager/roster/${currentMonth}`}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
          >
            Open Grid <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Blocking Conflicts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Blocking Conflicts</span>
            <span className="text-2xl font-bold text-rose-600 tracking-tight mt-1 block">
              {blockingConflicts.length}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Requires staff reassignment</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Warnings */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Warnings</span>
            <span className="text-2xl font-bold text-amber-600 tracking-tight mt-1 block">
              {warnings.length}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Soft preference adjustments</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Coverage Percentage */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Coverage Health</span>
            <span className="text-2xl font-bold text-emerald-600 tracking-tight mt-1 block">
              {coveragePercentage}%
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {workingSlots} shifts scheduled
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Active Pods & Employees */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Staff & Pods</span>
            <span className="text-2xl font-bold text-slate-900 tracking-tight mt-1 block">
              32 <span className="text-xs font-normal text-slate-400">/ 6 Pods</span>
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">12 D2C Brands</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Top 5 Most At-Risk Brand Process Days */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Top At-Risk Brand-Process Shifts</h2>
            <p className="text-xs text-slate-500">Unstaffed shifts and single-resource brand shortages</p>
          </div>
          <Link
            href={`/manager/roster/${currentMonth}`}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
          >
            View all conflicts in grid →
          </Link>
        </div>

        {topAtRisk.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No open blocking conflicts!</p>
            <p className="text-slate-400 mt-0.5">All operating brand-processes have qualified coverage.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {topAtRisk.map((c: any) => (
              <div key={c.id} className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-semibold rounded-md text-[10px]">
                      BLOCKING
                    </span>
                    <span className="font-bold text-slate-800">{c.date}</span>
                    <span className="text-slate-400">•</span>
                    <span className="font-semibold text-indigo-600">{c.brand_name || "Brand"}</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] text-slate-600 font-mono">
                      {c.process_code}
                    </span>
                  </div>
                  <p className="text-slate-700">{c.message}</p>
                  {c.suggested_fix && (
                    <p className="text-emerald-700 font-medium text-[11px] bg-emerald-50/80 border border-emerald-100 px-2 py-1 rounded-lg">
                      💡 Suggested Fix: {c.suggested_fix}
                    </p>
                  )}
                </div>

                <Link
                  href={`/manager/roster/${currentMonth}?date=${c.date}`}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg font-medium text-center shrink-0 self-start md:self-center transition-colors"
                >
                  Resolve in Grid
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

