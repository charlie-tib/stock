import { buildFundamentalInput } from "./basicFundamental.js";
import { fetchEastmoneyFinancialSeries } from "./eastmoneyFinance.js";
import { collectFundamentalEvidence } from "./fundamentalSources.js";
import { fetchTencentQuote } from "./tencentQuote.js";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildFundamentalData(symbol, collected) {
  const announcementPage = collected?.announcementPage || {};
  const cninfoPage = collected?.cninfoPage || {};
  const evidence = collected?.evidence || [];
  const structured = collected?.structuredEvidence || {};
  const stockName = announcementPage?.stockInfo?.name || "";
  const notices = announcementPage?.notices || [];
  const reportItems = evidence.filter((item) => /年报|年度报告|季报|季度报告|半年报|半年度报告/.test(item.title));
  const irItems = evidence.filter((item) => item.source === "ir" || /业绩说明会|投资者关系|路演|调研/.test(item.title));
  const businessItems = structured.business || evidence.filter((item) => item.kind === "business");
  const moatItems = structured.moat || evidence.filter((item) => item.kind === "moat");
  const planItems = structured.plan || evidence.filter((item) => item.kind === "plan");
  const riskItems = structured.risk || evidence.filter((item) => item.kind === "risk");
  const quote = collected?.quote || null;
  const series = collected?.financialSeries || [];
  const latestFinancial = series[0] || {};

  return buildFundamentalInput({
    symbol,
    name: stockName || quote?.name || "",
    profile: {
      industry: announcementPage?.stockInfo?.hyname || "",
      main_business: businessItems[0]?.chunk || "待从年报/季报/公告中抽取",
      business_layout: businessItems.slice(0, 5).map((item) => item.title),
      competitive_edge: moatItems.slice(0, 5).map((item) => item.title),
      business_stage: planItems.length ? "expansion" : "unknown",
      growth_driver: planItems.length
        ? planItems.slice(0, 3).map((item) => item.title).join(" / ")
        : irItems.length
          ? irItems.slice(0, 3).map((item) => item.title).join(" / ")
          : "待采集",
      risk_factors: riskItems.length
        ? riskItems.slice(0, 6).map((item) => item.title)
        : evidence
            .filter((item) => /风险|减值|诉讼|处罚|亏损|下滑|担保|质押/.test(item.title + " " + item.chunk))
            .slice(0, 6)
            .map((item) => item.title)
    },
    metrics: {
      pe: quote?.pe ?? null,
      pb: finiteNumber(quote?.rawFields?.[46]),
      price: quote?.price ?? null,
      change_percent: quote?.changePercent ?? null,
      turnover_rate: quote?.turnoverRate ?? null,
      total_market_value_wan: quote?.totalMarketValue ?? null,
      circulating_market_value_wan: quote?.circulatingMarketValue ?? null,
      amount_wan: quote?.amountWan ?? null,
      roe: latestFinancial.roe ?? null,
      gross_margin: latestFinancial.gross_margin ?? null,
      net_margin: latestFinancial.net_margin ?? null,
      debt_ratio: latestFinancial.debt_ratio ?? null,
      revenue_yoy: latestFinancial.revenue_yoy ?? null,
      profit_yoy: latestFinancial.profit_yoy ?? null
    },
    series,
    evidence,
    sourceSummary: {
      annual_reports: reportItems.filter((item) => /年报|年度报告/.test(item.title)).length,
      quarterly_reports: reportItems.filter((item) => /季报|季度报告|半年报|半年度报告/.test(item.title)).length,
      notices: notices.length,
      cninfo_items: cninfoPage?.notices?.length || 0,
      ir_items: irItems.length,
      disclosure_items: evidence.length
    },
    sourceLinks: collected?.sourceLinks || {}
  });
}

export async function collectFundamentalQuote(symbol) {
  try {
    return await fetchTencentQuote(symbol);
  } catch {
    return null;
  }
}

export async function collectFinancialSeries(symbol, limit = 8) {
  try {
    return await fetchEastmoneyFinancialSeries(symbol, limit);
  } catch {
    return [];
  }
}

export async function collectFundamentalPackage(symbol, options = {}) {
  const [collected, quote, financialSeries] = await Promise.all([
    collectFundamentalEvidence(symbol, {
      eastmoneyLimit: options.eastmoneyLimit ?? 8,
      cninfoLimit: options.cninfoLimit ?? 8,
      irLimit: options.irLimit ?? 4
    }),
    collectFundamentalQuote(symbol),
    collectFinancialSeries(symbol, options.financeLimit ?? 8)
  ]);
  collected.quote = quote;
  collected.financialSeries = financialSeries;
  return {
    collected,
    quote,
    financialSeries,
    fundamentalInput: buildFundamentalData(symbol, collected)
  };
}
