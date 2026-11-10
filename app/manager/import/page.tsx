"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Layers,
  Users,
  Building2,
  Calendar,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Info,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ToastProvider";

interface ValidationError {
  sheet: string;
  row: number;
  field: string;
  message: string;
}

interface ValidationWarning {
  code: string;
  message: string;
  details?: any;
}

interface EntityDiff {
  added: number;
  changed: number;
  unchanged: number;
  removed: number;
  sampleAdded?: string[];
  sampleChanged?: string[];
  sampleRemoved?: string[];
}

export default function ImportPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [targetMonth, setTargetMonth] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [previewResult, setPreviewResult] = useState<{
    ok: boolean;
    targetMonth?: string | null;
    importMode?: "merge" | "replace";
    rowCounts?: Record<string, number>;
    errors?: ValidationError[];
    warnings?: ValidationWarning[];
    diff?: Record<string, EntityDiff>;
  } | null>(null);

  const [commitResult, setCommitResult] = useState<{
    ok: boolean;
    importId: string;
    targetMonth: string;
    conflictsCount: number;
    daysAssigned: number;
    employeeAccountsProvisioned: boolean;
  } | null>(null);

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setCommitResult(null);
    setPreviewResult(null);
    setPreviewing(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("targetMonth", targetMonth);

      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      setPreviewResult(json);
      if (json.ok) {
        showToast({
          type: "success",
          title: "Roster Data Validated",
          message: "The uploaded file passed format and referential integrity checks.",
        });
      } else {
        showToast({
          type: "error",
          title: "Validation Issues Found",
          message: `${json.errors?.length || 1} error(s) must be resolved before committing.`,
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Preview Failed",
        message: err.message,
      });
      setPreviewResult({
        ok: false,
        errors: [{ sheet: "Network", row: 0, field: "file", message: err.message }],
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!file || !previewResult?.ok) return;

    setCommitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("targetMonth", targetMonth);

      const res = await fetch("/api/import/commit", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (res.ok && json.ok) {
        setCommitResult(json);
        showToast({
          type: json.conflictsCount > 0 ? "warning" : "success",
          title: json.conflictsCount > 0 ? "Import complete with roster conflicts" : "Import and roster generation complete",
          message: `Generated ${json.daysAssigned} shifts for ${json.targetMonth} with ${json.conflictsCount} conflict(s). Review conflicts before publishing.`,
        });
        // Dispatch live event to update open tabs/drawers
        window.dispatchEvent(new CustomEvent("roster:refresh"));
      } else {
        showToast({
          type: "error",
          title: "Commit Failed",
          message: json.error || json.details || "Failed to commit import",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Commit Error",
        message: err.message,
      });
    } finally {
      setCommitting(false);
    }
  };

  const handleDownloadTemplate = (format: "csv" | "xlsx") => {
    window.location.href = format === "csv"
      ? "/api/import/template?format=csv"
      : "/api/import/template";
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Roster Data Import
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Import shared team data and create or update a roster for the month you choose.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleDownloadTemplate("csv")}
            variant="primary"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Download CSV Template
          </Button>
          <Button
            onClick={() => handleDownloadTemplate("xlsx")}
            variant="secondary"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Excel Template
          </Button>
        </div>
      </div>

      {/* Success Banner if committed */}
      {commitResult && (
        <div className={`p-5 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-down ${commitResult.conflictsCount > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200/90"}`}>
          <div className="flex items-start gap-3">
            {commitResult.conflictsCount > 0
              ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              : <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
            <div>
              <h3 className={`font-bold text-sm ${commitResult.conflictsCount > 0 ? "text-amber-950" : "text-emerald-950"}`}>
                {commitResult.conflictsCount > 0 ? "Data imported; review roster conflicts" : "Data imported and roster generated"}
              </h3>
              <p className={`text-xs mt-0.5 ${commitResult.conflictsCount > 0 ? "text-amber-800" : "text-emerald-700"}`}>
                Import ID: <code className="font-mono font-bold">{commitResult.importId}</code> •{" "}
                {commitResult.daysAssigned} shifts assigned with {commitResult.conflictsCount} conflict(s).
                {!commitResult.employeeAccountsProvisioned && " Employee login accounts were not created because this file has no initial passwords."}
                {" Review conflicts before publishing."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/manager/roster/${commitResult.targetMonth}`}>
              <Button variant="primary" size="xs" icon={<Calendar className="w-3 h-3" />}>
                View Roster Grid
              </Button>
            </Link>
            <Link href="/manager/analytics">
              <Button variant="secondary" size="xs">
                Open Analytics
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Upload Drop Zone */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Upload Roster Data</CardTitle>
            <CardDescription>
              Select a month, then upload a CSV or Excel workbook. Shared employee, pod, brand, process, and assignment records are maintained alongside month-specific roster rules. Existing records omitted from an import are preserved.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-5 max-w-xs">
            <label htmlFor="roster-month" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Roster month <span className="text-rose-600">*</span>
            </label>
            <input
              id="roster-month"
              type="month"
              required
              value={targetMonth}
              onChange={(event) => {
                setTargetMonth(event.target.value);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
                setPreviewResult(null);
                setCommitResult(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              The import will update this month only. Other months&apos; rosters remain unchanged.
            </p>
          </div>
          <div
            onClick={() => targetMonth && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files[0];
              if (dropped && targetMonth) handleFileChange(dropped);
            }}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/20 transition-all rounded-2xl p-8 sm:p-12 text-center cursor-pointer flex flex-col items-center justify-center gap-3 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              disabled={!targetMonth}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
            />
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 group-hover:bg-indigo-100/70 border border-indigo-200/60 flex items-center justify-center text-indigo-600 transition-transform group-hover:scale-105 shadow-xs">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                {file ? file.name : targetMonth ? "Click to browse or drag and drop a CSV or workbook" : "Choose the roster month to enable file upload"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB • Click to replace file`
                  : "CSV and Excel imports preserve records not included in the file"}
              </p>
            </div>
            {previewing && (
              <div className="flex items-center gap-2 text-xs text-indigo-600 font-semibold mt-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Parsing file and validating referential integrity...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Validation Errors Card */}
      {previewResult && !previewResult.ok && previewResult.errors && previewResult.errors.length > 0 && (
        <Card className="border-rose-200 bg-rose-50/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              <div>
                <CardTitle className="text-rose-950">
                  Validation Errors ({previewResult.errors.length})
                </CardTitle>
                <CardDescription className="text-rose-700">
                  The following issues must be resolved in your spreadsheet before importing.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto divide-y divide-rose-100 rounded-xl border border-rose-200 bg-white">
              {previewResult.errors.map((err, idx) => (
                <div key={idx} className="p-3 text-xs flex items-start gap-2.5">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                    {err.sheet} • Row {err.row}
                  </span>
                  <div>
                    <span className="font-bold text-slate-900">{err.field}: </span>
                    <span className="text-slate-600">{err.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Warnings Card */}
      {previewResult && previewResult.warnings && previewResult.warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <CardTitle className="text-amber-950">
                  Operational Warnings ({previewResult.warnings.length})
                </CardTitle>
                <CardDescription className="text-amber-700">
                  Advisory notices regarding single-point-of-failure brands and headcount rules.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {previewResult.warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-amber-200 bg-white text-xs flex items-start gap-2.5"
                >
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 shrink-0">
                    {w.code}
                  </span>
                  <span className="text-slate-700">{w.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diff Preview & Commit Action */}
      {previewResult && previewResult.ok && previewResult.diff && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Database Merge Preview</CardTitle>
              <CardDescription>
                Selected roster month: {previewResult.targetMonth}. Shared master records may be added or updated; omitted records and other months&apos; rosters are preserved.
              </CardDescription>
            </div>
            <Button
              onClick={handleCommit}
              loading={committing}
              variant="primary"
              size="sm"
              icon={<Sparkles className="w-3.5 h-3.5" />}
            >
              Commit & Regenerate Roster
            </Button>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(previewResult.diff).map(([entity, diff]) => (
                <div
                  key={entity}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-slate-800">
                      {entity}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {(previewResult.rowCounts as any)?.[entity] ?? 0} rows
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center pt-1 font-mono text-[11px]">
                    <div className="p-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <span className="block font-bold">+{diff.added}</span>
                      <span className="text-[9px] uppercase text-emerald-600">New</span>
                    </div>
                    <div className="p-1 rounded bg-amber-50 text-amber-800 border border-amber-100">
                      <span className="block font-bold">~{diff.changed}</span>
                      <span className="text-[9px] uppercase text-amber-700">Mod</span>
                    </div>
                    <div className="p-1 rounded bg-rose-50 text-rose-700 border border-rose-100">
                      <span className="block font-bold">-{diff.removed}</span>
                      <span className="text-[9px] uppercase text-rose-600">Del</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Ready to commit. All entities will be upserted in a single database transaction.
              </span>
              <Button
                onClick={handleCommit}
                loading={committing}
                variant="primary"
                size="md"
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Execute Transaction & Auto-Solve
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
