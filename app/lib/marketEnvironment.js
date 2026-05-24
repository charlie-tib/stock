import { fetchEastmoneyKline } from "./eastmoneyKline.js";

const EASTMONEY_QUOTE_URL = "https://push2.eastmoney.com/api/qt/stock/get";

export const A_SHARE_INDEXES = [
  { key: "shanghai", name: "上证指数", secid: "1.000001", role: "large_cap_broad" },
  { key: "csi300", name: "沪深300", secid: "1.000300", role: "large_cap_core" },
  { key: "shenzhen", name: "深证成指", secid: "0.399001", role: "growth_broad" },
  { key: "chinext", name: "创业板指", secid: "0.399006", role: "growth_risk" },
  { key: "csi500", name: "中证500", secid: "1.000905", role: "mid_cap" },
  { key: "csi1000", name: "中证1000", secid: "1.000852", role: "small_cap" },
  { key: "csi2000", name: "中证2000", secid: "2.932000", role: "micro_small_cap" },
  { key: "cn2000", name: "国证2000", secid: "0.399303", role: "small_micro_crosscheck" }
];

const MARKET_KLINE_CONFIG = [
  { key: "daily", period: "daily", limit: 160, adjust: "qfq" },
  { key: "weekly", period: "weekly", limit: 104, adjust: "qfq" },
  { key: "monthly", period: "monthly", limit: 60, adjust: "qfq" }
];

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function classifyTrend(summary) {
  if (!summary) return "unknown";
  if (summary.ma20 !== null && summary.ma60 !== null && summary.last?.close >= summary.ma20 && summary.ma20 >= summary.ma60) {
    return "uptrend";
  }
  if (summary.ma20 !== null && summary.ma60 !== null && summary.last?.close < summary.ma20 && summary.ma20 < summary.ma60) {
    return "downtrend";
  }
  if (summary.ma20 !== null && summary.last?.close >= summary.ma20) {
    return "recovering_or_range_high";
  }
  if (summary.ma20 !== null && summary.last?.close < summary.ma20) {
    return "weak_or_range_low";
  }
  return summary.trend || "unknown";
}

function summarizeIndex(index, quote, klines) {
  const daily = klines.daily?.summary || null;
  const weekly = klines.weekly?.summary || null;
  const monthly = klines.monthly?.summary || null;
  return {
    key: index.key,
    name: quote?.name || index.name,
    role: index.role,
    secid: index.secid,
    quote,
    trends: {
      daily: classifyTrend(daily),
      weekly: classifyTrend(weekly),
      monthly: classifyTrend(monthly)
    },
    levels: {
      daily_close: daily?.last?.close ?? quote?.price ?? null,
      daily_ma20: daily?.ma20 ?? null,
      daily_ma60: daily?.ma60 ?? null,
      daily_high20: daily?.high20 ?? null,
      daily_low20: daily?.low20 ?? null,
      weekly_ma20: weekly?.ma20 ?? null,
      monthly_ma20: monthly?.ma20 ?? null
    },
    latest: {
      change_percent: quote?.changePercent ?? daily?.last?.changePercent ?? null,
      amount: quote?.amount ?? daily?.last?.amount ?? null,
      amplitude: quote?.amplitude ?? daily?.last?.amplitude ?? null,
      date: daily?.last?.time || quote?.timestamp || ""
    }
  };
}

function inferBreadth(indexes) {
  const valid = indexes.filter((item) => Number.isFinite(item.latest.change_percent));
  const rising = valid.filter((item) => item.latest.change_percent > 0).length;
  const falling = valid.filter((item) => item.latest.change_percent < 0).length;
  const largeCaps = indexes.filter((item) => ["shanghai", "csi300"].includes(item.key));
  const smallCaps = indexes.filter((item) => ["csi1000", "csi2000", "cn2000"].includes(item.key));
  const avg = (items) => {
    const nums = items.map((item) => item.latest.change_percent).filter(Number.isFinite);
    if (!nums.length) return null;
    return Number((nums.reduce((sum, value) => sum + value, 0) / nums.length).toFixed(2));
  };
  const largeCapAvg = avg(largeCaps);
  const smallCapAvg = avg(smallCaps);
  return {
    rising,
    falling,
    total: valid.length,
    large_cap_avg_change: largeCapAvg,
    small_cap_avg_change: smallCapAvg,
    style_bias:
      largeCapAvg !== null && smallCapAvg !== null
        ? smallCapAvg - largeCapAvg > 0.5
          ? "small_cap_leading"
          : largeCapAvg - smallCapAvg > 0.5
            ? "large_cap_leading"
            : "balanced"
        : "unknown"
  };
}

