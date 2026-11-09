"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  ShieldCheck,
  Users,
  LogIn,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  Building2,
  Lock,
  Mail,
  CheckCircle2,
  ArrowRight,
  Activity,
  Layers,
  Cpu,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("manager@opscompany.com");
  const [password, setPassword] = useState("Manager@123");
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
        setError("Invalid credentials. Please verify email and password.");
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

  const demoProfiles = [
    {
      role: "Operations Manager",
      email: "manager@opscompany.com",
      pass: "Manager@123",
      tag: "Full Admin",
      badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-400/30",
      icon: ShieldCheck,
      desc: "System oversight, master data & conflict resolution",
    },
    {
      role: "Pod Lead",
      email: "lead.pod1@opscompany.com",
      pass: "Lead@123",
      tag: "Alpha Pod",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
      icon: Users,
      desc: "Pod team capacity, approvals & shift replanning",
    },
    {
      role: "Priya Patel",
      email: "employee.priya@opscompany.com",
      pass: "Employee@123",
      tag: "Staff Lead",
      badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-400/30",
      icon: UserCheck,
      desc: "Beta Pod Lead & Brewhaus Coffee Specialist",
    },
    {
      role: "Aarav Sharma",
      email: "employee.aarav@opscompany.com",
      pass: "Employee@123",
      tag: "Staff Member",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-400/30",
      icon: Building2,
      desc: "Alpha Pod Specialist on Lumora Skincare",
    },
  ];

  const selectProfile = (pEmail: string, pPass: string) => {
    setEmail(pEmail);
    setPassword(pPass);
    setError("");
  };

  return (
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
      {/* Left Column: SaaS Value Proposition & Architecture */}
      <div className="lg:col-span-6 xl:col-span-7 space-y-6 text-left">
        {/* Logo & Category */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-xl shadow-indigo-500/25 border border-indigo-400/30">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-white">Smart Roster</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 uppercase tracking-widest">
                Enterprise
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Workforce Operations & Scheduling Engine</p>
          </div>
        </div>

        {/* Main Pitch */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Algorithmic Workforce Operations for Multi-Brand D2C Teams.
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
            Deterministic constraint scheduling, automated leave replanning, and pod workload balancing. Built on Neon Serverless PostgreSQL.
          </p>
        </div>

        {/* Live Operational Metrics Card */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl shadow-xl space-y-3.5">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-300">Live Operations Graph</span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">November 2026 Cycle</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <div className="text-lg font-bold text-white tracking-tight">98.4%</div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Coverage</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <div className="text-lg font-bold text-indigo-400 tracking-tight">32 Staff</div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">6 Pods</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <div className="text-lg font-bold text-cyan-400 tracking-tight">&lt; 50ms</div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Replan Speed</div>
            </div>
          </div>
        </div>

        {/* Enterprise Pillar List */}
        <div className="space-y-2.5 pt-1 text-xs">
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <span><strong>Deterministic Constraints</strong>: Single status per day, 365-day min headcount & certified skills</span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="w-5 h-5 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <span><strong>Automated Replan Engine</strong>: Leave approvals dynamically re-solve unpinned future days</span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="w-5 h-5 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <span><strong>Single Point of Failure (SPOF) Guard</strong>: Dynamic cross-trained backup allocation</span>
          </div>
        </div>
      </div>

      {/* Right Column: Authentication Console Card */}
      <div className="lg:col-span-6 xl:col-span-5 w-full">
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-7 sm:p-8 shadow-2xl backdrop-blur-2xl text-slate-100 relative">
          {/* Card Ambient Glow */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Card Title */}
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Sign In to Console</span>
              <Shield className="w-4 h-4 text-indigo-400" />
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select a test profile or enter enterprise credentials.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-rose-950/80 border border-rose-700/80 rounded-2xl text-rose-200 text-xs flex items-center gap-2.5 animate-slide-down">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/80 border border-slate-700/90 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                  placeholder="name@opscompany.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Password
                </label>
                <span className="text-[11px] text-slate-500 font-mono">Demo: Manager@123</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-800/80 border border-slate-700/90 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
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
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:from-indigo-700 active:to-indigo-800 text-white rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50 mt-2 cursor-pointer"
            >
              {loading ? (
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Authenticate & Launch Console</span>
                  <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
                </>
              )}
            </button>
          </form>

          {/* 1-Click Fast Switch Enterprise Profiles */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>1-Click Test Profiles</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Instant Autofill</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {demoProfiles.map((p) => {
                const Icon = p.icon;
                const isSelected = email === p.email;
                return (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => selectProfile(p.email, p.pass)}
                    className={cn(
                      "p-2.5 text-left rounded-xl border transition-all duration-150 flex flex-col justify-between cursor-pointer",
                      isSelected
                        ? "bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50"
                        : "bg-slate-800/40 hover:bg-slate-800 border-slate-800 hover:border-slate-700"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5 truncate text-[11px]">
                        <Icon className="w-3 h-3 shrink-0 text-slate-400" />
                        <span className="truncate">{p.role}</span>
                      </div>
                      <span className={cn("text-[8px] px-1 py-0.2 rounded font-bold border shrink-0", p.badgeColor)}>
                        {p.tag}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate font-mono">{p.email}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Security Footnote */}
          <div className="mt-5 pt-4 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Role-Based Access Control
            </span>
            <span className="font-mono">Neon Serverless TLS</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-12 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950 text-slate-100 relative overflow-hidden">
      {/* Background Architectural Mesh & Glow */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#3341550f_1px,transparent_1px),linear-gradient(to_bottom,#3341550f_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />

      <Suspense
        fallback={
          <div className="text-white text-xs flex items-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
            Loading authentication portal...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
