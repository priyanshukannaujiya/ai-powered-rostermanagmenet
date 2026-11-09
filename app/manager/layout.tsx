"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Calendar,
  LayoutDashboard,
  Grid3X3,
  Layers,
  CheckSquare,
  Database,
  Sparkles,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAiOpen, setIsAiOpen] = useState(false);
  const currentMonth = "2026-11";

  const navLinks = [
    { label: "Dashboard", href: "/manager", icon: LayoutDashboard },
    { label: "Roster Grid", href: `/manager/roster/${currentMonth}`, icon: Grid3X3 },
    { label: "Dimensions View", href: "/manager/views", icon: Layers },
    { label: "Approvals Queue", href: "/manager/approvals", icon: CheckSquare },
    { label: "Master Data", href: "/manager/master", icon: Database },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Main Nav */}
          <div className="flex items-center gap-8">
            <Link href="/manager" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm tracking-tight block">
                  Smart Roster
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                  Manager Console
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  pathname === link.href ||
                  (link.href.startsWith("/manager/roster") && pathname.startsWith("/manager/roster"));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            {/* Month Badge */}
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Nov 2026</span>
            </div>

            {/* AI Assistant Pill */}
            <button
              onClick={() => setIsAiOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 text-indigo-700 text-xs font-medium transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">AI Assistant</span>
            </button>

            {/* Logout */}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
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
