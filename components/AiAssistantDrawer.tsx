"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Trash2,
  Clock,
  Copy,
  Check,
  ChevronRight,
  ShieldAlert,
  BarChart3,
  Users2,
  AlertTriangle,
  FileCheck2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Lightweight Markdown Renderer for enterprise intelligence responses
function MarkdownView({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-2 text-xs leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Dividers
        if (trimmed === "---") {
          return <hr key={idx} className="my-2 border-slate-200/80" />;
        }

        // H3 Header (### Header)
        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={idx}
              className="text-xs font-bold text-slate-900 tracking-tight pt-1 pb-0.5 flex items-center gap-1.5"
            >
              {trimmed.replace("### ", "")}
            </h4>
          );
        }

        // H4 Header (#### Header)
        if (trimmed.startsWith("#### ")) {
          return (
            <h5 key={idx} className="text-[11px] font-bold text-slate-800 tracking-tight pt-1">
              {trimmed.replace("#### ", "")}
            </h5>
          );
        }

        // Bullet point (• or -)
        if (trimmed.startsWith("• ") || trimmed.startsWith("- ")) {
          const itemText = trimmed.replace(/^[•\-]\s*/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
              <div className="flex-1">{renderFormattedText(itemText)}</div>
            </div>
          );
        }

        // Nested sub-bullet (e.g. "  - ")
        if (line.startsWith("  - ") || line.startsWith("  • ")) {
          const subText = line.trim().replace(/^[•\-]\s*/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-4 text-slate-600 text-[11px]">
              <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0 mt-1.5" />
              <div className="flex-1">{renderFormattedText(subText)}</div>
            </div>
          );
        }

        // Callout box if starts with 💡 or ⚠️
        if (trimmed.startsWith("💡") || trimmed.startsWith("⚠️") || trimmed.startsWith("✅")) {
          return (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] font-medium text-slate-800 my-1"
            >
              {renderFormattedText(trimmed)}
            </div>
          );
        }

        // Standard Paragraph
        return (
          <p key={idx} className="text-slate-700">
            {renderFormattedText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

// Helper to render bold (**bold**), italics (*italic*), and code (`code`)
function renderFormattedText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic text-slate-600">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="font-mono text-[10px] bg-slate-100 text-indigo-700 px-1.5 py-0.2 rounded border border-slate-200/60 font-semibold"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function AiAssistantDrawer({
  isOpen,
  onClose,
  currentMonth = "2026-11",
}: {
  isOpen: boolean;
  onClose: () => void;
  currentMonth?: string;
}) {
  const [messages, setMessages] = useState<
    Array<{ role: "assistant" | "user"; text: string; time: string }>
  >([
    {
      role: "assistant",
      text: `### 🤖 Operations Intelligence Active (${currentMonth})

I am your active Operations Intelligence Copilot with live access to the scheduler constraint graph.

I analyze:
• **Full System Health** — Overall coverage score, shift volumes, and blocking violations
• **Pod Workload & Equity** — Capacity distribution, overwork alerts (>24 shifts), rest day compliance
• **Single-Resource (SPOF) Risks** — Vulnerability analysis on single-staffed D2C brands
• **Leave Queue & Replanning** — Predictive impact simulations on pending employee requests

Click any quick-audit chip below or ask any operational query!`,
      time: "Live",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const sendMessage = async (textToSend?: string) => {
    const q = textToSend || input;
    if (!q.trim() || loading) return;

    const userMsg = {
      role: "user" as const,
      text: q,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, month: currentMonth }),
      });

      const data = await res.json();
      const botMsg = {
        role: "assistant" as const,
        text: data.reply || "I could not analyze that request. Please try rephrasing.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);

      // If a leave was approved or system data modified, trigger live client revalidation
      if (
        data?.toolUsed === "approve_leave" ||
        data?.data?.systemReflected ||
        data?.data?.approved
      ) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("roster:refresh"));
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `### ⚠️ Connection Notice\nError querying live constraints: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClear = () => {
    setMessages([
      {
        role: "assistant",
        text: "Conversation reset. Select a quick audit action below or ask about live roster constraints.",
        time: "Just now",
      },
    ]);
  };

  // Categorized Quick Action Chips for Managers and Pod Leads
  const promptChips = [
    { label: "Approve Pending Leave", icon: FileCheck2, prompt: "Approve pending leave request and replan future shifts" },
    { label: "Approve Priya's Leave", icon: Check, prompt: "Approve leave for Priya Patel" },
    { label: "Weekly-Off Equity & Fairness", icon: Users2, prompt: "Analyze employee preferences and fair weekly-off distribution across pods" },
    { label: "System Health Audit", icon: BarChart3, prompt: "Give me a full system health audit for November 2026" },
    { label: "Pod Workload & Capacity", icon: Users2, prompt: "Analyze pod workload, shift equity, and capacity distribution" },
    { label: "SPOF Risk Analysis", icon: AlertTriangle, prompt: "Which single-resource brands are at risk if staff take leave?" },
    { label: "Pending Leave Queue", icon: FileCheck2, prompt: "Review pending leave requests and their replan impact" },
    { label: "Explain Blocking Conflicts", icon: ShieldAlert, prompt: "Explain all blocking conflicts and suggested manager fixes" },
    { label: "Who covers Brewhaus CS?", icon: Sparkles, prompt: "Who can cover Brewhaus CS on 15 Nov?" },
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-xs animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-white shadow-modal border-l border-slate-200/90 flex flex-col animate-slide-in font-sans">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-tight text-white">Operations Intelligence</h3>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-wider">
                  Live Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Audits, constraint validation & capacity balance ({currentMonth})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Reset conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Audit Action Chips Bar */}
        <div className="p-2.5 bg-slate-50 border-b border-slate-200/80 shrink-0">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-0.5">
            Quick Operations Audits
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
            {promptChips.map((chip, idx) => {
              const Icon = chip.icon;
              return (
                <button
                  key={idx}
                  onClick={() => sendMessage(chip.prompt)}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors shrink-0 shadow-xs font-semibold flex items-center gap-1.5"
                >
                  <Icon className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={cn("flex items-start gap-2.5", m.role === "user" ? "flex-row-reverse" : "")}
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-xl flex items-center justify-center text-xs shrink-0 shadow-xs",
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-900 text-indigo-300 border border-slate-800"
                )}
              >
                {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs transition-all relative group",
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-none font-medium"
                    : "bg-white border border-slate-200/90 text-slate-800 rounded-tl-none font-normal"
                )}
              >
                {m.role === "user" ? (
                  <div className="whitespace-pre-wrap">{m.text}</div>
                ) : (
                  <MarkdownView content={m.text} />
                )}

                <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100/60 text-[9px]">
                  <span className="font-mono text-slate-400">
                    {m.role === "user" ? "You" : "Ops Copilot"} • {m.time}
                  </span>

                  {m.role === "assistant" && (
                    <button
                      onClick={() => handleCopy(m.text, idx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 flex items-center gap-1"
                      title="Copy response"
                    >
                      {copiedIndex === idx ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2.5 text-xs text-slate-600 py-3 px-2 bg-indigo-50/70 border border-indigo-100 rounded-2xl animate-pulse">
              <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-600 border-t-transparent shrink-0" />
              <span className="font-medium">
                Evaluating live constraint graph, pod quotas, and brand coverage...
              </span>
            </div>
          )}
        </div>

        {/* Input Box */}
        <div className="p-3 bg-white border-t border-slate-200/80 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about system health, pod equity, SPOF risks, or backups..."
              className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400 font-medium"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl disabled:opacity-40 transition-all shadow-sm shadow-indigo-600/20 shrink-0"
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
