import { callDeepSeek } from "./deepseek.js";
import { hotSectorsToPrompt } from "./hotSector.js";

const HOT_SECTOR_KEYWORDS = [
  "热点",
  "热门板块",
  "最强板块",
  "主线",
  "题材",
  "情绪",
  "市场情绪",
  "领涨",
  "板块为什么涨",
  "持续性",
  "轮动"
];

export function shouldRunHotSectorAgent(payload, question) {
  const text = `${question || ""} ${payload.mode || ""}`;
  if (/不看热点|不要热点|不看情绪|排除情绪/.test(text)) return false;
  if (["pre_market", "analysis", "review"].includes(payload.mode)) return true;
  return HOT_SECTOR_KEYWORDS.some((keyword) => text.includes(keyword));
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

export async function runHotSectorAgent({ payload, question, hotSectors, marketEnvironment }) {
  const messages = [
    {
      role: "system",
      content:
        "You are the A-share hot-sector and market-sentiment sub-agent. Identify the strongest current sector/theme, judge whether it is a one-day spike, rotation rebound, or potential main market theme. Use the supplied sector ranking, sector K-line trend, member-stock breadth, capital-flow fields, and broad market environment. For the 'why it rose' section, clearly separate observed evidence, plausible inference, and missing external news/policy evidence. Return valid JSON only."
    },
    {
      role: "system",
      content: hotSectorsToPrompt(hotSectors, marketEnvironment)
    },
    {
      role: "user",
      content: [
        `User question: ${question}`,
        `symbol: ${payload.symbol || ""}`,
        `mode: ${payload.mode || "chat"}`,
        "Return JSON with this schema:",
        "{",
        '  "leader_sector": {"name": "string", "code": "string", "type": "industry|concept", "summary": "string"},',
        '  "market_emotion": "strong|warm|mixed|weak|unknown",',
        '  "mainline_potential": {"rating": "high|medium|low", "reason": "string"},',
        '  "why_it_rose": {"observed": ["string"], "inferred": ["string"], "missing_news": ["string"]},',
        '  "technical_read": {"sector_trend": "string", "breakout_or_rebound": "string", "key_levels": ["string"]},',
        '  "fundamental_logic": {"possible_drivers": ["string"], "needs_verification": ["string"]},',
        '  "breadth_and_leaders": {"view": "string", "leader_stocks": ["string"]},',
        '  "rotation_risk": {"risk": "low|medium|high", "reason": "string"},',
        '  "watchlist_plan": ["string"],',
        '  "trading_implication": {"aggressive": "string", "balanced": "string", "conservative": "string"},',
        '  "missing_data": ["string"]',
        "}"
      ].join("\n")
    }
  ];

  const result = await callDeepSeek(messages, {
    model: process.env.DEEPSEEK_HOT_SECTOR_MODEL || process.env.DEEPSEEK_MODEL,
    temperature: 0.12
  });

  const structured = extractJsonObject(result.answer);
  return {
    name: "hot_sector",
    report: result.answer,
    structured,
    leader: structured?.leader_sector || null,
    emotion: structured?.market_emotion || null,
    mainlinePotential: structured?.mainline_potential || null
  };
}

export function hotSectorReportToPrompt(report) {
  if (!report) return "hot_sector_agent: not called";
  return [
    "hot_sector_agent:",
    `status: ${report.error ? "error" : "ok"}`,
    report.error ? `error: ${report.error}` : "",
    report.leader ? `leader: ${JSON.stringify(report.leader)}` : "",
    report.emotion ? `market_emotion: ${report.emotion}` : "",
    report.mainlinePotential ? `mainline_potential: ${JSON.stringify(report.mainlinePotential)}` : "",
    report.structured
      ? `structured_report: ${JSON.stringify(report.structured, null, 2)}`
      : report.report
        ? `report:\n${report.report}`
        : ""
  ]
    .filter(Boolean)
    .join("\n");
}
