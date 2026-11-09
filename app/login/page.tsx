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
} from "lucide-react";
import { Button } from "@/components/ui/Button";

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

  const demoProfiles = [
    {
      role: "Operations Manager",
      email: "manager@opscompany.com",
      pass: "Manager@123",
      tag: "Full Admin",
      tagColor: "bg-indigo-500/20 text-indigo-300 border-indigo-400/30",
      icon: ShieldCheck,
      desc: "Roster generation, override permissions & master data",
    },
    {
      role: "Pod Lead",
      email: "lead.pod1@opscompany.com",
      pass: "Lead@123",
      tag: "Approvals",
      tagColor: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
      icon: Users,
      desc: "Simulate leave replans & balance pod capacity",
    },
    {
      role: "Priya Sharma",
      email: "employee.priya@opscompany.com",
      pass: "Employee@123",
      tag: "Brewhaus",
      tagColor: "bg-cyan-500/20 text-cyan-300 border-cyan-400/30",
      icon: UserCheck,
      desc: "Sole qualified resource on Brewhaus CS",
    },
    {
      role: "Aarav Patel",
      email: "employee.aarav@opscompany.com",
      pass: "Employee@123",
      tag: "Lumora",
      tagColor: "bg-amber-500/20 text-amber-300 border-amber-400/30",
      icon: Building2,
      desc: "Cross-trained specialist on Lumora Skincare",
    },
  ];

  const selectProfile = (pEmail: string, pPass: string) => {
    setEmail(pEmail);
    setPassword(pPass);
    setError("");
  };

  return (
    <div className="max-w-md w-full bg-slate-900/95 border border-slate-800 rounded-3xl p-8 sm:p-9 shadow-modal backdrop-blur-2xl text-slate-100">
      {/* Brand Header */}
      <div className="flex items-center gap-3.5 mb-2">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">Smart Roster</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
              SaaS v1.0
            </span>
          </div>
          <p className="text-xs text-slate-400">Enterprise Operations Planning & Scheduling</p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3 mb-6 leading-relaxed">
        Deterministic constraint scheduling, automated conflict resolution, and pod capacity management across D2C brands.
      </p>

      {error && (
        <div className="mb-5 p-3.5 bg-rose-950/70 border border-rose-700/80 rounded-2xl text-rose-200 text-xs flex items-center gap-2.5 animate-slide-down">
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
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
              placeholder="name@opscompany.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50 mt-2"
        >
          {loading ? (
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Sign In to Console
            </>
          )}
        </button>
      </form>

      {/* Demo Fast-Switch Buttons */}
      <div className="mt-7 pt-6 border-t border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>1-Click Enterprise Test Profiles</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Instant Auth</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {demoProfiles.map((p) => {
            const Icon = p.icon;
            const isSelected = email === p.email;
            return (
              <button
                key={p.email}
                type="button"
                onClick={() => selectProfile(p.email, p.pass)}
                className={`p-3 text-left rounded-2xl border transition-all duration-150 ${
                  isSelected
                    ? "bg-slate-800 border-indigo-500 ring-1 ring-indigo-500/50"
                    : "bg-slate-800/50 hover:bg-slate-800 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5 truncate">
                    <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{p.role}</span>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold border shrink-0 ${p.tagColor}`}
                  >
                    {p.tag}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate font-mono">{p.email}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-slate-950 text-slate-100 relative overflow-hidden">
      {/* Background Subtle Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

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
