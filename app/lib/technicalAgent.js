import { callDeepSeek } from "./deepseek.js";
import { klineToPrompt } from "./eastmoneyKline.js";
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
  const dailyBlock = klines.daily ? klineToPrompt(klines.daily, 30) : "kline_daily: unavailable";
  const minuteBlock = klines.minute15 ? klineToPrompt(klines.minute15, 40) : "kline_15m: unavailable";

  const messages = [
    {
      role: "system",
      content:
        "You are the technical-analysis sub-agent in a stock decision assistant. Use only the provided market quote, K-line data, derived summaries, and retrieved technical-analysis notes. Do not invent indicators that were not provided. Output a compact technical report for the master controller, not final trading advice."
    },
    {
      role: "system",
      content: `Retrieved technical-analysis notes:\n${knowledgeBlock}\n\n${quoteBlock}\n\n${dailyBlock}\n\n${minuteBlock}`
    },
    {
      role: "user",
      content: [
        `User question: ${question}`,
        `symbol: ${payload.symbol || ""}`,
        `mode: ${payload.mode || "chat"}`,
        `time_horizon: ${payload.time_horizon || ""}`,
        "Please provide: daily trend read, intraday rhythm if 15m data exists, support/resistance, volume-price read, possible candlestick/pattern signals, bullish scenario, bearish scenario, invalidation signals, and data limitations."
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
    klineStatus: {
      daily: Boolean(klines.daily),
      minute15: Boolean(klines.minute15)
    }
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
      ? `kline_status: daily=${report.klineStatus.daily}, minute15=${report.klineStatus.minute15}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}
