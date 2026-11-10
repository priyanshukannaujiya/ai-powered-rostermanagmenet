"use client";

import Link from "next/link";
import useSWR from "swr";
import { Calendar, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMonthYear } from "@/lib/utils";

type MonthlyRoster = {
  month: string;
  status: "draft" | "published";
  generated_at: string;
  published_at: string | null;
  shift_count: number;
  conflict_count: number;
  blocking_conflict_count: number;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load monthly rosters.");
  return response.json();
};

export default function MonthlyRostersPage() {
  const { data, error, isLoading } = useSWR("/api/rosters", fetcher);
  const months: MonthlyRoster[] = data?.months || [];
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Monthly Rosters</h1>
          <p className="mt-1 text-xs text-slate-500">
            Each month has an independent roster, status, and conflict summary.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="roster-month-picker">Select roster month</label>
          <input
            id="roster-month-picker"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          />
          <Link href={`/manager/roster/${selectedMonth}`}>
            <Button size="sm" icon={<Plus className="h-4 w-4" />}>Open selected month</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error.message}
        </div>
      )}

      {isLoading ? (
        <Card><CardContent><p className="py-8 text-center text-sm text-slate-500">Loading monthly rosters...</p></CardContent></Card>
      ) : months.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Calendar className="h-6 w-6 text-slate-400" />}
            title="No monthly rosters yet"
            description="Import data for a selected month or open a month and generate its roster."
            actionText="Import new data"
            onAction={() => { window.location.href = "/manager/import"; }}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {months.map((roster) => (
            <Card key={roster.month}>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>{formatMonthYear(roster.month)}</CardTitle>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Last generated {new Date(roster.generated_at).toLocaleString()}
                  </p>
                </div>
                <Badge variant={roster.status === "published" ? "published" : "draft"} dot>
                  {roster.status === "published" ? "Published" : "Draft"}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <strong className="block text-slate-900">{roster.shift_count}</strong>
                    <span className="text-slate-500">Shifts</span>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2">
                    <strong className="block text-amber-800">{roster.conflict_count}</strong>
                    <span className="text-amber-700">Conflicts</span>
                  </div>
                  <div className="rounded-lg bg-rose-50 p-2">
                    <strong className="block text-rose-800">{roster.blocking_conflict_count}</strong>
                    <span className="text-rose-700">Blocking</span>
                  </div>
                </div>
                <Link href={`/manager/roster/${roster.month}`}>
                  <Button variant="secondary" size="sm" className="w-full" icon={<ChevronRight className="h-4 w-4" />}>
                    View roster
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
