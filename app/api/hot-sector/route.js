import { collectHotSectors } from "../../lib/hotSector";
import { collectMarketEnvironment } from "../../lib/marketEnvironment";
import { runHotSectorAgent } from "../../lib/hotSectorAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [hotSectors, marketEnvironment] = await Promise.all([
      collectHotSectors(),
      collectMarketEnvironment().catch(() => null)
    ]);
    return Response.json({ hotSectors, marketEnvironment });
  } catch (error) {
    return Response.json({ error: error.message || "热点板块获取失败" }, { status: 400 });
  }
}

export async function POST(request) {
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    const [hotSectors, marketEnvironment] = await Promise.all([
      collectHotSectors(),
      collectMarketEnvironment().catch(() => null)
    ]);
    const report = await runHotSectorAgent({
      payload,
      question: payload.user_question || "请分析今天 A 股最热门板块及主线潜力",
      hotSectors,
      marketEnvironment
    });
    return Response.json({ hotSectors, marketEnvironment, report });
  } catch (error) {
    return Response.json({ error: error.message || "热点板块分析失败" }, { status: 400 });
  }
}
