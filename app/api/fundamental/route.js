import {
  fundamentalInputToPrompt
} from "../../lib/basicFundamental.js";
import { runFundamentalAgent, fundamentalReportToPrompt } from "../../lib/fundamentalAgent.js";
import { eastmoneyAnnouncementSummary } from "../../lib/fundamentalSources.js";
import { collectFundamentalPackage } from "../../lib/fundamentalPipeline.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const { collected, quote, fundamentalInput } = await collectFundamentalPackage(symbol, {
      eastmoneyLimit: 8,
      cninfoLimit: 8,
      irLimit: 4
    });
    return Response.json({
      symbol,
      quote,
      announcementPage: eastmoneyAnnouncementSummary(collected.announcementPage),
      cninfoPage: collected.cninfoPage,
      irPage: collected.irPage,
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
    const { collected, quote, fundamentalInput } = await collectFundamentalPackage(symbol, {
      eastmoneyLimit: 8,
      cninfoLimit: 8,
      irLimit: 4
    });
    const report = await runFundamentalAgent({ payload, fundamentalInput });
    return Response.json({
      symbol,
      quote,
      fundamentalInput,
      report,
      promptPreview: fundamentalInputToPrompt(fundamentalInput),
      reportPreview: fundamentalReportToPrompt(report)
    });
  } catch (error) {
    return Response.json({ error: error.message || "基本面分析失败" }, { status: 400 });
  }
}
