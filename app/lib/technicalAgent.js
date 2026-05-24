import { callDeepSeek } from "./deepseek.js";
import { MULTI_SCALE_KLINE_CONFIG, multiScaleKlinesToPrompt } from "./eastmoneyKline.js";
import { knowledgeToPrompt, retrieveTechnicalKnowledge } from "./technicalKnowledge.js";
import { quoteToPrompt } from "./tencentQuote.js";

const TECHNICAL_KEYWORDS = [
  "技术",
  "k线",
  "K线",
  "蜡烛",
  "形态",
  "趋势",
  "均线",
  "macd",
  "MACD",
  "rsi",
  "RSI",
  "支撑",
  "压力",
  "突破",
  "回踩",
  "背离",
  "量价",
  "成交量",
  "波浪",
  "盘口",
  "短线",
  "买点",
  "卖点"
];

export function shouldRunTechnicalAgent(payload, question) {
  const text = `${question || ""} ${payload.mode || ""} ${payload.time_horizon || ""}`;
  if (/不看技术|不要技术|排除技术/.test(text)) return false;
  if (["pre_market", "analysis"].includes(payload.mode)) return true;
  return TECHNICAL_KEYWORDS.some((keyword) => text.includes(keyword));
}

export async function runTechnicalAgent({ payload, question, quote, klines = {} }) {
  const query = [
    question,
    payload.mode,
    payload.time_horizon,
    payload.symbol,
    quote?.name,
    quote?.code
  ]
    .filter(Boolean)
    .join(" ");
  const knowledge = retrieveTechnicalKnowledge(query, 5);
  const knowledgeBlock = knowledgeToPrompt(knowledge);
  const quoteBlock = quote ? quoteToPrompt(quote) : "market_quote: unavailable";
  const klineBlock = multiScaleKlinesToPrompt(klines);

  const messages = [
    {
      role: "system",
      content:
        "You are the multi-timeframe technical-analysis sub-agent in a stock decision assistant. Use only the provided market quote, K-line data, derived summaries, and retrieved technical-analysis notes. The summaries include MA, RSI, KDJ, BOLL, and MACD when enough bars are available. Do not invent indicators that were not provided. Read higher timeframes first, then lower timeframes. If timeframes conflict, explain the conflict and which horizon it matters for. Output a compact technical report for the master controller, not final trading advice."
    },
    {
      role: "system",
      content: `Retrieved technical-analysis notes:\n${knowledgeBlock}\n\n${quoteBlock}\n\n${klineBlock}`
    },
    {
      role: "user",
      content: [
        `User question: ${question}`,
        `symbol: ${payload.symbol || ""}`,
        `mode: ${payload.mode || "chat"}`,
        `time_horizon: ${payload.time_horizon || ""}`,
        "Please provide a multi-timeframe technical read in Chinese with these sections: 1) 月K/周K long-term trend and major regime; 2) 日K/60分钟 swing setup; 3) 15分钟/5分钟 intraday rhythm; 4) indicator confirmation using RSI, KDJ, BOLL, and MACD by timeframe; 5) support/resistance by timeframe; 6) volume-price confirmation; 7) bullish scenario; 8) bearish scenario; 9) what action fits long-term, swing, short-term, and intraday horizons; 10) invalidation signals and data limitations."
      ].join("\n")
    }
  ];

  const result = await callDeepSeek(messages, {
    model: process.env.DEEPSEEK_TECHNICAL_MODEL || process.env.DEEPSEEK_MODEL,
    temperature: 0.15
  });

  return {
    name: "technical",
    report: result.answer,
    knowledge: knowledge.map(({ id, title, score }) => ({ id, title, score })),
    klineStatus: Object.fromEntries(MULTI_SCALE_KLINE_CONFIG.map((item) => [item.key, Boolean(klines[item.key])]))
  };
}

export function technicalReportToPrompt(report) {
  if (!report) return "technical_agent: not called";
  return [
    "technical_agent:",
    `status: ${report.error ? "error" : "ok"}`,
    report.error ? `error: ${report.error}` : `report:\n${report.report}`,
    report.knowledge?.length
      ? `retrieved_notes: ${report.knowledge.map((item) => item.title).join(", ")}`
      : "",
    report.klineStatus
      ? `kline_status: ${Object.entries(report.klineStatus)
          .map(([key, value]) => `${key}=${value}`)
          .join(", ")}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}
