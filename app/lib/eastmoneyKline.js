const EASTMONEY_KLINE_URLS = [
  "https://push2his.eastmoney.com/api/qt/stock/kline/get",
  "https://push2his.eastmoney.com/api/qt/stock/kline/get"
];

const PERIOD_MAP = {
  daily: "101",
  day: "101",
  d: "101",
  week: "102",
  weekly: "102",
  w: "102",
  month: "103",
  monthly: "103",
  m: "103",
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "60m": "60"
};

export const MULTI_SCALE_KLINE_CONFIG = [
  { key: "monthly", period: "monthly", label: "月K", limit: 120, adjust: "qfq", promptBars: 24 },
  { key: "weekly", period: "weekly", label: "周K", limit: 156, adjust: "qfq", promptBars: 30 },
  { key: "daily", period: "daily", label: "日K", limit: 240, adjust: "qfq", promptBars: 45 },
  { key: "hour60", period: "60m", label: "60分钟", limit: 240, adjust: "none", promptBars: 45 },
  { key: "minute15", period: "15m", label: "15分钟", limit: 240, adjust: "none", promptBars: 50 },
  { key: "minute5", period: "5m", label: "5分钟", limit: 240, adjust: "none", promptBars: 50 }
];

function cleanSymbol(symbol) {
  return String(symbol || "").trim().replace(/\s+/g, "");
}

export function normalizeEastmoneySecid(symbol) {
  const raw = cleanSymbol(symbol);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (/^[012]\.\d{6}$/.test(lower)) return lower;
  if (/^90\.bk\d{4}$/i.test(raw)) return raw.toUpperCase();
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

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function emaSeries(values, period) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const result = [];
  let previous = values[0];
  for (const value of values) {
    previous = result.length ? value * alpha + previous * (1 - alpha) : value;
    result.push(previous);
  }
  return result;
}

function calculateRsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs), 2);
}

function calculateMacd(closes) {
  if (closes.length < 35) return null;
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const dif = closes.map((_, index) => ema12[index] - ema26[index]);
  const dea = emaSeries(dif, 9);
  const histogram = dif.map((value, index) => (value - dea[index]) * 2);
  const last = dif.length - 1;
  const previous = dif.length - 2;
  return {
    dif: round(dif[last]),
    dea: round(dea[last]),
    histogram: round(histogram[last]),
    previousHistogram: round(histogram[previous]),
    signal:
      histogram[last] > 0 && dif[last] > dea[last]
        ? "bullish"
        : histogram[last] < 0 && dif[last] < dea[last]
          ? "bearish"
          : "neutral",
    momentum:
      histogram[last] > histogram[previous]
        ? "strengthening"
        : histogram[last] < histogram[previous]
          ? "weakening"
          : "flat"
  };
}

function calculateBoll(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mid = slice.reduce((sum, value) => sum + value, 0) / period;
  const variance = slice.reduce((sum, value) => sum + (value - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mid + multiplier * sd;
  const lower = mid - multiplier * sd;
  const close = closes[closes.length - 1];
  return {
    upper: round(upper),
    mid: round(mid),
    lower: round(lower),
    width: mid ? round((upper - lower) / mid, 4) : null,
    position:
      close >= upper
        ? "above_upper"
        : close <= lower
          ? "below_lower"
          : close >= mid
            ? "upper_half"
            : "lower_half"
  };
}

function calculateKdj(bars, period = 9) {
  if (bars.length < period) return null;
  let k = 50;
  let d = 50;
  const values = [];
  for (let index = period - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - period + 1, index + 1);
    const high = highest(window.map((bar) => bar.high));
    const low = lowest(window.map((bar) => bar.low));
    const close = bars[index].close;
    const rsv = high === low ? 50 : ((close - low) / (high - low)) * 100;
    k = (2 * k + rsv) / 3;
    d = (2 * d + k) / 3;
    values.push({ k, d, j: 3 * k - 2 * d });
  }
  const last = values[values.length - 1];
  const previous = values[values.length - 2] || last;
  return {
    k: round(last.k, 2),
    d: round(last.d, 2),
    j: round(last.j, 2),
    signal:
      last.k > last.d && previous.k <= previous.d
        ? "golden_cross"
        : last.k < last.d && previous.k >= previous.d
          ? "death_cross"
          : last.j >= 80
            ? "overbought"
            : last.j <= 20
              ? "oversold"
              : last.k >= last.d
                ? "bullish"
                : "bearish"
  };
}

function calculateIndicators(bars, closes) {
  const rsi6 = calculateRsi(closes, 6);
  const rsi14 = calculateRsi(closes, 14);
  return {
    rsi: {
      rsi6,
      rsi14,
      signal:
        rsi14 === null
          ? "insufficient"
          : rsi14 >= 70
            ? "overbought"
            : rsi14 <= 30
              ? "oversold"
              : rsi14 >= 50
                ? "bullish"
                : "bearish"
    },
    kdj: calculateKdj(bars),
    boll: calculateBoll(closes),
    macd: calculateMacd(closes)
  };
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
  const indicators = calculateIndicators(bars, closes);

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
    indicators,
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

export async function fetchMultiScaleKlines(symbol, config = MULTI_SCALE_KLINE_CONFIG) {
  const entries = await Promise.all(
    config.map(async (item) => {
      try {
        const data = await fetchEastmoneyKline({
          symbol,
          period: item.period,
          limit: item.limit,
          adjust: item.adjust
        });
        return [item.key, data, null];
      } catch (error) {
        return [item.key, null, error.message || `${item.label} 获取失败`];
      }
    })
  );

  const klines = {};
  const errors = [];
  for (const [key, data, error] of entries) {
    if (data) {
      klines[key] = data;
    } else {
      errors.push(`${key}: ${error}`);
    }
  }

  return {
    klines,
    errors,
    config
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
    `indicators: ${JSON.stringify(summary?.indicators || {})}`,
    `recent_bars:\n${bars}`
  ].join("\n");
}

export function multiScaleKlinesToPrompt(klines = {}, config = MULTI_SCALE_KLINE_CONFIG) {
  const blocks = [];
  for (const item of config) {
    const dataset = klines[item.key];
    blocks.push(dataset ? klineToPrompt(dataset, item.promptBars) : `kline_${item.period}: unavailable`);
  }
  return blocks.join("\n\n");
}
