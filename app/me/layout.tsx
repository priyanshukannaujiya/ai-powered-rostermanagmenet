"use client";

import React from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Calendar, User, LogOut } from "lucide-react";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/me" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-600 flex items-center justify-center text-white shadow-md shadow-cyan-600/30">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm tracking-tight block">
                Smart Roster
              </span>
              <span className="text-[10px] text-cyan-600 uppercase tracking-wider block font-semibold">
                Employee Portal
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
              November 2026
            </div>

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

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
