"use client";

import React, { useState, Suspense } from "react";
import { getSession, signIn } from "next-auth/react";
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
        email: email.trim(),
        password,
      });

      if (!result || result.error || !result.ok) {
        setError("Invalid email or password. Please verify your credentials.");
        setLoading(false);
        return;
      }

      // Read the newly issued session before navigating. This avoids routing
      // to "/" while the client still has a stale session snapshot.
      const session = await getSession();
      const role = (session?.user as any)?.role as string | undefined;
      if (!role) {
        setError("Sign-in was accepted, but your session could not be loaded. Please refresh and try again.");
        setLoading(false);
        return;
      }

      const defaultDestination =
        role === "manager" || role === "pod_lead" ? "/manager" : "/me";
      const requestedDestination =
        callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
          ? callbackUrl
          : defaultDestination;
      const isManagerRole = role === "manager" || role === "pod_lead";
      const destinationMatchesRole =
        requestedDestination === "/" ||
        (isManagerRole && requestedDestination.startsWith("/manager")) ||
        (!isManagerRole && requestedDestination.startsWith("/me"));

      router.replace(
        requestedDestination === "/" || !destinationMatchesRole
          ? defaultDestination
          : requestedDestination
      );
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during login.");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
      {/* Left Column: Professional Platform Overview */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-7 text-left text-white shadow-xl shadow-slate-900/10 sm:p-9 lg:col-span-7 lg:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative space-y-7">
        {/* Brand Header */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-indigo-200">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">Smart Roster</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-100">
                Operations
              </span>
            </div>
            <p className="text-sm text-slate-300">Workforce Operations & Shift Management System</p>
          </div>
        </div>

        {/* Headline */}
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">One workspace for every shift</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl xl:text-[2.75rem]">
            Plan coverage with clarity. Keep every team in sync.
          </h1>
          <p className="max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
            Coordinate team capacity, enforce minimum staffing requirements, and manage shift schedules across multi-brand operations with real-time leave replanning.
          </p>
        </div>

        {/* System Capabilities Overview */}
        <div className="grid gap-3 pt-1">
          <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-indigo-200">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Constraint-based scheduling</h2>
              <p className="mt-1 text-sm leading-5 text-slate-300">
                Automatically verifies working limits, mandatory weekly rest periods, and brand coverage requirements.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-emerald-200">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Responsive schedule replanning</h2>
              <p className="mt-1 text-sm leading-5 text-slate-300">
                Approved leaves instantly recalculate future assignments while preserving pinned shifts and historical records.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sky-200">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Connected teams and capacity</h2>
              <p className="mt-1 text-sm leading-5 text-slate-300">
                Distributes shifts evenly across operational pods to prevent employee fatigue and ensure balanced coverage.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 text-sm leading-5 text-slate-300">
          Sign in to view the schedules and operational data configured for your organization.
        </div>
        </div>
      </div>

      {/* Right Column: Clean White Authentication Card */}
      <div className="flex w-full items-center lg:col-span-5">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-7 text-slate-900 shadow-xl shadow-slate-900/5 sm:p-9">
          {/* Form Header */}
          <div className="mb-7">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Secure workspace access</p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">
              Sign in to your portal
            </h2>
            <p className="mt-2 text-sm leading-5 text-slate-500">
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
              <label className="mb-2 block text-sm font-semibold text-slate-700">
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
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  placeholder="name@opscompany.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">
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
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
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
              className="mt-2 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-indigo-700 active:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="mt-6 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Shield className="h-4 w-4 text-emerald-600" />
              Secure, role-based access
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Accounts are provided by your organization. Contact your manager if you need access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-900 sm:p-6 lg:p-10">
      {/* Subtle Clean Grid Pattern */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.10),transparent_38%),linear-gradient(to_right,#cbd5e122_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e122_1px,transparent_1px)] bg-[size:auto,3rem_3rem,3rem_3rem]" />

      <Suspense
        fallback={
          <div className="text-slate-600 text-xs flex items-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent" />
            Loading authentication portal...
          </div>
        }
      >
        <div className="relative z-10 w-full">
          <LoginForm />
        </div>
      </Suspense>
    </div>
  );
}
