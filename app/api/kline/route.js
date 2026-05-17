import { fetchEastmoneyKline } from "../../lib/eastmoneyKline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const period = searchParams.get("period") || "daily";
  const limit = searchParams.get("limit") || "120";
  const adjust = searchParams.get("adjust") || "qfq";

  try {
    const kline = await fetchEastmoneyKline({ symbol, period, limit, adjust });
    return Response.json({ kline });
  } catch (error) {
    return Response.json({ error: error.message || "K 线获取失败" }, { status: 400 });
  }
}
