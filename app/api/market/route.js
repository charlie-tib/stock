import { collectMarketEnvironment } from "../../lib/marketEnvironment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const marketEnvironment = await collectMarketEnvironment();
    return Response.json({ marketEnvironment });
  } catch (error) {
    return Response.json({ error: error.message || "市场环境获取失败" }, { status: 400 });
  }
}
