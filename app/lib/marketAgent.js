import { callDeepSeek } from "./deepseek.js";
import { marketEnvironmentToPrompt } from "./marketEnvironment.js";

const MARKET_KEYWORDS = [
  "大盘",
  "指数",
  "市场环境",
  "市场",
  "行情环境",
  "上证",
  "沪深300",
  "创业板",
  "中证",
  "宽基",
  "小盘",
  "风格",
  "系统性风险",
  "仓位"
];

export function shouldRunMarketAgent(payload, question) {
  const text = `${question || ""} ${payload.mode || ""} ${payload.time_horizon || ""}`;
  if (/不看大盘|不要大盘|排除市场|不看市场环境/.test(text)) return false;
  if (["pre_market", "analysis", "review"].includes(payload.mode)) return true;
  return MARKET_KEYWORDS.some((keyword) => text.includes(keyword));
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const withoutFence = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function runMarketAgent({ payload, question, marketEnvironment }) {
  const messages = [
    {
      role: "system",
      content:
        "You are the A-share market-environment sub-agent in a stock decision assistant. Use only the supplied broad-index data. Do not over-rely on the Shanghai Composite; compare large-cap, growth, mid-cap, small-cap, and micro-cap indexes. Explain whether the market backdrop supports or conflicts with single-stock decisions. Return valid JSON only."
    },
    {
      role: "system",
      content: marketEnvironmentToPrompt(marketEnvironment)
    },
    {
      role: "user",
      content: [
        `User question: ${question}`,
        `symbol: ${payload.symbol || ""}`,
        `mode: ${payload.mode || "chat"}`,
        `time_horizon: ${payload.time_horizon || ""}`,
        "Return JSON with this schema:",
        "{",
        '  "executive_summary": "string",',
        '  "market_regime": "risk_on|risk_off|mixed|range|unknown",',
        '  "style_bias": "large_cap|growth|mid_small_cap|micro_cap|balanced|unknown",',
        '  "index_reads": [{"name": "string", "view": "string", "risk": "low|medium|high"}],',
        '  "supportive_factors": ["string"],',
        '  "pressure_factors": ["string"],',
        '  "trading_implication": {"long_term": "string", "swing": "string", "short_term": "string", "intraday": "string"},',
        '  "position_risk": "low|medium|high",',
        '  "invalidation_signals": ["string"],',
        '  "missing_data": ["string"]',
        "}"
      ].join("\n")
    }
  ];

  const result = await callDeepSeek(messages, {
    model: process.env.DEEPSEEK_MARKET_MODEL || process.env.DEEPSEEK_MODEL,
    temperature: 0.12
  });

  const structured = extractJsonObject(result.answer);
  return {
    name: "market",
    report: result.answer,
    structured,
    regime: structured?.market_regime || null,
    styleBias: structured?.style_bias || marketEnvironment?.breadth?.style_bias || null,
    positionRisk: structured?.position_risk || null
  };
}

export function marketReportToPrompt(report) {
  if (!report) return "market_agent: not called";
  return [
    "market_agent:",
    `status: ${report.error ? "error" : "ok"}`,
    report.error ? `error: ${report.error}` : `regime: ${report.regime || ""}`,
    report.styleBias ? `style_bias: ${report.styleBias}` : "",
    report.positionRisk ? `position_risk: ${report.positionRisk}` : "",
    report.structured
      ? `structured_report: ${JSON.stringify(report.structured, null, 2)}`
      : `report:\n${report.report}`
  ]
    .filter(Boolean)
    .join("\n");
}
