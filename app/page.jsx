"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "agent4stock-chat-v1";
const modes = [
  ["chat", "聊天"],
  ["pre_market", "盘前"],
  ["analysis", "个股分析"],
  ["review", "复盘"]
];

const initialContext = {
  symbol: "",
  time_horizon: "",
  position_state: "",
  risk_profile: ""
};

function safeLoad() {
  if (typeof window === "undefined") {
    return { messages: [], mode: "chat", context: initialContext };
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      messages: Array.isArray(saved.messages) ? saved.messages : [],
      mode: saved.mode || "chat",
      context: { ...initialContext, ...(saved.context || {}) }
    };
  } catch {
    return { messages: [], mode: "chat", context: initialContext };
  }
}

export default function HomePage() {
  const loaded = useMemo(() => safeLoad(), []);
  const [messages, setMessages] = useState(loaded.messages);
  const [mode, setMode] = useState(loaded.mode);
  const [context, setContext] = useState(loaded.context);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [connection, setConnection] = useState("等待输入");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, mode, context }));
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mode, context]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }
  }, []);

  function updateContext(key, value) {
    setContext((current) => ({ ...current, [key]: value }));
  }

  async function sendMessage() {
    const text = question.trim();
    if (!text || loading) return;

    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);
    setStatus("正在请求模型...");
    setConnection("发送中");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_question: text,
          mode,
          ...context,
          memory: nextMessages.slice(0, -1).slice(-20)
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "请求失败");
      }

      setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
      setStatus("已完成");
      setConnection("可继续对话");
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `请求失败：${error.message}`, error: true }
      ]);
      setStatus(error.message);
      setConnection("请求失败");
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setStatus("");
    setConnection("等待输入");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="title">Agent4Stock</div>
          <div className="subtitle">你的总控投研助手</div>
        </div>
        <div className="connection">{connection}</div>
      </header>

      <nav className="modebar" aria-label="分析模式">
        {modes.map(([value, label]) => (
          <button
            className={`chip ${mode === value ? "active" : ""}`}
            key={value}
            type="button"
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      <details className="panel" open>
        <summary>会话参数</summary>
        <div className="context-grid">
          <label>
            代码 / 标的
            <input
              value={context.symbol}
              placeholder="例如 600519"
              onChange={(event) => updateContext("symbol", event.target.value)}
            />
          </label>
          <label>
            周期
            <select
              value={context.time_horizon}
              onChange={(event) => updateContext("time_horizon", event.target.value)}
            >
              <option value="">未指定</option>
              <option value="intraday">日内</option>
              <option value="short_term">短线</option>
              <option value="swing">波段</option>
              <option value="long_term">中长线</option>
            </select>
          </label>
          <label>
            仓位状态
            <select
              value={context.position_state}
              onChange={(event) => updateContext("position_state", event.target.value)}
            >
              <option value="">未指定</option>
              <option value="none">空仓</option>
              <option value="holding">持有</option>
              <option value="watching">观察中</option>
            </select>
          </label>
          <label>
            风险偏好
            <select
              value={context.risk_profile}
              onChange={(event) => updateContext("risk_profile", event.target.value)}
            >
              <option value="">未指定</option>
              <option value="conservative">保守</option>
              <option value="medium">中性</option>
              <option value="aggressive">激进</option>
            </select>
          </label>
        </div>
      </details>

      <section className="panel chat" ref={chatRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty">先输入一句话开始对话。</div>
        ) : (
          messages.map((message, index) => (
            <article
              className={`message ${message.role} ${message.error ? "error" : ""}`}
              key={`${message.role}-${index}`}
            >
              <span className="role">{message.role === "user" ? "你" : "总控 LLM"}</span>
              {message.content}
            </article>
          ))
        )}
      </section>

      <section className="composer">
        <div className="composer-card">
          <textarea
            value={question}
            placeholder="输入问题，例如：明天盘前怎么看 600519？"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <div className="actions">
            <div className="status">{status}</div>
            <div className="button-row">
              <button className="clear" type="button" onClick={clearChat}>
                清空
              </button>
              <button className="send" type="button" onClick={sendMessage} disabled={loading}>
                发送
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
