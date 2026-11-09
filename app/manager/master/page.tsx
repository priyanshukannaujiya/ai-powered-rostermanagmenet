"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function MasterDataPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("employees");

  const { data, mutate, isLoading } = useSWR(`/api/master/${activeTab}`, fetcher);

  // New item modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this master record?")) return;
    try {
      const res = await fetch(`/api/master/${activeTab}?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast({ type: "info", title: "Record Deleted", message: "Deleted successfully." });
        mutate();
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Delete Failed", message: err.message });
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
        showToast({ type: "success", title: "Created", message: "Record created successfully." });
        setIsAddModalOpen(false);
        setFormData({});
        mutate();
      } else {
        const json = await res.json();
        showToast({ type: "error", title: "Creation Failed", message: json.error });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message });
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

  const records = data?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Master Data Configuration</h1>
          <p className="text-xs text-slate-500">
            Create, update, and manage employees, pods, brands, processes, and operating rules without code changes.
          </p>
        </div>

        <button
          onClick={() => {
            setFormData({});
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Record
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold transition-all shrink-0 ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="p-3 font-semibold">ID / Key</th>
                <th className="p-3 font-semibold">Details</th>
                <th className="p-3 font-semibold">Relations / Status</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400">
                    No records found for {activeTab}.
                  </td>
                </tr>
              ) : (
                records.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 font-mono text-[11px] text-slate-500">{r.id}</td>
                    <td className="p-3 font-semibold text-slate-900">
                      {r.name || r.code || r.brand_name || r.employee_name || "Record"}
                      {r.email && <div className="text-[10px] text-slate-400 font-normal">{r.email}</div>}
                      {r.operating_calendar && (
                        <div className="text-[10px] text-slate-500 font-normal">
                          Calendar: {r.operating_calendar} • Min W: {r.min_headcount_weekday} • Min Sun:{" "}
                          {r.min_headcount_sunday}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-slate-600">
                      {r.pod_name || (r.active !== undefined ? (r.active ? "Active" : "Inactive") : "Configured")}
                      {r.process_code && <span className="ml-1 text-indigo-600 font-bold">({r.process_code})</span>}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Add New {activeTab.replace("_", " ").toUpperCase()}</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Name / Title</label>
                <input
                  type="text"
                  required
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  placeholder="e.g. New Pod / Brand Name"
                />
              </div>

              {activeTab === "employees" && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email || ""}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    placeholder="e.g. EXP"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-indigo-600 text-white font-semibold rounded-xl"
                >
                  {submitting ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
