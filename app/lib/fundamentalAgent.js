import { callDeepSeek } from "./deepseek.js";
import { fundamentalInputToPrompt } from "./basicFundamental.js";

export async function runFundamentalAgent({ payload, fundamentalInput }) {
  const messages = [
    {
      role: "system",
      content:
        "You are the fundamental-analysis sub-agent in a stock decision assistant. Evaluate business quality, growth quality, financial strength, valuation, moat, expansion plans, and key risks using only the supplied fundamental input and evidence. If something is missing, say what is missing. Output a compact report for the master controller, not final trading advice."
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
        "Please provide: business overview, growth narrative, financial quality, valuation read, expansion/busy布局 assessment, moat, and main risks."
      ].join("\n")
    }
  ];

  const result = await callDeepSeek(messages, {
    model: process.env.DEEPSEEK_FUNDAMENTAL_MODEL || process.env.DEEPSEEK_MODEL,
    temperature: 0.15
  });

  return {
    name: "fundamental",
    report: result.answer
  };
}

export function fundamentalReportToPrompt(report) {
  if (!report) return "fundamental_agent: not called";
  return [
    "fundamental_agent:",
    `status: ${report.error ? "error" : "ok"}`,
    report.error ? `error: ${report.error}` : `report:\n${report.report}`
  ].join("\n");
}
