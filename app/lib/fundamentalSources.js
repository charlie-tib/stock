import { buildEastmoneyNoticeUrl, normalizeStockCode } from "./basicFundamental.js";

function stripHtml(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTitleFromHtml(html) {
  const match = String(html || "").match(/<title>([^<]+)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

function looksLikeReport(title) {
  return /年报|半年报|季报|三季报|一季报|年度报告|半年度报告|季度报告/.test(title);
}

function looksLikeBusinessLayout(title) {
  return /业绩说明会|投资者关系|调研|互动易|投资者关系活动记录表|路演/.test(title);
}

export function buildEastmoneyAnnouncementListUrl(symbol) {
  const code = normalizeStockCode(symbol);
  if (!code) {
    throw new Error("需要股票代码");
  }
  return buildEastmoneyNoticeUrl(code);
}

export async function fetchEastmoneyAnnouncementPage(symbol) {
  const url = buildEastmoneyAnnouncementListUrl(symbol);
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Referer: "https://data.eastmoney.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`东方财富公告页请求失败：${response.status}`);
  }

  const html = await response.text();
  const title = pickTitleFromHtml(html);
  const stockInfoMatch = html.match(/var\s+stockInfo\s*=\s*(\{[\s\S]*?\});/);
  let stockInfo = {};
  try {
    stockInfo = stockInfoMatch ? JSON.parse(stockInfoMatch[1]) : {};
  } catch {
    stockInfo = {};
  }

  const chunks = [];
  const titleMatches = [...html.matchAll(/<a[^>]+href="([^"]+detail[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of titleMatches) {
    const href = match[1];
    const text = stripHtml(match[2]);
    if (!text || text.length < 4) continue;
    chunks.push({
      source: "eastmoney_notice",
      title: text,
      url: href.startsWith("http") ? href : `https:${href}`,
      kind: looksLikeReport(text) ? "report" : looksLikeBusinessLayout(text) ? "business" : "notice"
    });
  }

  return {
    source: "eastmoney",
    pageTitle: title,
    stockInfo,
    notices: chunks.slice(0, 30)
  };
}

export function eastmoneyAnnouncementSummary(page) {
  if (!page) return "";
  return [
    `source: ${page.source || ""}`,
    `pageTitle: ${page.pageTitle || ""}`,
    `stock: ${page.stockInfo?.name || ""} ${page.stockInfo?.code || ""}`,
    `notices: ${(page.notices || []).slice(0, 12).map((item) => `${item.kind}:${item.title}`).join(" | ")}`
  ].join("\n");
}

export function pickFundamentalEvidence(page) {
  if (!page?.notices?.length) return [];
  return page.notices.slice(0, 12).map((item) => ({
    source: item.source,
    date: "",
    title: item.title,
    chunk: item.url,
    kind: item.kind
  }));
}
