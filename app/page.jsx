"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "agent4stock-chat-v1";
const modes = [
  ["chat", "日常问答"],
  ["pre_market", "盘前判断"],
  ["analysis", "个股分析"],
  ["review", "交易复盘"]
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
  const [quote, setQuote] = useState(null);
  const [quoteStatus, setQuoteStatus] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [kline, setKline] = useState(null);
  const [klineStatus, setKlineStatus] = useState("");
  const [fundamentalStatus, setFundamentalStatus] = useState("");
  const [fundamentalData, setFundamentalData] = useState(null);
  const [fundamentalReport, setFundamentalReport] = useState(null);
  const [fundamentalReportStatus, setFundamentalReportStatus] = useState("");
  const [fundamentalReportLoading, setFundamentalReportLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
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

  async function refreshQuote() {
    const symbol = context.symbol.trim();
    if (!symbol || quoteLoading) return;

    setQuoteLoading(true);
    setQuoteStatus("正在读取行情...");
    try {
      const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, {
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "行情获取失败");
      }
      setQuote(data.quote);
      setQuoteStatus(`更新时间 ${data.quote?.timestamp || "未知"}`);
      await refreshKline(symbol);
    } catch (error) {
      setQuote(null);
      setQuoteStatus(error.message);
    } finally {
      setQuoteLoading(false);
    }
  }

  async function fetchKline(symbol, period, limit) {
    const response = await fetch(
      `/api/kline?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}&limit=${limit}`,
      { cache: "no-store" }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `${period} K线获取失败`);
    }
    return data.kline;
  }

  async function refreshKline(symbolOverride) {
    const symbol = (symbolOverride || context.symbol).trim();
    if (!symbol) return;

    setKlineStatus("正在读取 K 线...");
    try {
      const [daily, minute15] = await Promise.all([
        fetchKline(symbol, "daily", 160),
        fetchKline(symbol, "15m", 160)
      ]);
      setKline({ daily, minute15 });
      setKlineStatus(`日K ${daily.bars.length} 条 · 15m ${minute15.bars.length} 条`);
    } catch (error) {
      setKline(null);
      setKlineStatus(error.message);
    }
  }

  async function refreshFundamentalPreview() {
    const symbol = context.symbol.trim();
    if (!symbol) return;
    setFundamentalStatus("正在读取基本面公告...");
    try {
      const response = await fetch(`/api/fundamental?symbol=${encodeURIComponent(symbol)}`, {
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "基本面采集失败");
      }
      setFundamentalData(data.fundamentalInput || null);
      setFundamentalReport(null);
      setFundamentalReportStatus("");
      setFundamentalStatus(
        `${data.announcementPage || "已采集公告页"} · 东财 ${data.fundamentalInput?.source_summary?.notices || 0} 条 · 巨潮 ${data.fundamentalInput?.source_summary?.cninfo_items || 0} 条 · IR ${data.fundamentalInput?.source_summary?.ir_items || 0} 条`
      );
    } catch (error) {
      setFundamentalData(null);
      setFundamentalStatus(error.message);
    }
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
    setAgentStatus(null);

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
      if (data.quote) {
        setQuote(data.quote);
        setQuoteStatus(`已随对话更新行情 ${data.quote.timestamp || ""}`);
      } else if (data.quoteError) {
        setQuoteStatus(data.quoteError);
      }
      if (data.klines) {
        setKline(data.klines);
        const dailyCount = data.klines.daily?.bars?.length || 0;
        const minuteCount = data.klines.minute15?.bars?.length || 0;
        setKlineStatus(`已随对话更新 K 线：日K ${dailyCount} 条 · 15m ${minuteCount} 条`);
      } else if (data.klineError) {
        setKlineStatus(data.klineError);
      }
      setAgentStatus(data.agents || null);
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
    setAgentStatus(null);
    setFundamentalData(null);
    setFundamentalReport(null);
    setFundamentalReportStatus("");
  }

  async function runFundamentalAnalysis() {
    const symbol = context.symbol.trim();
    if (!symbol || fundamentalReportLoading) return;

    setFundamentalReportLoading(true);
    setFundamentalReportStatus("正在分析基本面...");
    try {
      const response = await fetch("/api/fundamental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          user_question: question.trim() || `请分析 ${symbol} 的基本面`
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "基本面分析失败");
      }
      setFundamentalData(data.fundamentalInput || fundamentalData);
      setFundamentalReport(data.report || null);
      setFundamentalReportStatus("分析完成");
    } catch (error) {
      setFundamentalReport(null);
      setFundamentalReportStatus(error.message);
    } finally {
      setFundamentalReportLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="eyebrow">AI Trading Desk</div>
          <div className="title">Agent4Stock</div>
          <div className="subtitle">手机端投研对话台</div>
        </div>
        <div className={`connection ${loading ? "live" : ""}`}>{connection}</div>
      </header>

      <nav className="modebar panel-soft" aria-label="分析模式">
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

      <details className="panel context-panel" open>
        <summary>会话参数</summary>
        <div className="context-grid">
          <label>
            代码 / 标的
            <input
              value={context.symbol}
              placeholder="例如 600519"
              onChange={(event) => {
                updateContext("symbol", event.target.value);
                setQuote(null);
                setQuoteStatus("");
                setKline(null);
                setKlineStatus("");
              }}
              onBlur={refreshQuote}
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
        <div className="quote-card">
          <div className="quote-top">
            <div>
              <div className="quote-title">
                {quote ? `${quote.name || "行情快照"} ${quote.code || ""}` : "真实行情快照"}
              </div>
              <div className="quote-note">
                数据源：腾讯财经公开行情。输入代码后刷新，发送问题时也会自动读取。
              </div>
            </div>
            <button className="quote-button" type="button" onClick={refreshQuote} disabled={quoteLoading}>
              {quoteLoading ? "读取中" : "刷新数据"}
            </button>
          </div>
          {quote ? (
            <>
              <div className="quote-main">
                <div>
                  <span className="metric-label">现价</span>
                  <span className="metric-value">{quote.price ?? "--"}</span>
                </div>
                <div>
                  <span className="metric-label">涨跌幅</span>
                  <span className={Number(quote.changePercent) >= 0 ? "metric-value up" : "metric-value down"}>
                    {quote.changePercent ?? "--"}%
                  </span>
                </div>
                <div>
                  <span className="metric-label">成交额</span>
                  <span className="metric-value">{quote.amountWan ?? "--"} 万</span>
                </div>
              </div>
              <div className="quote-grid">
                <span>今开 {quote.open ?? "--"}</span>
                <span>昨收 {quote.previousClose ?? "--"}</span>
                <span>最高 {quote.high ?? "--"}</span>
                <span>最低 {quote.low ?? "--"}</span>
                <span>换手 {quote.turnoverRate ?? "--"}%</span>
                <span>市盈 {quote.pe ?? "--"}</span>
              </div>
              <div className="book">
                <div>
                  <b>买盘</b>
                  {(quote.bid || []).slice(0, 3).map((item, index) => (
                    <span key={`bid-${index}`}>买{index + 1} {item.price ?? "--"} / {item.volume ?? "--"}</span>
                  ))}
                </div>
                <div>
                  <b>卖盘</b>
                  {(quote.ask || []).slice(0, 3).map((item, index) => (
                    <span key={`ask-${index}`}>卖{index + 1} {item.price ?? "--"} / {item.volume ?? "--"}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="quote-empty">还没有行情。填写代码后点“刷新行情”。</div>
          )}
          {quoteStatus ? <div className="quote-status">{quoteStatus}</div> : null}
        </div>
        <div className="quote-card">
          <div className="quote-top">
            <div>
              <div className="quote-title">历史 K 线</div>
              <div className="quote-note">数据源：东方财富公开 K 线。当前读取日 K 与 15 分钟 K。</div>
            </div>
            <button className="quote-button" type="button" onClick={() => refreshKline()} disabled={!context.symbol}>
              刷新 K 线
            </button>
          </div>
          {kline?.daily?.summary ? (
            <div className="kline-summary">
              <div>
                <span className="metric-label">日K收盘</span>
                <span className="metric-value">{kline.daily.summary.last?.close ?? "--"}</span>
              </div>
              <div>
                <span className="metric-label">MA5 / MA20</span>
                <span className="metric-value small">
                  {kline.daily.summary.ma5 ?? "--"} / {kline.daily.summary.ma20 ?? "--"}
                </span>
              </div>
              <div>
                <span className="metric-label">20日高低</span>
                <span className="metric-value small">
                  {kline.daily.summary.high20 ?? "--"} / {kline.daily.summary.low20 ?? "--"}
                </span>
              </div>
            </div>
          ) : (
            <div className="quote-empty">还没有 K 线。填写代码后点“刷新 K 线”。</div>
          )}
          {kline?.minute15?.summary ? (
            <div className="quote-grid">
              <span>15m 最新 {kline.minute15.summary.last?.close ?? "--"}</span>
              <span>15m MA5 {kline.minute15.summary.ma5 ?? "--"}</span>
              <span>15m MA20 {kline.minute15.summary.ma20 ?? "--"}</span>
              <span>15m 趋势 {kline.minute15.summary.trend}</span>
            </div>
          ) : null}
          {klineStatus ? <div className="quote-status">{klineStatus}</div> : null}
        </div>
        <div className="quote-card">
          <div className="quote-top">
            <div>
              <div className="quote-title">基本面公告采集</div>
              <div className="quote-note">先采集东方财富公告页，后续再扩展巨潮、IR、年报正文。</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="quote-button" type="button" onClick={refreshFundamentalPreview} disabled={!context.symbol}>
                采集公告
              </button>
              <button
                className="quote-button"
                type="button"
                onClick={runFundamentalAnalysis}
                disabled={!context.symbol || fundamentalReportLoading}
              >
                {fundamentalReportLoading ? "分析中" : "分析基本面"}
              </button>
            </div>
          </div>
          <div className="quote-empty">
            点击“采集公告”后，会读取公告列表并准备喂给基本面 Agent 的结构化输入。
          </div>
          {fundamentalData ? (
            <div className="fundamental-preview">
              <div className="quote-grid">
                <span>公司 {fundamentalData.name || "--"}</span>
                <span>东财 {fundamentalData.source_summary?.notices || 0}</span>
                <span>巨潮 {fundamentalData.source_summary?.cninfo_items || 0}</span>
                <span>IR {fundamentalData.source_summary?.ir_items || 0}</span>
                <span>财务期数 {(fundamentalData.financial_series || []).length}</span>
                <span>PE {fundamentalData.metrics?.pe ?? "--"}</span>
              </div>
              <div className="quote-grid">
                <span>ROE {fundamentalData.metrics?.roe ?? "--"}</span>
                <span>营收同比 {fundamentalData.metrics?.revenue_yoy ?? "--"}</span>
                <span>净利同比 {fundamentalData.metrics?.profit_yoy ?? "--"}</span>
                <span>增长驱动 {fundamentalData.profile?.growth_driver || "待抽取"}</span>
              </div>
              <div className="quote-note">
                证据标题：{(fundamentalData.evidence || [])
                  .slice(0, 4)
                  .map((item) => item.title)
                  .join(" / ") || "暂无"}
              </div>
              <div className="quote-note">
                证据块已整理好，可以直接喂给基本面子 agent。
              </div>
            </div>
          ) : null}
          {fundamentalReport ? (
            <div className="fundamental-preview">
              <div className="quote-note">基本面 agent 结论</div>
              <pre className="fundamental-report">{fundamentalReport.report || "暂无结论"}</pre>
            </div>
          ) : null}
          {fundamentalStatus ? <div className="quote-status">{fundamentalStatus}</div> : null}
          {fundamentalReportStatus ? <div className="quote-status">{fundamentalReportStatus}</div> : null}
        </div>
      </details>

      <section className="panel chat-card">
        <div className="chat-head">
          <div>
            <div className="section-title">对话记录</div>
            <div className="section-subtitle">总控 LLM 的回复会显示在这里</div>
          </div>
          <div className="pill">{messages.length} 条</div>
        </div>
        {agentStatus?.technical ? (
          <div className="agent-strip">
            <div>
              <b>技术面 Agent</b>
              <span>
                {agentStatus.technical.error
                  ? agentStatus.technical.error
                  : `已调用 · RAG ${agentStatus.technical.knowledge?.length || 0} 条`}
              </span>
            </div>
            {!agentStatus.technical.error && agentStatus.technical.knowledge?.length ? (
              <small>
                {agentStatus.technical.knowledge.map((item) => item.title).join(" / ")}
              </small>
            ) : null}
          </div>
        ) : null}
        {agentStatus?.fundamental ? (
          <div className="agent-strip">
            <div>
              <b>基本面 Agent</b>
              <span>
                {agentStatus.fundamental.error
                  ? agentStatus.fundamental.error
                  : `已调用 · ${agentStatus.fundamental.signal?.signal || "neutral"} · 置信度 ${agentStatus.fundamental.signal?.confidence || "low"}`}
              </span>
            </div>
            {!agentStatus.fundamental.error && agentStatus.fundamental.structured?.executive_summary ? (
              <small>{agentStatus.fundamental.structured.executive_summary}</small>
            ) : null}
            {!agentStatus.fundamental.error && agentStatus.fundamental.structured?.red_flags?.length ? (
              <small>
                红旗：{agentStatus.fundamental.structured.red_flags
                  .slice(0, 2)
                  .map((item) => `${item.severity || "medium"}:${item.flag}`)
                  .join(" / ")}
              </small>
            ) : null}
            {!agentStatus.fundamental.error && agentStatus.fundamental.knowledge?.length ? (
              <small>
                方法论：{agentStatus.fundamental.knowledge.map((item) => item.title).join(" / ")}
              </small>
            ) : null}
          </div>
        ) : null}
        <div className="chat" ref={chatRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">还没有对话</div>
            <div className="empty-copy">
              在下方输入问题，例如“明天盘前怎么看 600519？”，发送后模型回复会出现在这个区域。
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <article
                className={`message ${message.role} ${message.error ? "error" : ""}`}
                key={`${message.role}-${index}`}
              >
                <span className="role">{message.role === "user" ? "你发送的问题" : "总控 LLM 回复"}</span>
                {message.content}
              </article>
            ))}
            {loading ? (
              <article className="message assistant thinking">
                <span className="role">总控 LLM 回复</span>
                正在组织回答...
              </article>
            ) : null}
          </>
        )}
        </div>
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
            <div className="status">{status || "Enter 发送，Shift + Enter 换行"}</div>
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
