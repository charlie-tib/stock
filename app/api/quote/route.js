import { fetchTencentQuote } from "../../lib/tencentQuote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  try {
    const quote = await fetchTencentQuote(symbol);
    return Response.json({ quote });
  } catch (error) {
    return Response.json({ error: error.message || "行情获取失败" }, { status: 400 });
  }
}
