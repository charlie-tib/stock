import { callDeepSeek } from "./deepseek.js";
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

export async function runTechnicalAgent({ payload, question, quote }) {
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

  const messages = [
    {
      role: "system",
      content:
        "You are the technical-analysis sub-agent in a stock decision assistant. Use only the provided market quote and retrieved technical-analysis notes. Be explicit about missing K-line history. Do not invent indicators that were not provided. Output a compact technical report for the master controller, not final trading advice."
    },
    {
      role: "system",
      content: `Retrieved technical-analysis notes:\n${knowledgeBlock}\n\n${quoteBlock}`
    },
    {
      role: "user",
      content: [
        `User question: ${question}`,
        `symbol: ${payload.symbol || ""}`,
        `mode: ${payload.mode || "chat"}`,
        `time_horizon: ${payload.time_horizon || ""}`,
        "Please provide: trend read, key levels from available quote, pattern/volume caveats, bullish scenario, bearish scenario, invalidation signals, and what extra K-line data is needed."
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
    knowledge: knowledge.map(({ id, title, score }) => ({ id, title, score }))
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
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}
