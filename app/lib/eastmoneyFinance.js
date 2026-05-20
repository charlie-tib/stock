import { normalizeStockCode } from "./basicFundamental.js";

const EASTMONEY_FINANCE_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function pick(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return null;
}

function parsePayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/^[^(]+\(([\s\S]*)\)\s*;?$/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}

function normalizeFinanceRow(row) {
  return {
    period: String(pick(row, ["REPORTDATE", "REPORT_DATE", "END_DATE", "NOTICE_DATE", "REPORT_YEAR"]) || "").slice(0, 10),
    report_type: pick(row, ["REPORT_TYPE", "REPORT_TYPE_NAME", "REPORT_DATE_NAME"]) || "",
    revenue: numberValue(pick(row, ["TOTAL_OPERATE_INCOME", "OPERATE_INCOME", "营业总收入", "营业收入"])),
    net_profit: numberValue(pick(row, ["PARENT_NETPROFIT", "NETPROFIT", "归母净利润", "净利润"])),
    revenue_yoy: numberValue(pick(row, ["YSTZ", "TOTAL_OPERATE_INCOME_YOY", "OPERATE_INCOME_YOY", "营业总收入同比增长", "营业收入同比增长"])),
    profit_yoy: numberValue(pick(row, ["SJLTZ", "PARENT_NETPROFIT_YOY", "NETPROFIT_YOY", "归母净利润同比增长", "净利润同比增长"])),
    roe: numberValue(pick(row, ["WEIGHTAVG_ROE", "ROE_WEIGHT", "JQJZCSYL", "净资产收益率"])),
    gross_margin: numberValue(pick(row, ["XSMLL", "GROSS_PROFIT_RATIO", "SALE_GROSSPROFITRTO", "销售毛利率"])),
    net_margin: numberValue(pick(row, ["NETPROFIT_MARGIN", "SALE_NETPROFITRTO", "XSJLL", "销售净利率"])),
    debt_ratio: numberValue(pick(row, ["DEBT_ASSET_RATIO", "ASSET_LIAB_RATIO", "ZCFZL", "资产负债率"])),
    eps: numberValue(pick(row, ["BASIC_EPS", "EPSJB", "基本每股收益"])),
    raw: row
  };
}

export async function fetchEastmoneyFinancialSeries(symbol, limit = 8) {
  const code = normalizeStockCode(symbol);
  if (!/^\d{6}$/.test(code)) {
    throw new Error("东方财富财务指标暂只支持 6 位 A 股代码");
  }

  const params = new URLSearchParams({
    reportName: "RPT_LICO_FN_CPD",
    columns: "ALL",
    filter: `(SECURITY_CODE="${code}")`,
    pageNumber: "1",
    pageSize: String(Math.max(1, Math.min(Number(limit) || 8, 20))),
    sortColumns: "REPORTDATE",
    sortTypes: "-1",
    source: "WEB",
    client: "WEB"
  });

  const response = await fetch(`${EASTMONEY_FINANCE_URL}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: "https://data.eastmoney.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`东方财富财务指标请求失败：${response.status}`);
  }

  const payload = parsePayload(await response.text());
  const rows = payload?.result?.data || payload?.data || [];
  if (!Array.isArray(rows)) {
    throw new Error("东方财富财务指标返回格式无法解析");
  }

  return rows.map(normalizeFinanceRow).filter((row) => row.period);
}
