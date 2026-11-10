"use client";

import React, { useMemo } from "react";
import useSWR from "swr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  TrendingUp,
  ShieldAlert,
  Users2,
  BarChart3,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Layers,
  Target,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Professional color palette
const COLORS = {
  indigo: "#6366f1",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#64748b",
  violet: "#8b5cf6",
};

const PIE_COLORS = ["#ef4444", "#f59e0b", "#22c55e"];
const POD_COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"];

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-card hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] text-slate-500 block font-semibold uppercase tracking-wider">
            {label}
          </span>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className="text-2xl font-bold text-slate-900">{value}</span>
          </div>
          {sub && (
            <span className="text-[10px] text-slate-400 mt-1 block font-medium">{sub}</span>
          )}
        </div>
        <div
          className={cn(
            "w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm",
            color
          )}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-lg p-3 text-xs">
      <p className="font-bold text-slate-900 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-slate-600 flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ backgroundColor: p.color }}
          />
          <span className="font-medium">{p.name}:</span>
          <span className="font-bold text-slate-900">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const { data, isLoading } = useSWR(`/api/analytics/${currentMonth}`, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  // Build pod summary for radar chart
  const podRadar = useMemo(() => {
    if (!data?.podWorkload) return [];
    const podMap = new Map<string, { pod: string; members: number; shifts: number; offs: number }>();
    for (const row of data.podWorkload) {
      const name = row.pod_name;
      if (!podMap.has(name)) {
        podMap.set(name, { pod: name.replace(" Pod", "").replace(/\s*\(.*\)/, ""), members: 0, shifts: 0, offs: 0 });
      }
      const entry = podMap.get(name)!;
      entry.members++;
      entry.shifts += parseInt(row.working_shifts) || 0;
      entry.offs += parseInt(row.weekly_offs) || 0;
    }
    return Array.from(podMap.values());
  }, [data?.podWorkload]);

  // Coverage heatmap data
  const heatmapData = useMemo(() => {
    if (!data?.coverageHeatmap) return [];
    return data.coverageHeatmap.map((bp: any) => {
      const totalDays = Object.keys(bp.days).length;
      const coveredDays = Object.values(bp.days).filter((v: any) => v >= bp.required).length;
      const coveragePct = totalDays > 0 ? Math.round((coveredDays / totalDays) * 100) : 0;
      return {
        name: `${bp.brand} (${bp.process})`,
        coverage: coveragePct,
        calendar: bp.calendar,
        required: bp.required,
        coveredDays,
        totalDays,
      };
    });
  }, [data?.coverageHeatmap]);

  // Employee workload distribution (top 15)
  const employeeWorkload = useMemo(() => {
    if (!data?.podWorkload) return [];
    return data.podWorkload
      .map((e: any) => ({
        name: e.employee_name.split(" ")[0],
        fullName: e.employee_name,
        pod: e.pod_name.replace(" Pod", "").replace(/\s*\(.*\)/, ""),
        shifts: parseInt(e.working_shifts) || 0,
        offs: parseInt(e.weekly_offs) || 0,
        leaves: parseInt(e.leave_days) || 0,
      }))
      .sort((a: any, b: any) => b.shifts - a.shifts)
      .slice(0, 16);
  }, [data?.podWorkload]);

  if (isLoading || !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const s = data.summary || {};
  const coveragePct =
    s.totalWorkingShifts + s.totalWeeklyOffs + s.totalLeaves > 0
      ? Math.round(
          (s.totalWorkingShifts / (s.totalWorkingShifts + s.totalLeaves + s.totalWeeklyOffs)) * 100
        )
      : 0;

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Operations Analytics
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/60">
                  {new Date(`${currentMonth}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </span>
                <span>•</span>
                <span>Live PostgreSQL Data</span>
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="working" size="sm" dot>
            Auto-Refresh 30s
          </Badge>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
        <KpiCard
          label="Working Shifts"
          value={s.totalWorkingShifts}
          sub={`${coveragePct}% fill rate`}
          icon={CalendarDays}
          color="bg-indigo-600 shadow-indigo-600/30"
        />
        <KpiCard
          label="Weekly Offs"
          value={s.totalWeeklyOffs}
          sub="Mandatory rest days"
          icon={CheckCircle2}
          color="bg-slate-600 shadow-slate-600/30"
        />
        <KpiCard
          label="Leave Days"
          value={s.totalLeaves}
          sub="Approved absences"
          icon={CalendarDays}
          color="bg-amber-500 shadow-amber-500/30"
        />
        <KpiCard
          label="Active Staff"
          value={s.activeEmployees}
          sub="Across 6 pods"
          icon={Users2}
          color="bg-cyan-600 shadow-cyan-600/30"
        />
        <KpiCard
          label="Blocking"
          value={s.blockingConflicts}
          sub="Hard violations"
          icon={ShieldAlert}
          color="bg-rose-500 shadow-rose-500/30"
        />
        <KpiCard
          label="Warnings"
          value={s.warnings}
          sub="Soft advisory"
          icon={AlertTriangle}
          color="bg-amber-500 shadow-amber-500/30"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Employee Workload Bar Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users2 className="w-4 h-4 text-indigo-600" />
              <CardTitle>Employee Shift Distribution</CardTitle>
            </div>
            <CardDescription>
              Working shifts, weekly offs, and leaves per team member
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={employeeWorkload}
                margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="shifts"
                  name="Working Shifts"
                  fill={COLORS.indigo}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="offs"
                  name="Weekly Offs"
                  fill={COLORS.slate}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="leaves"
                  name="Leave Days"
                  fill={COLORS.amber}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 2. SPOF Risk Donut */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-rose-500" />
              <CardTitle>SPOF Risk Distribution</CardTitle>
            </div>
            <CardDescription>
              Single-Point-of-Failure analysis across brand processes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <ResponsiveContainer width="55%" height={280}>
                <PieChart>
                  <Pie
                    data={data.spofDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {data.spofDistribution.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index]}
                        stroke="white"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3 flex-1">
                {data.spofDistribution.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.fill }}
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {item.value} brand-process{item.value !== 1 ? "es" : ""}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                  <span className="font-bold text-rose-600">Critical</span> = sole resource on leave
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Conflict Trend Area Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-500" />
              <CardTitle>Conflict Trend (Daily)</CardTitle>
            </div>
            <CardDescription>
              Blocking violations vs soft warnings across the month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={data.conflictTrend}
                margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="gradBlocking" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradWarning" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v) => v?.slice(8)}
                  interval={1}
                />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Area
                  type="monotone"
                  dataKey="blocking"
                  name="Blocking Violations"
                  stroke="#ef4444"
                  fill="url(#gradBlocking)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="warning"
                  name="Warnings"
                  stroke="#f59e0b"
                  fill="url(#gradWarning)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 4. Leave Pipeline Funnel */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-600" />
              <CardTitle>Leave Processing Pipeline</CardTitle>
            </div>
            <CardDescription>
              From submission through approval to employee notification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={data.leaveFunnel}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tick={{ fontSize: 11, fill: "#334155", fontWeight: 600 }}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Applications" radius={[0, 8, 8, 0]}>
                  {data.leaveFunnel.map((_: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={[COLORS.blue, COLORS.amber, COLORS.emerald, COLORS.violet][index]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 5. Brand Coverage % */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <CardTitle>Brand Coverage Score</CardTitle>
            </div>
            <CardDescription>
              Percentage of days each brand-process meets required headcount
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={heatmapData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#334155", fontWeight: 500 }}
                  width={150}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-lg p-3 text-xs">
                        <p className="font-bold text-slate-900 mb-1">{d.name}</p>
                        <p className="text-slate-600">
                          Coverage: <b>{d.coverage}%</b> ({d.coveredDays}/{d.totalDays} days)
                        </p>
                        <p className="text-slate-500">
                          Calendar: {d.calendar} | Required: {d.required}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="coverage" name="Coverage %" radius={[0, 6, 6, 0]}>
                  {heatmapData.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.coverage >= 80
                          ? COLORS.emerald
                          : entry.coverage >= 50
                          ? COLORS.amber
                          : COLORS.rose
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 6. Pod Capacity Radar */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users2 className="w-4 h-4 text-violet-600" />
              <CardTitle>Pod Capacity Radar</CardTitle>
            </div>
            <CardDescription>
              Team size, shift volume, and off-day allocation per pod
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={podRadar}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis
                  dataKey="pod"
                  tick={{ fontSize: 11, fill: "#334155", fontWeight: 600 }}
                />
                <PolarRadiusAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                <Radar
                  name="Members"
                  dataKey="members"
                  stroke={COLORS.indigo}
                  fill={COLORS.indigo}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Radar
                  name="Total Shifts"
                  dataKey="shifts"
                  stroke={COLORS.emerald}
                  fill={COLORS.emerald}
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Weekly-Off Distribution (smaller row) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-600" />
            <CardTitle>Weekly-Off Day Preferences</CardTitle>
          </div>
          <CardDescription>
            Distribution of assigned weekly rest days across weekdays
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={data.weeklyOffDistribution}
              margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Employees" fill={COLORS.indigo} radius={[6, 6, 0, 0]}>
                {(data.weeklyOffDistribution || []).map((_: any, index: number) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={POD_COLORS[index % POD_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
