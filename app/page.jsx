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

const klinePeriods = [
  ["monthly", "monthly", "月K", 120],
  ["weekly", "weekly", "周K", 156],
  ["daily", "daily", "日K", 240],
  ["hour60", "60m", "60分钟", 240],
  ["minute15", "15m", "15分钟", 240],
  ["minute5", "5m", "5分钟", 240]
];

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
  const [market, setMarket] = useState(null);
  const [marketStatus, setMarketStatus] = useState("");
  const [marketLoading, setMarketLoading] = useState(false);
  const [hotSectors, setHotSectors] = useState(null);
  const [hotSectorReport, setHotSectorReport] = useState(null);
  const [hotSectorStatus, setHotSectorStatus] = useState("");
  const [hotSectorLoading, setHotSectorLoading] = useState(false);
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

  async function refreshMarket() {
    if (marketLoading) return;
    setMarketLoading(true);
    setMarketStatus("正在读取 A 股市场环境...");
    try {
      const response = await fetch("/api/market", {
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "市场环境获取失败");
      }
      setMarket(data.marketEnvironment || null);
      const count = data.marketEnvironment?.indexes?.length || 0;
      const style = data.marketEnvironment?.breadth?.style_bias || "unknown";
      setMarketStatus(`已读取 ${count} 个宽基指数 · 风格 ${style}`);
    } catch (error) {
      setMarket(null);
      setMarketStatus(error.message);
    } finally {
      setMarketLoading(false);
    }
  }

  async function refreshHotSectors({ analyze = false } = {}) {
    if (hotSectorLoading) return;
    setHotSectorLoading(true);
    setHotSectorStatus(analyze ? "正在分析热点板块..." : "正在读取热点板块...");
    try {
      const response = await fetch("/api/hot-sector", {
        method: analyze ? "POST" : "GET",
        headers: analyze ? { "Content-Type": "application/json" } : undefined,
        body: analyze
          ? JSON.stringify({
              symbol: context.symbol,
              user_question: question.trim() || "请分析今天 A 股最热门板块及主线潜力"
            })
          : undefined,
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "热点板块获取失败");
      }
      setHotSectors(data.hotSectors || null);
      if (data.marketEnvironment) setMarket(data.marketEnvironment);
      if (data.report) setHotSectorReport(data.report);
      const leader = data.hotSectors?.leader;
      setHotSectorStatus(
        leader
          ? `${leader.name} 领涨 · ${leader.changePercent ?? "--"}% · 主线分析${data.report ? "完成" : "待触发"}`
          : "已读取热点板块"
      );
    } catch (error) {
      setHotSectors(null);
      setHotSectorReport(null);
      setHotSectorStatus(error.message);
    } finally {
      setHotSectorLoading(false);
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

    setKlineStatus("正在读取多周期 K 线...");
    try {
      const entries = await Promise.all(
        klinePeriods.map(async ([key, period, label, limit]) => {
          try {
            const data = await fetchKline(symbol, period, limit);
            return [key, data, null, label];
          } catch (error) {
            return [key, null, error.message, label];
          }
        })
      );
      const nextKline = {};
      const errors = [];
      for (const [key, data, error, label] of entries) {
        if (data) {
          nextKline[key] = data;
        } else {
          errors.push(`${label}失败`);
        }
      }
      if (!Object.keys(nextKline).length) {
        throw new Error(errors.join(" · ") || "K 线获取失败");
      }
      setKline(nextKline);
      const loaded = klinePeriods
        .filter(([key]) => nextKline[key])
        .map(([key, , label]) => `${label}${nextKline[key].bars.length}`)
        .join(" · ");
      setKlineStatus(errors.length ? `${loaded} · ${errors.join(" · ")}` : loaded);
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
        const loaded = klinePeriods
          .filter(([key]) => data.klines[key])
          .map(([key, , label]) => `${label}${data.klines[key].bars?.length || 0}`)
          .join(" · ");
        setKlineStatus(`已随对话更新 K 线：${loaded || "无可用周期"}`);
      } else if (data.klineError) {
        setKlineStatus(data.klineError);
      }
      if (data.marketEnvironment) {
        setMarket(data.marketEnvironment);
        setMarketStatus(`已随对话更新市场环境 · ${data.marketEnvironment.breadth?.style_bias || "unknown"}`);
      } else if (data.marketError) {
        setMarketStatus(data.marketError);
      }
      if (data.hotSectors) {
        setHotSectors(data.hotSectors);
        setHotSectorStatus(`已随对话更新热点板块 · ${data.hotSectors.leader?.name || "unknown"}`);
      } else if (data.hotSectorError) {
        setHotSectorStatus(data.hotSectorError);
      }
      if (data.agents?.hotSector) {
        setHotSectorReport(data.agents.hotSector);
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
              <div className="quote-title">A 股大盘环境</div>
              <div className="quote-note">跟踪上证、沪深300、创业板、中证500/1000/2000、国证2000，避免只看上证失真。</div>
            </div>
            <button className="quote-button" type="button" onClick={refreshMarket} disabled={marketLoading}>
              {marketLoading ? "读取中" : "刷新大盘"}
            </button>
          </div>
          {market?.indexes?.length ? (
            <div className="market-grid">
              {market.indexes.map((item) => (
                <div className="market-tile" key={item.key}>
                  <span className="metric-label">{item.name}</span>
                  <span className={Number(item.latest?.change_percent) >= 0 ? "metric-value up" : "metric-value down"}>
                    {item.latest?.change_percent ?? "--"}%
                  </span>
                  <span>日线：{item.trends?.daily || "unknown"}</span>
                  <span>周线：{item.trends?.weekly || "unknown"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="quote-empty">还没有大盘环境。点击“刷新大盘”读取宽基指数。</div>
          )}
          {market?.breadth ? (
            <div className="quote-grid">
              <span>上涨指数 {market.breadth.rising}/{market.breadth.total}</span>
              <span>大盘平均 {market.breadth.large_cap_avg_change ?? "--"}%</span>
              <span>小盘平均 {market.breadth.small_cap_avg_change ?? "--"}%</span>
              <span>风格 {market.breadth.style_bias}</span>
            </div>
          ) : null}
          {marketStatus ? <div className="quote-status">{marketStatus}</div> : null}
        </div>
        <div className="quote-card">
          <div className="quote-top">
            <div>
              <div className="quote-title">热点板块 / 主线潜力</div>
              <div className="quote-note">读取行业与概念涨幅榜，结合板块走势、资金流和成分股扩散度判断情绪强度。</div>
            </div>
            <div className="button-row compact">
              <button className="quote-button" type="button" onClick={() => refreshHotSectors()} disabled={hotSectorLoading}>
                {hotSectorLoading ? "读取中" : "刷新热点"}
              </button>
              <button
                className="quote-button"
                type="button"
                onClick={() => refreshHotSectors({ analyze: true })}
                disabled={hotSectorLoading}
              >
                分析主线
              </button>
            </div>
          </div>
          {hotSectors?.sectors?.length ? (
            <div className="hot-sector-list">
              {hotSectors.sectors.slice(0, 5).map((sector) => (
                <div className="hot-sector-row" key={sector.key}>
                  <div>
                    <b>{sector.name}</b>
                    <span>{sector.universeLabel} · {sector.code}</span>
                  </div>
                  <div>
                    <strong>{sector.changePercent ?? "--"}%</strong>
                    <span>扩散 {sector.memberSummary?.rising ?? "--"}/{sector.memberSummary?.total ?? "--"}</span>
                  </div>
                  <small>
                    龙头：{(sector.members || [])
                      .slice(0, 3)
                      .map((item) => `${item.name} ${item.changePercent ?? "--"}%`)
                      .join(" / ") || "暂无"}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <div className="quote-empty">还没有热点板块。点击“刷新热点”读取当天最强行业和概念。</div>
          )}
          {hotSectorReport?.structured ? (
            <div className="fundamental-preview">
              <div className="quote-note">热点 Agent 结论</div>
              <div className="quote-grid">
                <span>情绪 {hotSectorReport.structured.market_emotion || "--"}</span>
                <span>主线潜力 {hotSectorReport.structured.mainline_potential?.rating || "--"}</span>
                <span>轮动风险 {hotSectorReport.structured.rotation_risk?.risk || "--"}</span>
              </div>
              <div className="quote-note">{hotSectorReport.structured.leader_sector?.summary || ""}</div>
            </div>
          ) : null}
          {hotSectorStatus ? <div className="quote-status">{hotSectorStatus}</div> : null}
        </div>
        <div className="quote-card">
          <div className="quote-top">
            <div>
              <div className="quote-title">历史 K 线</div>
              <div className="quote-note">数据源：东方财富公开 K 线。读取月K、周K、日K、60分钟、15分钟与5分钟。</div>
            </div>
            <button className="quote-button" type="button" onClick={() => refreshKline()} disabled={!context.symbol}>
              刷新 K 线
            </button>
          </div>
          {kline && Object.keys(kline).length ? (
            <div className="multi-kline-grid">
              {klinePeriods.map(([key, , label]) => {
                const summary = kline[key]?.summary;
                if (!summary) return null;
                return (
                  <div className="kline-tile" key={key}>
                    <span className="metric-label">{label}</span>
                    <span className="metric-value">{summary.last?.close ?? "--"}</span>
                    <span>MA5 / MA20：{summary.ma5 ?? "--"} / {summary.ma20 ?? "--"}</span>
                    <span>高低：{summary.high20 ?? "--"} / {summary.low20 ?? "--"}</span>
                    <span>RSI14：{summary.indicators?.rsi?.rsi14 ?? "--"}</span>
                    <span>KDJ：{summary.indicators?.kdj?.signal || "--"}</span>
                    <span>BOLL：{summary.indicators?.boll?.position || "--"}</span>
                    <span>MACD：{summary.indicators?.macd?.signal || "--"}</span>
                    <span>{summary.trend}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="quote-empty">还没有 K 线。填写代码后点“刷新 K 线”。</div>
          )}
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
        {agentStatus?.market ? (
          <div className="agent-strip">
            <div>
              <b>市场环境 Agent</b>
              <span>
                {agentStatus.market.error
                  ? agentStatus.market.error
                  : `已调用 · ${agentStatus.market.regime || "unknown"} · ${agentStatus.market.styleBias || "unknown"}`}
              </span>
            </div>
            {!agentStatus.market.error && agentStatus.market.structured?.executive_summary ? (
              <small>{agentStatus.market.structured.executive_summary}</small>
            ) : null}
          </div>
        ) : null}
        {agentStatus?.hotSector ? (
          <div className="agent-strip">
            <div>
              <b>热点板块 Agent</b>
              <span>
                {agentStatus.hotSector.error
                  ? agentStatus.hotSector.error
                  : `已调用 · ${agentStatus.hotSector.leader?.name || "unknown"} · ${agentStatus.hotSector.emotion || "unknown"}`}
              </span>
            </div>
            {!agentStatus.hotSector.error && agentStatus.hotSector.structured?.mainline_potential?.reason ? (
              <small>{agentStatus.hotSector.structured.mainline_potential.reason}</small>
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
