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
  User,
  ShieldCheck,
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
    { label: "Dimensions View", href: "/manager/views", icon: Layers },
    { label: "Analytics", href: "/manager/analytics", icon: BarChart3 },
    { label: "Excel Import", href: "/manager/import", icon: FileSpreadsheet },
    { label: "Approvals Queue", href: "/manager/approvals", icon: CheckSquare },
    { label: "Master Data", href: "/manager/master", icon: Database },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-900">
      {/* Top Enterprise SaaS Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Main Nav */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link href="/manager" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-600/30 group-hover:scale-105 transition-transform">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 text-sm tracking-tight block">
                    Smart Roster
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    Ops
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium block">
                  Deterministic Scheduling
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  pathname === link.href ||
                  (link.href.startsWith("/manager/roster") && pathname.startsWith("/manager/roster"));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150",
                      isActive
                        ? "bg-indigo-50 text-indigo-700 font-semibold shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    )}
                  >
                    <Icon className={cn("w-3.5 h-3.5", isActive ? "text-indigo-600" : "text-slate-400")} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Dynamic Month Selector */}
            <div className="hidden sm:block">
              <MonthPicker currentMonth={currentMonth} onMonthChange={handleMonthChange} />
            </div>

            {/* AI Assistant Button with ⌘K Badge */}
            <button
              onClick={() => setIsAiOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 text-indigo-700 text-xs font-semibold transition-all shadow-xs"
              title="Open AI Assistant (Cmd+K)"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">Assistant</span>
              <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono text-indigo-500 bg-white border border-indigo-200 rounded">
                ⌘K
              </kbd>
            </button>

            {/* User Profile Pill & Sign Out */}
            <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
              <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-semibold text-[11px] flex items-center justify-center shadow-xs">
                  MO
                </div>
                <div className="text-left hidden xl:block">
                  <div className="text-xs font-bold text-slate-800 leading-tight">Manager Ops</div>
                  <div className="text-[10px] text-slate-400 leading-tight">Admin Console</div>
                </div>
              </div>

              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                title="Sign Out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>

              {/* Mobile Menu Hamburger */}
              <button
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer / Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2 animate-slide-down shadow-dropdown">
            <div className="sm:hidden pb-2 mb-2 border-b border-slate-100">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">Target Period</span>
              <MonthPicker currentMonth={currentMonth} onMonthChange={handleMonthChange} />
            </div>

            <nav className="flex flex-col space-y-1">
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
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors",
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn("w-4 h-4", isActive ? "text-indigo-600" : "text-slate-400")} />
                      {link.label}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
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
