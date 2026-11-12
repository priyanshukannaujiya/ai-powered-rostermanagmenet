"use client";

import React from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useSWRConfig } from "swr";
import { Calendar, User, LogOut } from "lucide-react";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const currentMonth = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const handleSignOut = async () => {
    // Isolate & wipe client-side SWR cache completely upon logout
    try {
      await mutate(() => true, undefined, { revalidate: false });
    } catch {
      // ignore
    }
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/me" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-cyan-600 flex items-center justify-center text-white shadow-sm shadow-cyan-600/30 group-hover:scale-105 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 text-sm tracking-tight block">
                  Smart Roster
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-cyan-50 text-cyan-700 border border-cyan-200/60">
                  Employee
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">
                My Shift Schedule & Leaves
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="px-3 py-1 bg-slate-100 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-xs">
              <Calendar className="w-3.5 h-3.5 text-cyan-600" />
              <span>{currentMonth}</span>
            </div>

            <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
              <button
                onClick={handleSignOut}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                title="Sign Out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
