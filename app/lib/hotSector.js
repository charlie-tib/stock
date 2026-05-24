import { fetchEastmoneyKline } from "./eastmoneyKline.js";
import { marketEnvironmentToPrompt } from "./marketEnvironment.js";

const EASTMONEY_CLIST_URL = "https://push2.eastmoney.com/api/qt/clist/get";

export const HOT_SECTOR_UNIVERSES = [
  { key: "industry", label: "行业板块", fs: "m:90+t:2" },
  { key: "concept", label: "概念板块", fs: "m:90+t:3" }
];

const EXCLUDED_CONCEPT_PATTERNS = /昨日|昨日连板|昨日涨停|昨日触板|预盈预增|机构重仓|融资融券|转债标的|富时罗素|MSCI|标准普尔|沪股通|深股通|证金持股/;

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBoard(row, universe) {
  return {
    key: `${universe.key}:${row.f12}`,
    universe: universe.key,
    universeLabel: universe.label,
    code: row.f12,
    name: row.f14,
    price: numberValue(row.f2),
    changePercent: numberValue(row.f3),
    change: numberValue(row.f4),
    volume: numberValue(row.f5),
    amount: numberValue(row.f6),
    totalMarketValue: numberValue(row.f20),
    circulatingMarketValue: numberValue(row.f21),
    mainNetInflow: numberValue(row.f62)
  };
}

function boardScore(board) {
  const change = board.changePercent ?? 0;
  const amountYi = (board.amount ?? 0) / 100000000;
  const inflowYi = (board.mainNetInflow ?? 0) / 100000000;
  return Number((change * 10 + Math.log10(Math.max(amountYi, 1)) * 8 + inflowYi * 0.8).toFixed(2));
}

function summarizeMembers(members) {
  const valid = members.filter((item) => Number.isFinite(item.changePercent));
  const rising = valid.filter((item) => item.changePercent > 0).length;
  const limitLike = valid.filter((item) => item.changePercent >= 9.8).length;
  const strong = valid.filter((item) => item.changePercent >= 5).length;
  const avgChange = valid.length
    ? Number((valid.reduce((sum, item) => sum + item.changePercent, 0) / valid.length).toFixed(2))
    : null;
  return {
    total: valid.length,
    rising,
    strong,
    limitLike,
    avgChange,
    breadth: valid.length ? Number((rising / valid.length).toFixed(2)) : null
  };
}

function summarizeTrend(klines) {
  const daily = klines.daily?.summary || null;
  const weekly = klines.weekly?.summary || null;
  return {
    daily: daily
      ? {
          close: daily.last?.close ?? null,
          changePercent: daily.last?.changePercent ?? null,
          ma5: daily.ma5,
          ma20: daily.ma20,
          ma60: daily.ma60,
          high20: daily.high20,
          low20: daily.low20,
          trend: daily.trend,
          latestDirection: daily.latestDirection
        }
      : null,
    weekly: weekly
      ? {
          close: weekly.last?.close ?? null,
          ma5: weekly.ma5,
          ma20: weekly.ma20,
          high20: weekly.high20,
          low20: weekly.low20,
          trend: weekly.trend
        }
      : null
  };
}

