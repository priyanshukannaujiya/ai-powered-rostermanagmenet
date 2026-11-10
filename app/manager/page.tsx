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
  Layers,
  Building2,
  FileCheck,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { formatMonthYear } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ManagerDashboard() {
  const currentMonth = new Date().toISOString().slice(0, 7);
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

  // Revalidate on AI assistant updates
  useEffect(() => {
    const handleRefresh = () => {
      mutate();
    };
    window.addEventListener("roster:refresh", handleRefresh);
    return () => window.removeEventListener("roster:refresh", handleRefresh);
  }, [mutate]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/roster/${currentMonth}`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        showToast({
          type: "success",
          title: "Roster Generated",
          message: `Solved with ${json.metrics?.coveragePercentage ?? 0}% coverage and ${json.conflictsCount ?? 0} conflict(s).`,
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
      showToast({ type: "error", title: "Network Error", message: err.message });
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
          message: "All shift assignments have been frozen and published to employees.",
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

  // Dynamic calculations from live data
  const workingSlots = data?.days?.filter((d: any) => d.status === "working").length || 0;

  const totalEmployees = data?.meta?.employees?.length ?? 0;
  const totalPods = data?.meta?.pods?.length ?? 0;
  const totalBrands = data?.meta?.brands?.length ?? 0;

  const topAtRisk = blockingConflicts.slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Title & Status Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Operations Roster Dashboard
            </h1>
            <Badge
              variant={isPublished ? "published" : rosterMonth ? "draft" : "neutral"}
              dot
            >
              {isPublished ? "Published" : rosterMonth ? "Draft Active" : "Not Generated"}
            </Badge>
          </div>
          <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-2">
            <span>
              Target Period: <strong>{formatMonthYear(currentMonth)}</strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3.5 h-3.5" /> Synced {secondsAgo}s ago
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-indigo-600 font-medium">Deterministic Engine</span>
          </div>
        </div>

        {totalEmployees === 0 && totalPods === 0 && totalBrands === 0 && (
          <Card className="border-indigo-200 bg-indigo-50/40">
            <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-bold text-slate-900">Your roster workspace is ready for real data</h2>
                <p className="mt-1 max-w-2xl text-xs text-slate-600">
                  Import a file for a specific month, or add employees, pods, brands, tasks, and assignments one record at a time. No sample records are created automatically.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/manager/import"><Button size="sm">Import new data</Button></Link>
                <Link href="/manager/master"><Button size="sm" variant="secondary">Manage data</Button></Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={handleGenerate}
            disabled={generating || isPublished || totalEmployees === 0}
            loading={generating}
            variant="primary"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            {rosterMonth ? "Regenerate Roster" : "Generate Roster"}
          </Button>

          {!isPublished && rosterMonth && (
            <Button
              onClick={handlePublish}
              disabled={publishing || blockingConflicts.length > 0}
              loading={publishing}
              variant="success"
              size="sm"
              icon={<Send className="w-3.5 h-3.5" />}
            >
              Publish Roster
            </Button>
          )}

          <Link href={`/manager/roster/${currentMonth}`}>
            <Button
              variant="outline"
              size="sm"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Open Grid
            </Button>
          </Link>
        </div>
      </div>

      {data && totalEmployees === 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="text-amber-950">
            No employee roster data is loaded. Import your organization data before generating a roster.
          </p>
          <Link href="/manager/import">
            <Button variant="primary" size="sm">Import roster data</Button>
          </Link>
        </div>
      )}

      {/* KPI Metrics Cards */}
      {isLoading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Blocking Conflicts */}
          <StatCard
            title="Blocking Conflicts"
            value={blockingConflicts.length}
            subtitle={
              blockingConflicts.length > 0
                ? "Immediate reassignment required"
                : "No blocking rule violations"
            }
            icon={<ShieldAlert className="w-5 h-5" />}
            variant={blockingConflicts.length > 0 ? "rose" : "slate"}
          />

          {/* Warnings */}
          <StatCard
            title="Warnings"
            value={warnings.length}
            subtitle="Soft preference constraints"
            icon={<AlertTriangle className="w-5 h-5" />}
            variant={warnings.length > 0 ? "amber" : "slate"}
          />

          {/* Coverage Percentage */}
          <StatCard
            title="Working Shifts"
            value={workingSlots}
            subtitle={`from ${data?.days?.length || 0} roster records`}
            icon={<CheckCircle2 className="w-5 h-5" />}
            variant="emerald"
          />

          {/* Active Staff & Pods (Dynamic Data) */}
          <StatCard
            title="Staff & Pods"
            value={
              <span>
                {totalEmployees}{" "}
                <span className="text-xs font-normal text-slate-400">/ {totalPods} Pods</span>
              </span>
            }
            subtitle={`${totalBrands} D2C brand operating rules`}
            icon={<Users className="w-5 h-5" />}
            variant="primary"
          />
        </div>
      )}

      {/* Top 5 Most At-Risk Brand Process Days */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Top At-Risk Brand-Process Shifts</CardTitle>
            <CardDescription>
              Unstaffed operating shifts and single-resource brand coverage risks
            </CardDescription>
          </div>
          <Link
            href={`/manager/roster/${currentMonth}`}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 group"
          >
            <span>Inspect grid</span>
            <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </CardHeader>

        {isLoading && !data ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : topAtRisk.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-6 h-6 text-emerald-600" />}
            title="All Brand Processes Covered"
            description="No blocking conflicts detected for this operating month. Every D2C brand meets minimum headcount requirements."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {topAtRisk.map((c: any) => (
              <div
                key={c.id}
                className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="blocking" dot>
                      Blocking
                    </Badge>
                    <span className="font-bold text-slate-900 font-mono">{c.date}</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-semibold text-indigo-700">
                      {c.brand_name || "Brand"}
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] text-slate-700 font-mono font-bold">
                      {c.process_code}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed font-normal">{c.message}</p>
                  {c.suggested_fix && (
                    <div className="text-emerald-800 font-medium text-[11px] bg-emerald-50/90 border border-emerald-200/70 px-2.5 py-1 rounded-xl inline-flex items-center gap-1.5 mt-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Suggested Fix: {c.suggested_fix}</span>
                    </div>
                  )}
                </div>

                <Link
                  href={`/manager/roster/${currentMonth}?date=${c.date}`}
                  className="shrink-0 self-start md:self-center"
                >
                  <Button variant="secondary" size="xs">
                    Resolve in Grid
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
