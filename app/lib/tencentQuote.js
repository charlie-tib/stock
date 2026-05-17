const TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q=";

function cleanSymbol(symbol) {
  return String(symbol || "").trim().replace(/\s+/g, "");
}

export function normalizeTencentSymbol(symbol) {
  const raw = cleanSymbol(symbol);
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(lower)) return lower;
  if (/^hk[a-z0-9]{2,8}$/i.test(raw)) return `hk${raw.slice(2).toUpperCase()}`;
  if (/^us[a-z0-9.]+$/i.test(raw)) return `us${raw.slice(2).toUpperCase()}`;
  if (/^\d{5}$/.test(raw)) return `hk${raw}`;

  if (/^\d{6}$/.test(raw)) {
    if (/^(60|68|51|52|56|58|90)/.test(raw)) return `sh${raw}`;
    if (/^(00|12|13|15|16|18|20|30|39)/.test(raw)) return `sz${raw}`;
    if (/^(43|83|87|88|92)/.test(raw)) return `bj${raw}`;
  }

  return lower;
}

function field(fields, index) {
  const value = fields[index];
  if (value === undefined || value === "") return null;
  return value;
}

function numberField(fields, index) {
  const value = Number(field(fields, index));
  return Number.isFinite(value) ? value : null;
}

function level(fields, priceIndex, volumeIndex) {
  return {
    price: numberField(fields, priceIndex),
    volume: numberField(fields, volumeIndex)
  };
}

function decodeResponse(buffer) {
  try {
    return new TextDecoder("gb18030").decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

export function parseTencentQuote(text, requestedSymbol) {
  const match = text.match(/="([^"]*)";?/);
  if (!match) {
    throw new Error("腾讯行情返回格式无法解析");
  }

  const fields = match[1].split("~");
  if (fields.length < 4 || !field(fields, 1)) {
    throw new Error("腾讯行情未返回有效标的");
  }

  return {
    source: "tencent",
    requestedSymbol,
    symbol: normalizeTencentSymbol(requestedSymbol),
    name: field(fields, 1),
    code: field(fields, 2),
    price: numberField(fields, 3),
    previousClose: numberField(fields, 4),
    open: numberField(fields, 5),
    change: numberField(fields, 31),
    changePercent: numberField(fields, 32),
    high: numberField(fields, 33),
    low: numberField(fields, 34),
    volumeHands: numberField(fields, 36),
    amountWan: numberField(fields, 37),
    turnoverRate: numberField(fields, 38),
    pe: numberField(fields, 39),
    amplitude: numberField(fields, 43),
    circulatingMarketValue: numberField(fields, 44),
    totalMarketValue: numberField(fields, 45),
    timestamp: field(fields, 30),
    bid: [
      level(fields, 9, 10),
      level(fields, 11, 12),
      level(fields, 13, 14),
      level(fields, 15, 16),
      level(fields, 17, 18)
    ],
    ask: [
      level(fields, 19, 20),
      level(fields, 21, 22),
      level(fields, 23, 24),
      level(fields, 25, 26),
      level(fields, 27, 28)
    ],
    rawFields: fields
  };
}

export async function fetchTencentQuote(symbol) {
  const normalized = normalizeTencentSymbol(symbol);
  if (!normalized) {
    throw new Error("请先输入股票代码");
  }

  const response = await fetch(`${TENCENT_QUOTE_URL}${encodeURIComponent(normalized)}`, {
    cache: "no-store",
    headers: {
      "User-Agent": "Agent4Stock/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`腾讯行情请求失败：${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const text = decodeResponse(buffer);
  return parseTencentQuote(text, normalized);
}

export function quoteToPrompt(quote) {
  if (!quote) return "market_quote: unavailable";

  const bid = (quote.bid || [])
    .map((item, index) => `买${index + 1}: ${item.price ?? ""}/${item.volume ?? ""}`)
    .join("; ");
  const ask = (quote.ask || [])
    .map((item, index) => `卖${index + 1}: ${item.price ?? ""}/${item.volume ?? ""}`)
    .join("; ");

  return [
    "market_quote:",
    `source: ${quote.source}`,
    `name: ${quote.name || ""}`,
    `code: ${quote.code || ""}`,
    `symbol: ${quote.symbol || ""}`,
    `price: ${quote.price ?? ""}`,
    `change: ${quote.change ?? ""}`,
    `change_percent: ${quote.changePercent ?? ""}`,
    `previous_close: ${quote.previousClose ?? ""}`,
    `open: ${quote.open ?? ""}`,
    `high: ${quote.high ?? ""}`,
    `low: ${quote.low ?? ""}`,
    `volume_hands: ${quote.volumeHands ?? ""}`,
    `amount_wan: ${quote.amountWan ?? ""}`,
    `turnover_rate: ${quote.turnoverRate ?? ""}`,
    `pe: ${quote.pe ?? ""}`,
    `amplitude: ${quote.amplitude ?? ""}`,
    `timestamp: ${quote.timestamp || ""}`,
    `bid_levels: ${bid}`,
    `ask_levels: ${ask}`
  ].join("\n");
}
