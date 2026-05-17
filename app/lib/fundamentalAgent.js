import { callDeepSeek } from "./deepseek.js";
import { fundamentalInputToPrompt } from "./basicFundamental.js";
import {
  fundamentalKnowledgeToPrompt,
  retrieveFundamentalKnowledge
} from "./fundamentalKnowledge.js";
import { buildFundamentalSkillPrompt } from "./fundamentalSkill.js";

const FUNDAMENTAL_KEYWORDS = [
  "基本面",
  "财报",
  "年报",
  "季报",
  "半年报",
  "营收",
  "利润",
  "净利",
  "roe",
  "ROE",
  "杜邦",
  "pe",
  "PE",
  "pb",
  "PB",
  "估值",
  "现金流",
  "应收",
  "存货",
  "商誉",
  "资产负债",
  "三表",
  "红旗",
  "造假",
  "F-Score",
  "Z-Score",
  "DCF",
  "主营",
  "业务",
  "护城河",
  "竞争力",
  "成长",
  "业绩",
  "风险",
  "布局",
  "公告",
  "调研"
];

export function shouldRunFundamentalAgent(payload, question) {
  const text = `${question || ""} ${payload.mode || ""} ${payload.time_horizon || ""}`;
  if (/不看基本面|不要基本面|排除基本面/.test(text)) return false;
  if (!payload.symbol) return false;
  if (["analysis"].includes(payload.mode)) return true;
  return FUNDAMENTAL_KEYWORDS.some((keyword) => text.includes(keyword));
}

function buildFundamentalInstructions() {
  return [
    "You are the fundamental-analysis sub-agent in a stock decision assistant.",
    "Your job is to convert disclosure evidence, financial metrics, and source summaries into an investment-research memo for the master controller.",
    "Focus on evidence-bound analysis only. If a point is not supported by the supplied input, mark it as missing or uncertain.",
    "Analyze the company from these angles: business model, revenue drivers, growth quality, financial quality, valuation, moat/competition, catalyst, and risks.",
    "Prefer concrete financial statements and disclosure evidence over generic market commentary.",
    "When the input is thin, downgrade confidence and say exactly what data is missing.",
    "Do not promise returns or give guaranteed outcomes."
  ].join(" ");
}

function buildOutputSpec() {
  return [
    "Return valid JSON only. Do not wrap it in markdown.",
    "Use this schema:",
    "{",
    '  "executive_summary": "string",',
    '  "business_quality": {"view": "string", "evidence": ["string"], "score": 0},',
    '  "growth_quality": {"view": "string", "evidence": ["string"], "score": 0},',
    '  "financial_quality": {"view": "string", "evidence": ["string"], "score": 0},',
    '  "valuation_read": {"view": "string", "metrics_used": ["string"], "score": 0},',
    '  "moat_and_competition": {"view": "string", "evidence": ["string"], "score": 0},',
    '  "catalyst_and_layout": {"view": "string", "evidence": ["string"], "score": 0},',
    '  "framework_signals": {"piotroski_f_score_view": "string", "altman_z_score_view": "string", "beneish_m_score_view": "string"},',
    '  "red_flags": [{"flag": "string", "severity": "low|medium|high", "evidence": "string"}],',
    '  "devils_advocate": {"bear_case": "string", "invalidation_evidence": ["string"]},',
    '  "risk_register": [{"risk": "string", "severity": "low|medium|high", "evidence": "string"}],',
    '  "missing_data": ["string"],',
    '  "investment_signal_block": {"signal": "bullish|neutral|bearish", "confidence": "high|medium|low", "horizon": "short|medium|long-term", "score": 0, "action": "buy|hold|sell|wait", "conviction": "strong|moderate|weak"}',
    "}"
  ].join("\n");
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

export async function runFundamentalAgent({ payload, fundamentalInput }) {
  const knowledgeQuery = [
    payload.user_question,
    payload.symbol,
    fundamentalInput?.name,
    fundamentalInput?.profile?.industry,
    fundamentalInput?.profile?.growth_driver,
    ...(fundamentalInput?.profile?.business_layout || []),
    ...(fundamentalInput?.profile?.risk_factors || []),
    ...(fundamentalInput?.evidence || []).slice(0, 8).map((item) => item.title)
  ]
    .filter(Boolean)
    .join(" ");
  const knowledge = retrieveFundamentalKnowledge(knowledgeQuery, 6);

  const messages = [
    {
      role: "system",
      content: `${buildFundamentalInstructions()}\n\n${buildFundamentalSkillPrompt()}\n\n${buildOutputSpec()}`
    },
    {
      role: "system",
      content: `Retrieved fundamental-analysis framework notes:\n${fundamentalKnowledgeToPrompt(knowledge)}`
    },
    {
      role: "system",
      content: `Fundamental data:\n${fundamentalInputToPrompt(fundamentalInput)}`
    },
    {
      role: "user",
      content: [
        `User question: ${payload.user_question || ""}`,
        `symbol: ${payload.symbol || ""}`,
        `mode: ${payload.mode || "chat"}`,
        `time_horizon: ${payload.time_horizon || ""}`,
        "Please provide: business overview, growth narrative, financial quality, valuation read, catalyst/layout assessment, moat, main risks, and a final investment signal block."
      ].join("\n")
    }
  ];

  const result = await callDeepSeek(messages, {
    model: process.env.DEEPSEEK_FUNDAMENTAL_MODEL || process.env.DEEPSEEK_MODEL,
    temperature: 0.15
  });

  const structured = extractJsonObject(result.answer);
  return {
    name: "fundamental",
    report: result.answer,
    structured,
    signal: structured?.investment_signal_block || null,
    knowledge: knowledge.map(({ id, title, score }) => ({ id, title, score }))
  };
}

export function fundamentalReportToPrompt(report) {
  if (!report) return "fundamental_agent: not called";
  return [
    "fundamental_agent:",
    `status: ${report.error ? "error" : "ok"}`,
    report.error ? `error: ${report.error}` : `signal: ${JSON.stringify(report.signal || {})}`,
    report.structured
      ? `structured_report: ${JSON.stringify(report.structured, null, 2)}`
      : `report:\n${report.report}`,
    report.knowledge?.length
      ? `retrieved_notes: ${report.knowledge.map((item) => item.title).join(", ")}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}