async function fetchBoardList(universe, limit = 30) {
  const params = new URLSearchParams({
    pn: "1",
    pz: String(limit),
    po: "1",
    np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: universe.fs,
    fields: "f12,f14,f2,f3,f4,f5,f6,f20,f21,f62"
  });
  const response = await fetch(`${EASTMONEY_CLIST_URL}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: "https://quote.eastmoney.com/center/boardlist.html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`${universe.label}请求失败：${response.status}`);
  }
  const payload = await response.json();
  const rows = payload?.data?.diff || [];
  return rows
    .map((row) => normalizeBoard(row, universe))
    .filter((item) => item.code && item.name && !EXCLUDED_CONCEPT_PATTERNS.test(item.name));
}

async function fetchBoardMembers(board, limit = 12) {
  const params = new URLSearchParams({
    pn: "1",
    pz: String(limit),
    po: "1",
    np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: `b:${board.code}`,
    fields: "f12,f14,f2,f3,f4,f5,f6,f20,f21,f62"
  });
  const response = await fetch(`${EASTMONEY_CLIST_URL}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: "https://quote.eastmoney.com/center/boardlist.html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`${board.name}成分股请求失败：${response.status}`);
  }
  const payload = await response.json();
  const rows = payload?.data?.diff || [];
  return rows.map((row) => ({
    code: row.f12,
    name: row.f14,
    price: numberValue(row.f2),
    changePercent: numberValue(row.f3),
    amount: numberValue(row.f6),
    mainNetInflow: numberValue(row.f62),
    totalMarketValue: numberValue(row.f20),
    circulatingMarketValue: numberValue(row.f21)
  }));
}

async function fetchBoardTrend(board) {
  const klines = {};
  const errors = [];
  for (const config of [
    { key: "daily", period: "daily", limit: 120 },
    { key: "weekly", period: "weekly", limit: 80 }
  ]) {
    try {
      klines[config.key] = await fetchEastmoneyKline({
        symbol: `90.${board.code}`,
        period: config.period,
        limit: config.limit,
        adjust: "qfq"
      });
    } catch (error) {
      errors.push(`${config.key}: ${error.message || "获取失败"}`);
    }
  }
  return { klines, errors };
}

async function enrichBoard(board) {
  const [membersResult, trendResult] = await Promise.all([
    fetchBoardMembers(board).then((members) => ({ members })).catch((error) => ({ members: [], error: error.message })),
    fetchBoardTrend(board)
  ]);
  const members = membersResult.members || [];
  const memberSummary = summarizeMembers(members);
  return {
    ...board,
    score: boardScore(board),
    members,
    memberSummary,
    trend: summarizeTrend(trendResult.klines),
    errors: [membersResult.error, ...(trendResult.errors || [])].filter(Boolean)
  };
}

export async function collectHotSectors(options = {}) {
  const perUniverse = options.perUniverse ?? 20;
  const topN = options.topN ?? 8;
  const lists = await Promise.all(
    HOT_SECTOR_UNIVERSES.map(async (universe) => {
      try {
        return await fetchBoardList(universe, perUniverse);
      } catch {
        return [];
      }
    })
  );
  const candidates = lists
    .flat()
    .map((board) => ({ ...board, score: boardScore(board) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  const sectors = await Promise.all(candidates.map(enrichBoard));
  return {
    source: "eastmoney",
    as_of: new Date().toISOString(),
    sectors,
    leader: sectors[0] || null
  };
}

export function hotSectorsToPrompt(hotSectors, marketEnvironment = null) {
  if (!hotSectors?.sectors?.length) return "hot_sectors: unavailable";
  const marketBlock = marketEnvironment ? `\n\n${marketEnvironmentToPrompt(marketEnvironment)}` : "";
  const rows = hotSectors.sectors
    .map((sector, index) => {
      const leaders = sector.members
        .slice(0, 6)
        .map((item) => `${item.name}(${item.code}) ${item.changePercent ?? ""}%`)
        .join(", ");
      return [
        `${index + 1}. ${sector.name} (${sector.universeLabel}, ${sector.code})`,
        `score: ${sector.score}`,
        `today: change=${sector.changePercent ?? ""}%, amount=${sector.amount ?? ""}, main_net_inflow=${sector.mainNetInflow ?? ""}`,
        `trend: daily=${JSON.stringify(sector.trend.daily || {})}, weekly=${JSON.stringify(sector.trend.weekly || {})}`,
        `member_summary: ${JSON.stringify(sector.memberSummary || {})}`,
        `leaders: ${leaders}`
      ].join("\n");
    })
    .join("\n\n");
  return [`hot_sectors:`, `source: ${hotSectors.source}`, `as_of: ${hotSectors.as_of}`, rows, marketBlock]
    .filter(Boolean)
    .join("\n");
}
