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
  Bell,
  ArrowRight,
  UserCheck,
  History,
  FileCheck,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ApprovalsQueuePage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"pending" | "reviewed">("pending");

  const { data, mutate, isLoading } = useSWR("/api/leaves", fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  });
  const { data: notificationData, mutate: mutateNotifications } = useSWR("/api/notifications", fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });
  const notifications = notificationData?.notifications || [];

  // Replan Preview Modal State
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const leaves = data?.leaves || [];
  const pendingLeaves = leaves.filter((l: any) => l.status === "pending");
  const reviewedLeaves = leaves.filter((l: any) => l.status !== "pending");

  // Revalidate immediately if AI Assistant approves a leave
  React.useEffect(() => {
    const handleRefresh = () => {
      mutate();
      mutateNotifications();
    };
    window.addEventListener("roster:refresh", handleRefresh);
    return () => window.removeEventListener("roster:refresh", handleRefresh);
  }, [mutate, mutateNotifications]);

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
          title: "Simulation Failed",
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
          type: json.notificationWarning ? "warning" : "success",
          title: "Leave Request Approved",
          message: json.notificationWarning || `Approved leave and automatically replanned ${json.diff?.changedDays?.length || 0} future shift(s). The employee was notified.`,
        });
        setSelectedLeave(null);
        mutate();
        mutateNotifications();
        window.dispatchEvent(new CustomEvent("roster:refresh"));
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
      const json = await res.json();
      if (res.ok) {
        showToast({
          type: json.notificationWarning ? "warning" : "info",
          title: "Leave Rejected",
          message: json.notificationWarning || "The leave request status was updated to rejected and the employee was notified.",
        });
        mutate();
        mutateNotifications();
        window.dispatchEvent(new CustomEvent("roster:refresh"));
      } else {
        showToast({ type: "error", title: "Rejection Failed", message: json.error || "Could not reject leave." });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
    } finally {
      setRejecting(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Leave Approvals & Replan Queue
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Simulate future coverage gaps, inspect cross-trained backup options, and commit deterministic replans.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "pending"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>Pending</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
              {pendingLeaves.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("reviewed")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "reviewed"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span>Past History</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
              {reviewedLeaves.length}
            </span>
          </button>
        </div>
      </div>

      {notifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-indigo-600" />
              Team notifications
            </CardTitle>
            <CardDescription>
              Recent leave and roster updates for your authorized team scope.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {notifications.slice(0, 8).map((notification: any) => (
                <div key={notification.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">{notification.title}</span>
                      {!notification.read && <Badge variant="warning" size="sm">New</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{notification.message}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {notification.employee_name} · {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!notification.read && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await fetch("/api/notifications", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "mark_read", notificationId: notification.id }),
                          });
                          if (!response.ok) {
                            showToast({ type: "error", title: "Update Failed", message: "Could not mark notification as read." });
                            return;
                          }
                          mutateNotifications();
                        } catch (error: any) {
                          showToast({ type: "error", title: "Update Failed", message: error.message || "Could not mark notification as read." });
                        }
                      }}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requests List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {activeTab === "pending" ? "Pending Approval Requests" : "Reviewed Requests History"}
          </CardTitle>
          <CardDescription>
            {activeTab === "pending"
              ? "All submitted employee leave requests pending simulation and manager decision"
              : "Historical record of approved and rejected leave requests"}
          </CardDescription>
        </CardHeader>

        {isLoading && !data ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : activeTab === "pending" ? (
          pendingLeaves.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-6 h-6 text-emerald-600" />}
              title="Approvals Queue Clear"
              description="There are no pending employee leave requests awaiting manager or pod lead action."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingLeaves.map((l: any) => (
                <div
                  key={l.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold flex items-center justify-center text-xs">
                        {l.employee_name?.slice(0, 2).toUpperCase() || "EM"}
                      </div>
                      <span className="font-bold text-slate-900 text-sm">{l.employee_name}</span>
                      <Badge variant="leave" size="sm">
                        {l.type}
                      </Badge>
                      {l.pod_name && (
                        <span className="text-slate-400 text-[11px]">
                          • {l.pod_name.split("(")[0]}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600 flex items-center gap-1.5 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {formatDate(l.start_date)} to {formatDate(l.end_date)}
                      </span>
                    </div>
                    {l.reason && (
                      <p className="text-slate-500 text-[11px] italic bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 inline-block">
                        "{l.reason}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenPreview(l)}
                      icon={<ArrowRight className="w-3.5 h-3.5" />}
                    >
                      Simulate Replan & Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReject(l.id)}
                      loading={rejecting === l.id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Reviewed History */
          reviewedLeaves.length === 0 ? (
            <EmptyState
              icon={<History className="w-6 h-6 text-slate-400" />}
              title="No Past Reviewed Leaves"
              description="Historical approvals or rejections will be recorded here."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {reviewedLeaves.map((l: any) => (
                <div
                  key={l.id}
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{l.employee_name}</span>
                      <Badge
                        variant={l.status === "approved" ? "success" : "rejected"}
                        dot
                      >
                        {l.status}
                      </Badge>
                      <span className="text-slate-400 text-[11px]">• {l.type}</span>
                    </div>
                    <div className="text-slate-500">
                      {formatDate(l.start_date)} to {formatDate(l.end_date)}
                    </div>
                    {l.reason && <p className="text-slate-400 text-[11px]">"{l.reason}"</p>}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </Card>

      {/* Replan Simulation & Gap Preview Modal */}
      <Modal
        isOpen={Boolean(selectedLeave)}
        onClose={() => setSelectedLeave(null)}
        title={
          <div>
            <h3 className="font-bold text-slate-900 text-base">Replan Impact Preview</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulating leave approval for <strong>{selectedLeave?.employee_name}</strong> (
              {selectedLeave?.start_date} to {selectedLeave?.end_date})
            </p>
          </div>
        }
        size="lg"
      >
        {loadingPreview ? (
          <div className="py-12 text-center text-xs text-slate-500 space-y-2">
            <span className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent" />
            <p className="font-medium text-slate-700">
              Running constraint satisfaction solver across future days...
            </p>
            <p className="text-[11px] text-slate-400">
              Preserving pinned shifts and respecting max weekly hours & consecutive off rules.
            </p>
          </div>
        ) : previewData ? (
          <div className="space-y-4 text-xs">
            {/* Impact Summary Strip */}
            <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-bold text-indigo-950 block">Replan Solver Diff</span>
                <span className="text-[11px] text-indigo-700">Future unpinned days rescheduled</span>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-xs">
                {previewData.diff?.changedDays?.length || 0} shifts affected
              </span>
            </div>

            {/* New Conflicts Detected */}
            {previewData.diff?.newConflicts?.length > 0 ? (
              <div className="space-y-2">
                <h4 className="font-bold text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Resulting Staffing Shortages ({previewData.diff.newConflicts.length})
                </h4>
                <div className="space-y-1.5">
                  {previewData.diff.newConflicts.map((c: any) => (
                    <div
                      key={c.id}
                      className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl space-y-1"
                    >
                      <div className="font-bold text-rose-900">{c.message}</div>
                      <div className="text-[11px] text-rose-700">{c.suggestedFix}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-emerald-900 font-medium flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  Zero staffing gaps created! Other qualified pod members satisfy minimum headcount.
                </span>
              </div>
            )}

            {/* Suggested Cross-Trained Backups */}
            {previewData.diff?.suggestedBackups?.length > 0 && (
              <div className="space-y-2 pt-1">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Suggested Qualified Backups
                </h4>
                <div className="space-y-2">
                  {previewData.diff.suggestedBackups.map((sb: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5"
                    >
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        <span>{sb.brandName}</span>
                        <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                          {sb.processCode}
                        </span>
                        <span className="text-slate-400 font-normal">on {sb.date}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sb.candidates?.length > 0 ? (
                          sb.candidates.map((c: any) => (
                            <span
                              key={c.employeeId}
                              className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 shadow-xs"
                            >
                              {c.employeeName} ({c.qualificationReason})
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            No available cross-trained colleagues found
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedLeave(null)}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={handleConfirmApproval}
                loading={confirmingApproval}
              >
                Confirm & Apply Replan
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
