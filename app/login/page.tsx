"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Calendar, Users, LogIn, Sparkles, AlertCircle } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("manager@opscompany.com");
  const [password, setPassword] = useState("Manager@123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        setError("Invalid email or password. Please verify credentials.");
        setLoading(false);
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during login.");
      setLoading(false);
    }
  };

  const setPreset = (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setError("");
  };

  return (
    <div className="max-w-md w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
      {/* Brand Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Smart Roster</h1>
          <p className="text-xs text-slate-400">Operations Planning & Scheduling</p>
        </div>
      </div>

      <p className="text-sm text-slate-300 mt-4 mb-6">
        Deterministic scheduling, automated conflict resolution, and pod capacity management across D2C brands.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-rose-950/60 border border-rose-700/80 rounded-xl text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            placeholder="name@opscompany.com"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Sign In
            </>
          )}
        </button>
      </form>

      {/* Demo Fast-Switch Buttons */}
      <div className="mt-8 pt-6 border-t border-slate-800">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>1-Click Demo Profiles</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPreset("manager@opscompany.com", "Manager@123")}
            className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500/50 transition-all"
          >
            <div className="font-semibold text-indigo-300 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-indigo-400" /> Manager
            </div>
            <div className="text-[10px] text-slate-400 truncate">manager@opscompany.com</div>
          </button>

          <button
            type="button"
            onClick={() => setPreset("lead.pod1@opscompany.com", "Lead@123")}
            className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 transition-all"
          >
            <div className="font-semibold text-emerald-300 flex items-center gap-1">
              <Users className="w-3 h-3 text-emerald-400" /> Pod Lead
            </div>
            <div className="text-[10px] text-slate-400 truncate">lead.pod1@opscompany.com</div>
          </button>

          <button
            type="button"
            onClick={() => setPreset("employee.priya@opscompany.com", "Employee@123")}
            className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/50 transition-all"
          >
            <div className="font-semibold text-cyan-300">Emp: Priya</div>
            <div className="text-[10px] text-slate-400 truncate">Brewhaus Coffee (Sole)</div>
          </button>

          <button
            type="button"
            onClick={() => setPreset("employee.aarav@opscompany.com", "Employee@123")}
            className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-amber-500/50 transition-all"
          >
            <div className="font-semibold text-amber-300">Emp: Aarav</div>
            <div className="text-[10px] text-slate-400 truncate">Lumora Skincare</div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-slate-100">
      <Suspense fallback={<div className="text-white text-xs">Loading login interface...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
