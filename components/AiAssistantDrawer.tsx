"use client";

import React, { useState } from "react";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  AlertTriangle,
  Lightbulb,
  CornerDownLeft,
} from "lucide-react";

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
      text: "Hello! I am your AI Roster Assistant. Ask me to explain conflicts, check staff coverage, or suggest backups for single-resource brands.",
      time: "Just now",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (textToSend?: string) => {
    const q = textToSend || input;
    if (!q.trim() || loading) return;

    const userMsg = { role: "user" as const, text: q, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
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
        text: data.reply || "Sorry, I could not process that question.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Error connecting to assistant: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-slide-in">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Roster Assistant</h3>
            <p className="text-[11px] text-slate-400">Read-only scheduling intelligence</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Suggested Fast Prompts */}
      <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex gap-1.5 overflow-x-auto text-[11px]">
        <button
          onClick={() => sendMessage("Explain the current conflicts in plain English")}
          className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 transition-colors shrink-0"
        >
          Explain conflicts
        </button>
        <button
          onClick={() => sendMessage("Who covers NDR on Sunday 15 Nov?")}
          className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 transition-colors shrink-0"
        >
          Who covers NDR on 15 Nov?
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                m.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-indigo-300"
              }`}
            >
              {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "bg-indigo-600 text-white rounded-tr-none"
                  : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              <div
                className={`text-[9px] mt-1 text-right ${
                  m.role === "user" ? "text-indigo-200" : "text-slate-400"
                }`}
              >
                {m.time}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
            <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-600 border-t-transparent" />
            Analyzing roster constraints...
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="p-3 bg-white border-t border-slate-200">
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
            placeholder="Ask about shifts, coverage, or backups..."
            className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
