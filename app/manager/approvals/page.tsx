"use client";

import React, { useState } from "react";
import useSWR from "swr";
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Calendar,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ApprovalsQueuePage() {
  const { showToast } = useToast();
  const { data, mutate, isLoading } = useSWR("/api/leaves", fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  });

  // Replan Preview Modal State
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const leaves = data?.leaves || [];
  const pendingLeaves = leaves.filter((l: any) => l.status === "pending");
  const reviewedLeaves = leaves.filter((l: any) => l.status !== "pending");

  const handleOpenPreview = async (leave: any) => {
    setSelectedLeave(leave);
    setLoadingPreview(true);
    setPreviewData(null);

    try {
      const res = await fetch(`/api/leaves/${leave.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewOnly: true }),
      });

      const json = await res.json();
      if (res.ok) {
        setPreviewData(json);
      } else {
        showToast({
          type: "error",
          title: "Preview Failed",
          message: json.error || "Failed to simulate replan",
        });
        setSelectedLeave(null);
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
      setSelectedLeave(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmApproval = async () => {
    if (!selectedLeave) return;
    setConfirmingApproval(true);

    try {
      const res = await fetch(`/api/leaves/${selectedLeave.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewOnly: false }),
      });

      const json = await res.json();
      if (res.ok) {
        showToast({
          type: "success",
          title: "Leave Approved",
          message: `Leave approved and ${json.diff?.changedDays?.length || 0} future shift(s) replanned.`,
        });
        setSelectedLeave(null);
        mutate();
      } else {
        showToast({
          type: "error",
          title: "Approval Failed",
          message: json.error || "Could not complete approval",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
    } finally {
      setConfirmingApproval(false);
    }
  };

  const handleReject = async (leaveId: string) => {
    setRejecting(leaveId);
    try {
      const res = await fetch(`/api/leaves/${leaveId}/reject`, { method: "POST" });
      if (res.ok) {
        showToast({
          type: "info",
          title: "Leave Rejected",
          message: "The leave request status was updated to rejected.",
        });
        mutate();
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
    } finally {
      setRejecting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Leave Approvals & Replan Queue</h1>
          <p className="text-xs text-slate-500">
            Review requests, simulate future shift gaps, and inspect suggested cross-trained backups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold">
            {pendingLeaves.length} Pending
          </span>
        </div>
      </div>

      {/* Pending Requests List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 font-bold text-xs text-slate-700 uppercase tracking-wider">
          Pending Leave Requests
        </div>

        {pendingLeaves.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">All caught up!</p>
            <p className="text-slate-400 mt-0.5">There are no pending leave requests awaiting approval.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingLeaves.map((l: any) => (
              <div
                key={l.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{l.employee_name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-100 text-amber-800">
                      {l.type}
                    </span>
                    {l.pod_name && (
                      <span className="text-slate-400 text-[11px]">• {l.pod_name.split("(")[0]}</span>
                    )}
                  </div>
                  <div className="text-slate-600 flex items-center gap-1.5 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {l.start_date} to {l.end_date}
                    </span>
                  </div>
                  {l.reason && <p className="text-slate-500 text-[11px] italic">"{l.reason}"</p>}
                </div>

                <div className="flex items-center gap-2 self-start md:self-center">
                  <button
                    onClick={() => handleOpenPreview(l)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <span>Simulate Replan & Approve</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleReject(l.id)}
                    disabled={rejecting === l.id}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 rounded-xl font-medium transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Replan Simulation & Gap Preview Modal */}
      {selectedLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl border border-slate-200 space-y-4 animate-scale-up max-h-[85vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Replan Impact Preview</h3>
              <p className="text-xs text-slate-500">
                Approving leave for <strong>{selectedLeave.employee_name}</strong> ({selectedLeave.start_date} to {selectedLeave.end_date})
              </p>
            </div>

            {loadingPreview ? (
              <div className="py-12 text-center text-xs text-slate-500">
                <span className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" />
                <p>Simulating greedy assignment engine on future unpinned days...</p>
              </div>
            ) : previewData ? (
              <div className="space-y-4 text-xs">
                {/* Changed Days Count */}
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
                  <span className="font-semibold text-indigo-950">Shift Adjustments</span>
                  <span className="font-bold text-indigo-600">
                    {previewData.diff?.changedDays?.length || 0} days affected
                  </span>
                </div>

                {/* New Conflicts Detected */}
                {previewData.diff?.newConflicts?.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      Resulting Staffing Gaps ({previewData.diff.newConflicts.length})
                    </h4>
                    <div className="space-y-1.5">
                      {previewData.diff.newConflicts.map((c: any) => (
                        <div
                          key={c.id}
                          className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1"
                        >
                          <div className="font-bold text-rose-900">{c.message}</div>
                          <div className="text-[11px] text-rose-700">{c.suggestedFix}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>No staffing gaps created. Other team members satisfy the coverage requirement!</span>
                  </div>
                )}

                {/* Suggested Backups */}
                {previewData.diff?.suggestedBackups?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      Suggested Cross-Trained Backups
                    </h4>
                    <div className="space-y-2">
                      {previewData.diff.suggestedBackups.map((sb: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                          <div className="font-semibold text-slate-900">
                            {sb.brandName} ({sb.processCode}) on {sb.date}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {sb.candidates?.length > 0 ? (
                              sb.candidates.map((c: any) => (
                                <span
                                  key={c.employeeId}
                                  className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700"
                                >
                                  {c.employeeName} ({c.qualificationReason})
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">No available cross-trained colleagues found</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedLeave(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loadingPreview || confirmingApproval}
                onClick={handleConfirmApproval}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl shadow-sm transition-all"
              >
                {confirmingApproval ? "Applying Replan..." : "Confirm & Apply Approval"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