async function fetchIndexQuote(index) {
  const params = new URLSearchParams({
    secid: index.secid,
    fields: "f57,f58,f43,f44,f45,f46,f47,f48,f60,f169,f170,f171,f168,f152",
    fltt: "2",
    invt: "2"
  });
  const response = await fetch(`${EASTMONEY_QUOTE_URL}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: "https://quote.eastmoney.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`${index.name} 指数快照请求失败：${response.status}`);
  }
  const data = await response.json();
  const row = data?.data;
  if (!row?.f58) {
    throw new Error(`${index.name} 指数快照为空`);
  }
  return {
    source: "eastmoney",
    name: row.f58 || index.name,
    code: row.f57 || index.secid.split(".")[1],
    price: numberValue(row.f43),
    high: numberValue(row.f44),
    low: numberValue(row.f45),
    open: numberValue(row.f46),
    volume: numberValue(row.f47),
    amount: numberValue(row.f48),
    previousClose: numberValue(row.f60),
    change: numberValue(row.f169),
    changePercent: numberValue(row.f170),
    amplitude: numberValue(row.f171),
    turnoverRate: numberValue(row.f168),
    timestamp: new Date().toISOString()
  };
}

async function fetchIndexPackage(index) {
  const [quoteResult, klineEntries] = await Promise.all([
    fetchIndexQuote(index).then((quote) => ({ quote })).catch((error) => ({ error: error.message })),
    Promise.all(
      MARKET_KLINE_CONFIG.map(async (config) => {
        try {
          const data = await fetchEastmoneyKline({
            symbol: index.secid,
            period: config.period,
            limit: config.limit,
            adjust: config.adjust
          });
          return [config.key, data, null];
        } catch (error) {
          return [config.key, null, error.message || `${config.period} 获取失败`];
        }
      })
    )
  ]);

  const klines = {};
  const errors = [];
  for (const [key, data, error] of klineEntries) {
    if (data) {
      klines[key] = data;
    } else {
      errors.push(`${key}: ${error}`);
    }
  }
  if (quoteResult.error) errors.push(`quote: ${quoteResult.error}`);

  return {
    ...summarizeIndex(index, quoteResult.quote, klines),
    klines,
    errors
  };
}

export async function collectMarketEnvironment(indexes = A_SHARE_INDEXES) {
  const results = await Promise.all(indexes.map(fetchIndexPackage));
  const available = results.filter((item) => item.quote || Object.keys(item.klines || {}).length);
  const errors = results.flatMap((item) => item.errors.map((error) => `${item.name || item.key}: ${error}`));
  const breadth = inferBreadth(available);
  return {
    source: "eastmoney",
    as_of: new Date().toISOString(),
    indexes: available,
    breadth,
    errors
  };
}

export function marketEnvironmentToPrompt(market) {
  if (!market?.indexes?.length) return "market_environment: unavailable";
  const rows = market.indexes
    .map((item) => {
      return [
        `- ${item.name} (${item.key}, ${item.role})`,
        `  change_percent: ${item.latest.change_percent ?? ""}`,
        `  daily_trend: ${item.trends.daily}`,
        `  weekly_trend: ${item.trends.weekly}`,
        `  monthly_trend: ${item.trends.monthly}`,
        `  levels: close=${item.levels.daily_close ?? ""}, ma20=${item.levels.daily_ma20 ?? ""}, ma60=${item.levels.daily_ma60 ?? ""}, high20=${item.levels.daily_high20 ?? ""}, low20=${item.levels.daily_low20 ?? ""}`,
        `  amount: ${item.latest.amount ?? ""}`
      ].join("\n");
    })
    .join("\n");
  return [
    "market_environment:",
    `source: ${market.source}`,
    `as_of: ${market.as_of}`,
    `breadth: ${JSON.stringify(market.breadth || {})}`,
    rows,
    market.errors?.length ? `partial_errors: ${market.errors.slice(0, 6).join("; ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
