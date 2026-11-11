"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Calendar,
  LayoutDashboard,
  Grid3X3,
  Layers,
  CheckSquare,
  Database,
  BarChart3,
  FileSpreadsheet,
  Sparkles,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { cn } from "@/lib/utils";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const defaultMonth = new Date().toISOString().slice(0, 7);
  const rosterMonthMatch = pathname.match(/\/manager\/roster\/(\d{4}-\d{2})/);
  const [currentMonth, setCurrentMonth] = useState<string>(
    rosterMonthMatch ? rosterMonthMatch[1] : defaultMonth
  );

  useEffect(() => {
    if (rosterMonthMatch && rosterMonthMatch[1] !== currentMonth) {
      setCurrentMonth(rosterMonthMatch[1]);
    }
  }, [rosterMonthMatch, currentMonth]);

  // Keyboard shortcut Cmd+K / Ctrl+K to toggle AI assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsAiOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMonthChange = (newMonth: string) => {
    setCurrentMonth(newMonth);
    if (pathname.startsWith("/manager/roster")) {
      router.push(`/manager/roster/${newMonth}`);
    }
  };

  const navLinks = [
    { label: "Dashboard", href: "/manager", icon: LayoutDashboard },
    { label: "Roster Grid", href: `/manager/roster/${currentMonth}`, icon: Grid3X3 },
    { label: "Monthly Rosters", href: "/manager/rosters", icon: Calendar },
    { label: "Dimensions View", href: "/manager/views", icon: Layers },
    { label: "Analytics", href: "/manager/analytics", icon: BarChart3 },
    { label: "Excel Import", href: "/manager/import", icon: FileSpreadsheet },
    { label: "Approvals Queue", href: "/manager/approvals", icon: CheckSquare },
    { label: "Master Data", href: "/manager/master", icon: Database },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-900">
      {/* Top Enterprise SaaS Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/manager" className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Calendar className="h-5 w-5" />
            </span>
            <span className="hidden sm:block">
              <span className="flex items-center gap-2">
                <span className="block text-sm font-bold tracking-tight text-slate-950">Smart Roster</span>
                <span className="rounded-md border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">Ops</span>
              </span>
              <span className="block text-[11px] font-medium text-slate-500">Workforce operations</span>
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <MonthPicker currentMonth={currentMonth} onMonthChange={handleMonthChange} />
            </div>
            <button
              onClick={() => setIsAiOpen(true)}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
              title="Open AI Assistant (Ctrl+K)"
            >
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <span className="hidden sm:inline">Assistant</span>
              <kbd className="hidden 2xl:inline-flex rounded border border-indigo-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-indigo-500">Ctrl K</kbd>
            </button>
            <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <span className="hidden items-center gap-2 xl:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">M</span>
              <span className="text-left">
                <span className="block text-xs font-semibold leading-4 text-slate-800">Manager</span>
                <span className="block text-[10px] leading-4 text-slate-500">Admin console</span>
              </span>
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 xl:hidden"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <nav aria-label="Manager navigation" className="hidden border-t border-slate-100 xl:block">
          <div className="mx-auto flex h-12 max-w-7xl items-center gap-1 px-4 sm:px-6 lg:px-8">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                pathname === link.href ||
                (link.href.startsWith("/manager/roster") && pathname.startsWith("/manager/roster"));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-indigo-600" : "text-slate-400")} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 shadow-dropdown xl:hidden sm:px-6">
            <div className="mb-3 sm:hidden">
              <span className="mb-1.5 block text-xs font-semibold text-slate-500">Roster month</span>
              <MonthPicker currentMonth={currentMonth} onMonthChange={handleMonthChange} />
            </div>
            <nav aria-label="Manager navigation" className="grid gap-1 sm:grid-cols-2">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  pathname === link.href ||
                  (link.href.startsWith("/manager/roster") && pathname.startsWith("/manager/roster"));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center justify-between rounded-xl px-3 text-sm font-semibold transition-colors",
                      isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className={cn("h-4 w-4", isActive ? "text-indigo-600" : "text-slate-400")} />
                      {link.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* AI Assistant Drawer */}
      <AiAssistantDrawer
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        currentMonth={currentMonth}
      />
    </div>
  );
}
