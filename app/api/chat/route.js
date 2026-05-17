export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { fetchTencentQuote, quoteToPrompt } from "../../lib/tencentQuote";

const DEFAULT_BASE_URL = "https://api.deepseek.com";

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

  messages.push({
    role: "system",
    content: `Structured context:\n${context}\n\n${quoteBlock}`
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

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey) {
    return Response.json({ error: "DEEPSEEK_API_KEY is not configured" }, { status: 500 });
  }
  if (!model) {
    return Response.json({ error: "DEEPSEEK_MODEL is not configured" }, { status: 500 });
  }

  let quote = null;
  let quoteError = null;
  if (payload.symbol) {
    try {
      quote = await fetchTencentQuote(payload.symbol);
    } catch (error) {
      quoteError = error.message || "行情获取失败";
    }
  }

  const deepseekResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: buildMessages({ ...payload, user_question: question, quote, quoteError })
    })
  });

  const text = await deepseekResponse.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!deepseekResponse.ok) {
    return Response.json(
      {
        error: data?.error?.message || data?.message || `DeepSeek API error ${deepseekResponse.status}`,
        detail: data
      },
      { status: deepseekResponse.status }
    );
  }

  const answer = data?.choices?.[0]?.message?.content || "";
  return Response.json({ answer, quote, quoteError, raw: data });
}
