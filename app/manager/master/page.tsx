"use client";

import React, { useState, useMemo } from "react";
import useSWR from "swr";
import {
  Database,
  Plus,
  Trash2,
  Users,
  Building2,
  Cpu,
  Layers,
  Calendar,
  Sparkles,
  Search,
  CheckCircle2,
  X,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function MasterDataPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("employees");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { data, mutate, isLoading } = useSWR(`/api/master/${activeTab}`, fetcher);

  // New item modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);

  // Custom Delete Confirm Dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/master/${activeTab}?id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast({
          type: "info",
          title: "Record Deleted",
          message: `Successfully removed ${deleteTarget.name}.`,
        });
        setDeleteTarget(null);
        mutate();
      } else {
        const json = await res.json();
        showToast({ type: "error", title: "Delete Failed", message: json.error });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Delete Error", message: err.message });
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/master/${activeTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        showToast({
          type: "success",
          title: "Record Added",
          message: "New master record created and indexed.",
        });
        setIsAddModalOpen(false);
        setFormData({});
        mutate();
      } else {
        const json = await res.json();
        showToast({ type: "error", title: "Creation Failed", message: json.error });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Submission Error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const tabs = [
    { id: "employees", label: "Employees", icon: Users },
    { id: "pods", label: "Pods", icon: Layers },
    { id: "brands", label: "Brands", icon: Building2 },
    { id: "processes", label: "Processes", icon: Cpu },
    { id: "brand_processes", label: "Brand-Process Rules", icon: Calendar },
    { id: "assignments", label: "Assignments", icon: Database },
  ];

  const rawRecords = data?.data || [];

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return rawRecords;
    const q = searchQuery.toLowerCase();
    return rawRecords.filter((r: any) => {
      const text = `${r.name || ""} ${r.code || ""} ${r.brand_name || ""} ${r.employee_name || ""} ${r.email || ""} ${r.id || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [rawRecords, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Master Data Configuration
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Maintain staff rosters, pod structures, D2C brands, process taxonomy, and operating rules without redeployment.
          </p>
        </div>

        <Button
          onClick={() => {
            setFormData({});
            setIsAddModalOpen(true);
          }}
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
        >
          Add {activeTab.replace("_", " ").slice(0, -1)}
        </Button>
      </div>

      {/* Tabs & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold transition-all shrink-0 ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Search in Records */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-7 py-1.5 bg-white border border-slate-200/80 rounded-xl text-slate-800 text-xs w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Records Table */}
      <Card>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={<Database className="w-6 h-6 text-slate-400" />}
            title={`No ${activeTab.replace("_", " ")} Found`}
            description={
              searchQuery
                ? `No records match your query "${searchQuery}".`
                : `There are currently no records stored in the ${activeTab} table.`
            }
            actionText={searchQuery ? "Clear Search" : `Add First ${activeTab}`}
            onAction={
              searchQuery
                ? () => setSearchQuery("")
                : () => {
                    setFormData({});
                    setIsAddModalOpen(true);
                  }
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3.5 pl-5">Identifier</th>
                  <th className="p-3.5">Details</th>
                  <th className="p-3.5">Relations & Status</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r: any) => {
                  const recordTitle =
                    r.name || r.code || r.brand_name || r.employee_name || "Record";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 pl-5 font-mono text-[11px] text-slate-400 max-w-[120px] truncate">
                        {r.id}
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 text-xs">{recordTitle}</div>
                        {r.email && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {r.email}
                          </div>
                        )}
                        {r.operating_calendar && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Calendar: <strong className="text-slate-700">{r.operating_calendar}</strong> • Min W:{" "}
                            {r.min_headcount_weekday} • Min Sun: {r.min_headcount_sunday}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-600">
                        {r.pod_name && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold">
                            {r.pod_name}
                          </span>
                        )}
                        {r.process_code && (
                          <span className="ml-1 text-indigo-700 font-bold font-mono text-[11px]">
                            ({r.process_code})
                          </span>
                        )}
                        {r.active !== undefined && (
                          <Badge variant={r.active ? "success" : "neutral"} size="sm" dot>
                            {r.active ? "Active" : "Inactive"}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3.5 pr-5 text-right">
                        <button
                          onClick={() => setDeleteTarget({ id: r.id, name: recordTitle })}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Record"
                          aria-label={`Delete ${recordTitle}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Record Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Create New {activeTab.replace("_", " ").toUpperCase()}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter configuration attributes to register this entity in the scheduling schema.
            </p>
          </div>
        }
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Name / Display Title
            </label>
            <input
              type="text"
              required
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              placeholder={`e.g. New ${activeTab.replace("_", " ")}`}
            />
          </div>

          {activeTab === "employees" && (
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Company Email Address
              </label>
              <input
                type="email"
                required
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                placeholder="colleague@opscompany.com"
              />
            </div>
          )}

          {activeTab === "processes" && (
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Process Code</label>
              <input
                type="text"
                required
                value={formData.code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                placeholder="e.g. NDR / RET / CS"
              />
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              Save Record
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modern SaaS Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Master Record"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Any linked shifts or references may be unassigned or affected.`}
        confirmText="Confirm Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
