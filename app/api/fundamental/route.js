import {
  buildFundamentalInput,
  fundamentalInputToPrompt
} from "../../lib/basicFundamental.js";
import { runFundamentalAgent, fundamentalReportToPrompt } from "../../lib/fundamentalAgent.js";
import {
  eastmoneyAnnouncementSummary,
  fetchEastmoneyAnnouncementPage,
  pickFundamentalEvidence
} from "../../lib/fundamentalSources.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildMockFundamentalData(symbol, announcementPage) {
  const stockName = announcementPage?.stockInfo?.name || "";
  const notices = announcementPage?.notices || [];

  return buildFundamentalInput({
    symbol,
    name: stockName,
    profile: {
      industry: announcementPage?.stockInfo?.hyname || "",
      main_business: "待从年报/季报/公告中抽取",
      business_layout: notices
        .filter((item) => item.kind === "business" || item.kind === "report")
        .slice(0, 5)
        .map((item) => item.title),
      competitive_edge: [],
      business_stage: "unknown",
      growth_driver: "待采集",
      risk_factors: []
    },
    metrics: {},
    series: [],
    evidence: pickFundamentalEvidence(announcementPage),
    sourceSummary: {
      annual_reports: notices.filter((item) => /年报|年度报告/.test(item.title)).length,
      quarterly_reports: notices.filter((item) => /季报|季度报告|半年报|半年度报告/.test(item.title)).length,
      notices: notices.length,
      ir_items: notices.filter((item) => /业绩说明会|投资者关系|路演|调研|互动易/.test(item.title)).length
    }
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const announcementPage = await fetchEastmoneyAnnouncementPage(symbol);
    const fundamentalInput = buildMockFundamentalData(symbol, announcementPage);
    return Response.json({
      symbol,
      announcementPage: eastmoneyAnnouncementSummary(announcementPage),
      fundamentalInput,
      promptPreview: fundamentalInputToPrompt(fundamentalInput)
    });
  } catch (error) {
    return Response.json({ error: error.message || "基本面采集失败" }, { status: 400 });
  }
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const symbol = String(payload.symbol || "").trim();
  if (!symbol) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const announcementPage = await fetchEastmoneyAnnouncementPage(symbol);
    const fundamentalInput = buildMockFundamentalData(symbol, announcementPage);
    const report = await runFundamentalAgent({ payload, fundamentalInput });
    return Response.json({
      symbol,
      fundamentalInput,
      report,
      promptPreview: fundamentalInputToPrompt(fundamentalInput),
      reportPreview: fundamentalReportToPrompt(report)
    });
  } catch (error) {
    return Response.json({ error: error.message || "基本面分析失败" }, { status: 400 });
  }
}
