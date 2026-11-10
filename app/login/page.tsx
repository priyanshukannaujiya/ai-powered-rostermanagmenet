"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  ShieldCheck,
  LogIn,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowRight,
  Clock,
  Shield,
  Layers,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        setError("Invalid email or password. Please verify your credentials.");
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

  return (
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
      {/* Left Column: Professional Platform Overview */}
      <div className="lg:col-span-6 xl:col-span-7 space-y-7 text-left">
        {/* Brand Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">
                Smart Roster
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                Operations
              </span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              Workforce Operations & Shift Management System
            </p>
          </div>
        </div>

        {/* Headline */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-snug">
            Automated workforce scheduling and shift management.
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
            Coordinate team capacity, enforce minimum staffing requirements, and manage shift schedules across multi-brand operations with real-time leave replanning.
          </p>
        </div>

        {/* System Capabilities Overview */}
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 border border-indigo-100">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Constraint-Based Scheduling</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Automatically verifies working limits, mandatory weekly rest periods, and brand coverage requirements.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-100">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Real-Time Schedule Replanning</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Approved leaves instantly recalculate future assignments while preserving pinned shifts and historical records.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 border border-blue-100">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Pod & Capacity Balancing</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Distributes shifts evenly across operational pods to prevent employee fatigue and ensure balanced coverage.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 text-xs text-slate-500">
          Your organization&apos;s employees, pods, brands, and schedules appear after the manager imports roster data.
        </div>
      </div>

      {/* Right Column: Clean White Authentication Card */}
      <div className="lg:col-span-6 xl:col-span-5 w-full">
        <div className="bg-white border border-slate-200 rounded-2xl p-7 sm:p-8 shadow-xl shadow-slate-200/50 text-slate-900">
          {/* Form Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Sign In
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your work email and password to access the portal.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2.5 animate-slide-down">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-xs"
                  placeholder="name@opscompany.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-semibold transition-colors duration-150 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 mt-2 cursor-pointer"
            >
              {loading ? (
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-4 h-4 ml-0.5 opacity-80" />
                </>
              )}
            </button>
          </form>

          {/* Security & Access Info */}
          <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              Role-Based Access Control
            </span>
            <span>PostgreSQL Protected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-12 bg-slate-50 text-slate-900 relative">
      {/* Subtle Clean Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f00a_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f00a_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />

      <Suspense
        fallback={
          <div className="text-slate-600 text-xs flex items-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent" />
            Loading authentication portal...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
