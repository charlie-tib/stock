const EASTMONEY_KLINE_URLS = [
  "https://push2his.eastmoney.com/api/qt/stock/kline/get",
  "https://push2his.eastmoney.com/api/qt/stock/kline/get"
];

const PERIOD_MAP = {
  daily: "101",
  day: "101",
  d: "101",
  weekly: "102",
  monthly: "103",
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "60m": "60"
};

function cleanSymbol(symbol) {
  return String(symbol || "").trim().replace(/\s+/g, "");
}

export function normalizeEastmoneySecid(symbol) {
  const raw = cleanSymbol(symbol);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const code = lower.replace(/^(sh|sz|bj)/, "");

  if (!/^\d{6}$/.test(code)) {
    throw new Error("东方财富 K 线暂只支持 6 位 A 股代码");
  }

  if (lower.startsWith("sh")) return `1.${code}`;
  if (lower.startsWith("sz")) return `0.${code}`;
  if (lower.startsWith("bj")) return `0.${code}`;
  if (/^(60|68|51|52|56|58|90)/.test(code)) return `1.${code}`;
  return `0.${code}`;
}

function normalizePeriod(period) {
  const key = String(period || "daily").toLowerCase();
  const value = PERIOD_MAP[key];
  if (!value) {
    throw new Error(`不支持的 K 线周期：${period}`);
  }
  return value;
}

function parseKlineRow(row) {
  const parts = String(row || "").split(",");
  return {
    time: parts[0],
    open: Number(parts[1]),
    close: Number(parts[2]),
    high: Number(parts[3]),
    low: Number(parts[4]),
    volume: Number(parts[5]),
    amount: Number(parts[6]),
    amplitude: Number(parts[7]),
    changePercent: Number(parts[8]),
    change: Number(parts[9]),
    turnoverRate: Number(parts[10])
  };
}

function movingAverage(values, window) {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  const sum = slice.reduce((total, value) => total + value, 0);
  return Number((sum / window).toFixed(3));
}

function highest(values) {
  return values.length ? Math.max(...values) : null;
}

function lowest(values) {
  return values.length ? Math.min(...values) : null;
}

export function summarizeKlines(dataset) {
  const bars = dataset?.bars || [];
  if (!bars.length) return null;

  const closes = bars.map((bar) => bar.close).filter(Number.isFinite);
  const highs = bars.map((bar) => bar.high).filter(Number.isFinite);
  const lows = bars.map((bar) => bar.low).filter(Number.isFinite);
  const volumes = bars.map((bar) => bar.volume).filter(Number.isFinite);
  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const last20 = bars.slice(-20);
  const last60 = bars.slice(-60);

  return {
    source: dataset.source,
    period: dataset.period,
    name: dataset.name,
    code: dataset.code,
    count: bars.length,
    last,
    previous,
    ma5: movingAverage(closes, 5),
    ma10: movingAverage(closes, 10),
    ma20: movingAverage(closes, 20),
    ma60: movingAverage(closes, 60),
    high20: highest(last20.map((bar) => bar.high)),
    low20: lowest(last20.map((bar) => bar.low)),
    high60: highest(last60.map((bar) => bar.high)),
    low60: lowest(last60.map((bar) => bar.low)),
    avgVolume5: movingAverage(volumes, 5),
    avgVolume20: movingAverage(volumes, 20),
    trend:
      movingAverage(closes, 5) !== null && movingAverage(closes, 20) !== null
        ? movingAverage(closes, 5) >= movingAverage(closes, 20)
          ? "short_ma_above_mid_ma"
          : "short_ma_below_mid_ma"
        : "insufficient",
    latestDirection:
      last && previous
        ? last.close > previous.close
          ? "up"
          : last.close < previous.close
            ? "down"
            : "flat"
        : "insufficient"
  };
}

export async function fetchEastmoneyKline({ symbol, period = "daily", limit = 120, adjust = "qfq" }) {
  const secid = normalizeEastmoneySecid(symbol);
  const klt = normalizePeriod(period);
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 120, 1000));
  const fqt = adjust === "hfq" ? "2" : adjust === "none" ? "0" : "1";
  const params = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    ut: "7eea3edcaed734bea9cbfc24409ed989",
    klt,
    fqt,
    beg: "19700101",
    end: "20500101",
    rtntype: "6",
    lmt: String(normalizedLimit)
  });

  let data = null;
  let lastError = null;
  for (const url of EASTMONEY_KLINE_URLS) {
    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Accept: "application/json,text/plain,*/*",
          Referer: "https://quote.eastmoney.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`东方财富 K 线请求失败：${response.status}`);
      }
      data = await response.json();
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!data) {
    throw new Error(lastError?.message || "东方财富 K 线请求失败");
  }
  if (!data?.data?.klines?.length) {
    throw new Error("东方财富未返回有效 K 线");
  }

  const dataset = {
    source: "eastmoney",
    symbol,
    secid,
    period,
    adjust,
    name: data.data.name,
    code: data.data.code,
    bars: data.data.klines.map(parseKlineRow)
  };

  return {
    ...dataset,
    summary: summarizeKlines(dataset)
  };
}

export function klineToPrompt(dataset, maxBars = 20) {
  if (!dataset?.bars?.length) return "kline: unavailable";
  const summary = dataset.summary || summarizeKlines(dataset);
  const bars = dataset.bars
    .slice(-maxBars)
    .map((bar) => {
      return `${bar.time} O:${bar.open} H:${bar.high} L:${bar.low} C:${bar.close} V:${bar.volume} Pct:${bar.changePercent}`;
    })
    .join("\n");

  return [
    `kline_${dataset.period}:`,
    `source: ${dataset.source}`,
    `name: ${dataset.name || ""}`,
    `code: ${dataset.code || ""}`,
    `count: ${dataset.bars.length}`,
    `summary: last_close=${summary?.last?.close ?? ""}, ma5=${summary?.ma5 ?? ""}, ma10=${summary?.ma10 ?? ""}, ma20=${summary?.ma20 ?? ""}, ma60=${summary?.ma60 ?? ""}, high20=${summary?.high20 ?? ""}, low20=${summary?.low20 ?? ""}, trend=${summary?.trend ?? ""}`,
    `recent_bars:\n${bars}`
  ].join("\n");
}
