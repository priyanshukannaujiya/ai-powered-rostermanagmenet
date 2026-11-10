"use client";

import React, { useState, useMemo } from "react";
import useSWR from "swr";
import {
  Database,
  Plus,
  Trash2,
  Pencil,
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

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Failed to fetch master data.");
  return json;
};

export default function MasterDataPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("employees");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { data, mutate, isLoading } = useSWR(`/api/master/${activeTab}`, fetcher);

  // New item modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: employeesData, mutate: mutateEmployees } = useSWR("/api/master/employees", fetcher);
  const { data: podsData, mutate: mutatePods } = useSWR("/api/master/pods", fetcher);
  const { data: brandsData, mutate: mutateBrands } = useSWR("/api/master/brands", fetcher);
  const { data: processesData, mutate: mutateProcesses } = useSWR("/api/master/processes", fetcher);
  const { data: brandProcessesData, mutate: mutateBrandProcesses } = useSWR("/api/master/brand_processes", fetcher);

  // Custom Delete Confirm Dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; entity: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/master/${deleteTarget.entity}?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast({
          type: "info",
          title: "Record Updated",
          message: `${deleteTarget.name} was deactivated or safely deleted.`,
        });
        setDeleteTarget(null);
        await Promise.all([
          mutate(),
          mutateEmployees(),
          mutatePods(),
          mutateBrands(),
          mutateProcesses(),
          mutateBrandProcesses(),
        ]);
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
      const res = await fetch(`/api/master/${activeTab}${editingId ? `?id=${encodeURIComponent(editingId)}` : ""}`, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        showToast({
          type: "success",
          title: editingId ? "Record Updated" : "Record Added",
          message: editingId
            ? "Master data updated. Existing monthly rosters remain unchanged until regenerated."
            : "Master data created. Generate the affected month to apply it to a roster.",
        });
        setIsAddModalOpen(false);
        setFormData({});
        setEditingId(null);
        window.dispatchEvent(new CustomEvent("roster:refresh"));
        await Promise.all([
          mutate(),
          mutateEmployees(),
          mutatePods(),
          mutateBrands(),
          mutateProcesses(),
          mutateBrandProcesses(),
        ]);
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
    { id: "weekly_offs", label: "Weekly Offs", icon: Calendar },
    { id: "holidays", label: "Holidays", icon: Calendar },
  ];
  const activeLabel: Record<string, string> = {
    employees: "Employee",
    pods: "Pod",
    brands: "Brand",
    processes: "Process / Task",
    brand_processes: "Brand-Process Rule",
    assignments: "Assignment",
    weekly_offs: "Weekly Off",
    holidays: "Holiday",
  };

  const beginCreate = () => {
    setEditingId(null);
    setFormData(["employees", "brands", "brand_processes", "assignments"].includes(activeTab) ? { active: true } : {});
    setIsAddModalOpen(true);
  };

  const beginEdit = (record: any) => {
    setEditingId(record.id);
    setFormData({
      name: record.name || "",
      email: record.email || "",
      podId: record.pod_id || "",
      leadEmployeeId: record.lead_employee_id || "",
      code: record.code || "",
      category: record.category || "",
      active: record.active ?? true,
      brandId: record.brand_id || "",
      processId: record.process_id || "",
      operatingCalendar: record.operating_calendar || "mon_sat_no_holidays",
      minHeadcountWeekday: record.min_headcount_weekday ?? 1,
      minHeadcountSunday: record.min_headcount_sunday ?? 0,
      minHeadcountHoliday: record.min_headcount_holiday ?? 0,
      employeeId: record.employee_id || "",
      brandProcessId: record.brand_process_id || "",
      startDate: String(record.start_date || "").slice(0, 10),
      endDate: record.end_date ? String(record.end_date).slice(0, 10) : "",
      priority: record.priority ?? 1,
      isExclusive: record.is_exclusive ?? false,
      weekday: record.weekday ?? 0,
      effectiveFrom: String(record.effective_from || "").slice(0, 10),
      effectiveTo: record.effective_to ? String(record.effective_to).slice(0, 10) : "",
      date: String(record.date || "").slice(0, 10),
      initialPassword: "",
    });
    setIsAddModalOpen(true);
  };

  const employees = employeesData?.data || [];
  const pods = podsData?.data || [];
  const brands = brandsData?.data || [];
  const processes = processesData?.data || [];
  const brandProcesses = brandProcessesData?.data || [];
  const setField = (field: string, value: any) => setFormData((previous: any) => ({ ...previous, [field]: value }));
  const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500";

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
          onClick={beginCreate}
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
        >
          Add {activeLabel[activeTab] || "Record"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        These are shared master records. Changes apply to future roster generation; existing monthly rosters change only when you explicitly regenerate that month.
      </p>

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
                      beginCreate();
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
                        {r.has_login !== undefined && (
                          <Badge variant={r.has_login ? "success" : "neutral"} size="sm">
                            {r.has_login ? "Login ready" : "No login"}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3.5 pr-5 text-right">
                        <button
                          onClick={() => beginEdit(r)}
                          className="mr-1.5 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                          title="Edit Record"
                          aria-label={`Edit ${recordTitle}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: r.id, name: recordTitle, entity: activeTab })}
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

      {/* Add or Edit Record Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingId(null);
        }}
        title={
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              {editingId ? "Edit" : "Add"} {activeLabel[activeTab] || "Record"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Changes update shared master data and do not rewrite existing monthly rosters.
            </p>
          </div>
        }
        size="md"
      >
        <form onSubmit={handleCreate} className="max-h-[70vh] space-y-4 overflow-y-auto px-1 text-xs">
          {["employees", "pods", "brands", "processes", "holidays"].includes(activeTab) && (
            <label className="block font-semibold text-slate-700">
              {activeTab === "holidays" ? "Holiday name" : activeTab === "processes" ? "Process name" : activeTab === "brands" ? "Brand name" : activeTab === "pods" ? "Pod name" : "Employee name"}
              <input required className={`${fieldClass} mt-1`} value={formData.name || ""} onChange={(event) => setField("name", event.target.value)} />
            </label>
          )}
          {activeTab === "employees" && (
            <>
              <label className="block font-semibold text-slate-700">Email address
                <input type="email" required className={`${fieldClass} mt-1`} value={formData.email || ""} onChange={(event) => setField("email", event.target.value)} />
              </label>
              <label className="block font-semibold text-slate-700">Pod
                <select className={`${fieldClass} mt-1`} value={formData.podId || ""} onChange={(event) => setField("podId", event.target.value)}>
                  <option value="">Unassigned</option>
                  {pods.map((pod: any) => <option key={pod.id} value={pod.id}>{pod.name}</option>)}
                </select>
              </label>
              <label className="block font-semibold text-slate-700">Initial password{editingId ? " (optional)" : " (optional)"}
                <input type="password" minLength={12} autoComplete="new-password" className={`${fieldClass} mt-1`} value={formData.initialPassword || ""} onChange={(event) => setField("initialPassword", event.target.value)} />
                <span className="mt-1 block font-normal text-slate-500">At least 12 characters to create or update this employee&apos;s login. Leave blank to keep no login/new or leave existing credentials unchanged.</span>
              </label>
            </>
          )}
          {activeTab === "pods" && (
            <label className="block font-semibold text-slate-700">Pod lead
              <select className={`${fieldClass} mt-1`} value={formData.leadEmployeeId || ""} onChange={(event) => setField("leadEmployeeId", event.target.value)}>
                <option value="">No lead assigned</option>
                {employees.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </label>
          )}
          {activeTab === "brands" && (
            <>
              <label className="block font-semibold text-slate-700">Brand code
                <input required className={`${fieldClass} mt-1 uppercase`} value={formData.code || ""} onChange={(event) => setField("code", event.target.value.toUpperCase())} />
              </label>
              <label className="block font-semibold text-slate-700">Category
                <input className={`${fieldClass} mt-1`} value={formData.category || ""} onChange={(event) => setField("category", event.target.value)} />
              </label>
            </>
          )}
          {activeTab === "processes" && (
            <label className="block font-semibold text-slate-700">Process code
              <input required className={`${fieldClass} mt-1 uppercase`} value={formData.code || ""} onChange={(event) => setField("code", event.target.value.toUpperCase())} />
            </label>
          )}
          {activeTab === "brand_processes" && (
            <>
              <label className="block font-semibold text-slate-700">Brand
                <select required className={`${fieldClass} mt-1`} value={formData.brandId || ""} onChange={(event) => setField("brandId", event.target.value)}>
                  <option value="">Select brand</option>
                  {brands.map((brand: any) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
              <label className="block font-semibold text-slate-700">Process / task
                <select required className={`${fieldClass} mt-1`} value={formData.processId || ""} onChange={(event) => setField("processId", event.target.value)}>
                  <option value="">Select process</option>
                  {processes.map((process: any) => <option key={process.id} value={process.id}>{process.name} ({process.code})</option>)}
                </select>
              </label>
              <label className="block font-semibold text-slate-700">Operating calendar
                <select className={`${fieldClass} mt-1`} value={formData.operatingCalendar || "mon_sat_no_holidays"} onChange={(event) => setField("operatingCalendar", event.target.value)}>
                  <option value="all_365">Every day, including holidays</option>
                  <option value="daily_no_holidays">Every day except holidays</option>
                  <option value="mon_sat_no_holidays">Monday-Saturday, except holidays</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {([
                ["minHeadcountWeekday", "Minimum weekday coverage"],
                ["minHeadcountSunday", "Minimum Sunday coverage"],
                ["minHeadcountHoliday", "Minimum holiday coverage"],
              ] as const).map(([field, label]) => (
                <label key={field} className="block font-semibold text-slate-700">{label}
                  <input type="number" min={0} required className={`${fieldClass} mt-1`} value={formData[field] ?? 0} onChange={(event) => setField(field, Number(event.target.value))} />
                </label>
              ))}
            </>
          )}
          {activeTab === "brand_processes" && (
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              <input type="checkbox" checked={formData.active !== false} onChange={(event) => setField("active", event.target.checked)} />
              Active
            </label>
          )}
          {activeTab === "assignments" && (
            <>
              <label className="block font-semibold text-slate-700">Employee
                <select required className={`${fieldClass} mt-1`} value={formData.employeeId || ""} onChange={(event) => setField("employeeId", event.target.value)}>
                  <option value="">Select employee</option>
                  {employees.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </label>
              <label className="block font-semibold text-slate-700">Brand / process / task
                <select required className={`${fieldClass} mt-1`} value={formData.brandProcessId || ""} onChange={(event) => setField("brandProcessId", event.target.value)}>
                  <option value="">Select brand process</option>
                  {brandProcesses.map((item: any) => <option key={item.id} value={item.id}>{item.brand_name} / {item.process_code}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-semibold text-slate-700">Start date
                  <input type="date" required className={`${fieldClass} mt-1`} value={formData.startDate || ""} onChange={(event) => setField("startDate", event.target.value)} />
                </label>
                <label className="block font-semibold text-slate-700">End date (optional)
                  <input type="date" className={`${fieldClass} mt-1`} value={formData.endDate || ""} onChange={(event) => setField("endDate", event.target.value)} />
                </label>
              </div>
              <label className="block font-semibold text-slate-700">Priority
                <input type="number" min={1} required className={`${fieldClass} mt-1`} value={formData.priority ?? 1} onChange={(event) => setField("priority", Number(event.target.value))} />
              </label>
              <label className="flex items-center gap-2 font-semibold text-slate-700">
                <input type="checkbox" checked={Boolean(formData.isExclusive)} onChange={(event) => setField("isExclusive", event.target.checked)} />
                Exclusive assignment
              </label>
              <label className="flex items-center gap-2 font-semibold text-slate-700">
                <input type="checkbox" checked={formData.active !== false} onChange={(event) => setField("active", event.target.checked)} />
                Active
              </label>
            </>
          )}
          {activeTab === "weekly_offs" && (
            <>
              <label className="block font-semibold text-slate-700">Employee
                <select required className={`${fieldClass} mt-1`} value={formData.employeeId || ""} onChange={(event) => setField("employeeId", event.target.value)}>
                  <option value="">Select employee</option>
                  {employees.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </label>
              <label className="block font-semibold text-slate-700">Weekly off day
                <select className={`${fieldClass} mt-1`} value={formData.weekday ?? 0} onChange={(event) => setField("weekday", Number(event.target.value))}>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-semibold text-slate-700">Effective from
                  <input type="date" required className={`${fieldClass} mt-1`} value={formData.effectiveFrom || ""} onChange={(event) => setField("effectiveFrom", event.target.value)} />
                </label>
                <label className="block font-semibold text-slate-700">Effective to (optional)
                  <input type="date" className={`${fieldClass} mt-1`} value={formData.effectiveTo || ""} onChange={(event) => setField("effectiveTo", event.target.value)} />
                </label>
              </div>
            </>
          )}
          {activeTab === "holidays" && (
            <label className="block font-semibold text-slate-700">Holiday date
              <input type="date" required className={`${fieldClass} mt-1`} value={formData.date || ""} onChange={(event) => setField("date", event.target.value)} />
            </label>
          )}
          {["employees", "brands"].includes(activeTab) && (
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              <input type="checkbox" checked={formData.active !== false} onChange={(event) => setField("active", event.target.checked)} />
              Active
            </label>
          )}
          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              {editingId ? "Save Changes" : "Create Record"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modern SaaS Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Deactivate or Delete Record"
        message={`Confirm the change for "${deleteTarget?.name}". Employees, brands, rules, and assignments are deactivated to preserve history. Pods and processes can only be deleted when nothing references them.`}
        confirmText="Confirm"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
