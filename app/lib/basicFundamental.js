function cleanSymbol(symbol) {
  return String(symbol || "").trim().replace(/\s+/g, "");
}

export function normalizeStockCode(symbol) {
  const raw = cleanSymbol(symbol);
  const match = raw.match(/(\d{6})$/);
  return match ? match[1] : raw;
}

export function buildEastmoneyNoticeUrl(symbol) {
  const code = normalizeStockCode(symbol);
  if (!code) {
    throw new Error("需要股票代码");
  }
  return `https://data.eastmoney.com/notices/stock/${code}.html`;
}

export function buildFundamentalInput({
  symbol,
  name,
  profile = {},
  metrics = {},
  series = [],
  evidence = [],
  sourceSummary = {},
  sourceLinks = {}
}) {
  return {
    symbol: normalizeStockCode(symbol),
    name: name || "",
    as_of: new Date().toISOString().slice(0, 10),
    profile: {
      industry: profile.industry || "",
      main_business: profile.main_business || "",
      business_layout: Array.isArray(profile.business_layout) ? profile.business_layout : [],
      competitive_edge: Array.isArray(profile.competitive_edge) ? profile.competitive_edge : [],
      business_stage: profile.business_stage || "",
      growth_driver: profile.growth_driver || "",
      risk_factors: Array.isArray(profile.risk_factors) ? profile.risk_factors : []
    },
    metrics: {
      pe: metrics.pe ?? null,
      pb: metrics.pb ?? null,
      ps: metrics.ps ?? null,
      peg: metrics.peg ?? null,
      roe: metrics.roe ?? null,
      gross_margin: metrics.gross_margin ?? null,
      net_margin: metrics.net_margin ?? null,
      debt_ratio: metrics.debt_ratio ?? null,
      ocf: metrics.ocf ?? null,
      revenue_yoy: metrics.revenue_yoy ?? null,
      profit_yoy: metrics.profit_yoy ?? null,
      price: metrics.price ?? null,
      change_percent: metrics.change_percent ?? null,
      turnover_rate: metrics.turnover_rate ?? null,
      total_market_value_wan: metrics.total_market_value_wan ?? null,
      circulating_market_value_wan: metrics.circulating_market_value_wan ?? null,
      amount_wan: metrics.amount_wan ?? null
    },
    financial_series: Array.isArray(series) ? series : [],
    evidence: Array.isArray(evidence) ? evidence : [],
    source_links: {
      eastmoney: sourceLinks.eastmoney || "",
      cninfo: sourceLinks.cninfo || "",
      ir: sourceLinks.ir || ""
    },
    source_summary: {
      annual_reports: sourceSummary.annual_reports ?? 0,
      quarterly_reports: sourceSummary.quarterly_reports ?? 0,
      notices: sourceSummary.notices ?? 0,
      cninfo_items: sourceSummary.cninfo_items ?? 0,
      ir_items: sourceSummary.ir_items ?? 0,
      disclosure_items: sourceSummary.disclosure_items ?? 0,
      updated_at: new Date().toISOString()
    }
  };
}

export function fundamentalInputToPrompt(input) {
  return [
    "fundamental_input:",
    `symbol: ${input.symbol || ""}`,
    `name: ${input.name || ""}`,
    `as_of: ${input.as_of || ""}`,
    `profile: ${JSON.stringify(input.profile || {}, null, 2)}`,
    `metrics: ${JSON.stringify(input.metrics || {}, null, 2)}`,
    `financial_series: ${JSON.stringify((input.financial_series || []).slice(-8), null, 2)}`,
    `source_links: ${JSON.stringify(input.source_links || {}, null, 2)}`,
    `evidence:\n${(input.evidence || [])
      .slice(0, 12)
      .map((item) => {
        return [
          `- source: ${item.source || ""}`,
          `  date: ${item.date || ""}`,
          `  title: ${item.title || ""}`,
          `  kind: ${item.kind || ""}`,
          `  url: ${item.url || ""}`,
          `  chunk: ${item.chunk || ""}`
        ].join("\n");
      })
      .join("\n")}`,
    `source_summary: ${JSON.stringify(input.source_summary || {}, null, 2)}`
  ].join("\n");
}
