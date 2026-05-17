export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { callDeepSeek } from "../../lib/deepseek";
import { fetchEastmoneyKline, klineToPrompt } from "../../lib/eastmoneyKline";
import {
  runTechnicalAgent,
  shouldRunTechnicalAgent,
  technicalReportToPrompt
} from "../../lib/technicalAgent";
import { fetchTencentQuote, quoteToPrompt } from "../../lib/tencentQuote";

function buildMessages(payload) {
  const context = [
    `mode: ${payload.mode || "chat"}`,
    `symbol: ${payload.symbol || ""}`,
    `time_horizon: ${payload.time_horizon || ""}`,
    `position_state: ${payload.position_state || ""}`,
    `risk_profile: ${payload.risk_profile || ""}`,
    "response_style: structured"
  ].join("\n");

  const messages = [
    {
      role: "system",
      content:
        "You are the master controller of a stock decision assistant. Be concise, structured, and explicit about uncertainty. Never invent market facts. If market data is missing, say so and ask for the missing input. Do not give guaranteed investment outcomes."
    }
  ];

  for (const item of payload.memory || []) {
    if (!["user", "assistant", "system"].includes(item?.role)) continue;
    if (!item?.content) continue;
    messages.push({ role: item.role, content: String(item.content).slice(0, 8000) });
  }

  const quoteBlock = payload.quote
    ? quoteToPrompt(payload.quote)
    : payload.quoteError
      ? `market_quote_error: ${payload.quoteError}`
      : "market_quote: not requested";
  const technicalBlock = technicalReportToPrompt(payload.technicalReport);
  const klineBlock = payload.klines
    ? [
        payload.klines.daily ? klineToPrompt(payload.klines.daily, 12) : "kline_daily: unavailable",
        payload.klines.minute15 ? klineToPrompt(payload.klines.minute15, 12) : "kline_15m: unavailable"
      ].join("\n\n")
    : payload.klineError
      ? `kline_error: ${payload.klineError}`
      : "kline: not requested";

  messages.push({
    role: "system",
    content: `Structured context:\n${context}\n\n${quoteBlock}\n\n${klineBlock}\n\n${technicalBlock}`
  });
  messages.push({ role: "user", content: String(payload.user_question || "") });
  return messages;
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const question = String(payload.user_question || "").trim();
  if (!question) {
    return Response.json({ error: "user_question is required" }, { status: 400 });
  }

  let quote = null;
  let quoteError = null;
  const klines = {};
  let klineError = null;
  if (payload.symbol) {
    try {
      quote = await fetchTencentQuote(payload.symbol);
    } catch (error) {
      quoteError = error.message || "行情获取失败";
    }
    try {
      klines.daily = await fetchEastmoneyKline({
        symbol: payload.symbol,
        period: "daily",
        limit: 160,
        adjust: "qfq"
      });
    } catch (error) {
      klineError = [klineError, `daily: ${error.message || "获取失败"}`].filter(Boolean).join("; ");
    }
    try {
      klines.minute15 = await fetchEastmoneyKline({
        symbol: payload.symbol,
        period: "15m",
        limit: 160,
        adjust: "none"
      });
    } catch (error) {
      klineError = [klineError, `15m: ${error.message || "获取失败"}`].filter(Boolean).join("; ");
    }
  }

  let technicalReport = null;
  if (shouldRunTechnicalAgent(payload, question)) {
    try {
      technicalReport = await runTechnicalAgent({ payload, question, quote, klines });
    } catch (error) {
      technicalReport = {
        name: "technical",
        error: error.message || "技术面 Agent 调用失败"
      };
    }
  }

  try {
    const result = await callDeepSeek(
      buildMessages({ ...payload, user_question: question, quote, quoteError, klines, klineError, technicalReport }),
      { temperature: 0.2 }
    );
    return Response.json({
      answer: result.answer,
      quote,
      quoteError,
      klines,
      klineError,
      agents: {
        technical: technicalReport
      },
      raw: result.raw
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message || "DeepSeek API error",
        detail: error.detail
      },
      { status: error.status || 500 }
    );
  }
}
