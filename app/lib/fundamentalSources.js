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

function uniqBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function pickTitleFromHtml(html) {
  const match = String(html || "").match(/<title>([^<]+)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

function textAround(html, keyword, radius = 80) {
  const plain = stripHtml(html);
  const index = plain.indexOf(keyword);
  if (index < 0) return "";
  return plain.slice(Math.max(0, index - radius), Math.min(plain.length, index + keyword.length + radius));
}

function extractKeySections(html, keywords = [], maxLength = 1200) {
  const plain = stripHtml(html);
  const chunks = [];
  for (const keyword of keywords) {
    const index = plain.indexOf(keyword);
    if (index < 0) continue;
    const start = Math.max(0, index - 120);
    const end = Math.min(plain.length, index + 420);
    const snippet = plain.slice(start, end).trim();
    if (snippet && !chunks.includes(snippet)) {
      chunks.push(snippet);
    }
  }
  return chunks.join(" ").slice(0, maxLength);
}

function looksLikeReport(title) {
  return /年报|半年报|季报|三季报|一季报|年度报告|半年度报告|季度报告/.test(title);
}

function looksLikeIR(title) {
  return /业绩说明会|投资者关系|调研|路演|业绩交流|机构调研|投资者活动|说明会/.test(title);
}

function looksLikeBusinessLayout(title) {
  return /新业务|布局|项目|产能|战略|募投|扩产|合作|投资|并购|研发|创新/.test(title);
}

function classifyEvidenceText(text) {
  const content = String(text || "");
  if (/主营业务|业务介绍|经营范围|产品结构|市场地位|收入构成/.test(content)) return "business";
  if (/核心竞争力|竞争优势|护城河|技术优势|渠道优势|品牌优势|规模优势/.test(content)) return "moat";
  if (/未来发展规划|发展战略|规划|募投|产能|扩产|项目|布局|新业务/.test(content)) return "plan";
  if (/风险因素|风险提示|诉讼|处罚|减值|亏损|下滑|担保|质押|控制权/.test(content)) return "risk";
  if (/业绩说明会|投资者关系|调研|路演|机构调研|互动易/.test(content)) return "ir";
  if (/年报|年度报告|半年报|季报|三季报|一季报/.test(content)) return "report";
  return "notice";
}

function extractInfocode(url) {
  const match = String(url || "").match(/infocode=([A-Z0-9]+)/i);
  return match ? match[1] : "";
}

function extractDateFromText(text) {
  const match = String(text || "").match(/(20\d{2})[./\-年](\d{1,2})[./\-月](\d{1,2})/);
  if (!match) return "";
  const year = match[1];
  const month = String(match[2]).padStart(2, "0");
  const day = String(match[3]).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractJsonpPayload(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^[^(]+\(([\s\S]*)\)\s*;?$/);
  if (!match) return null;
  const inner = match[1].trim();
  try {
    return JSON.parse(inner);
  } catch {
    return null;
  }
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: options.accept || "text/html,application/xhtml+xml",
      Referer: options.referer || "https://www.baidu.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }

  return response.text();
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href.startsWith("http") ? href : "";
  }
}

function pickDetailLinks(html) {
  const links = [];
  const seen = new Set();
  const regex = /<a[^>]+href="([^"]*notices\/detail\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(regex)) {
    const href = match[1];
    const title = stripHtml(match[2]);
    if (!title || title.length < 3) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const url = href.startsWith("http") ? href : `https:${href}`;
    links.push({
      title,
      url,
      infocode: extractInfocode(href),
      kind: classifyEvidenceText(title),
      date: extractDateFromText(title)
    });
  }
  return links;
}

async function fetchEastmoneyNoticePage(symbol) {
  const code = normalizeStockCode(symbol);
  if (!code) throw new Error("需要股票代码");
  const url = buildEastmoneyNoticeUrl(code);
  const html = await fetchText(url, {
    referer: "https://data.eastmoney.com/",
    accept: "text/html,application/xhtml+xml"
  });

  const stockInfoMatch = html.match(/var\s+stockInfo\s*=\s*(\{[\s\S]*?\});/);
  let stockInfo = {};
  try {
    stockInfo = stockInfoMatch ? JSON.parse(stockInfoMatch[1]) : {};
  } catch {
    stockInfo = {};
  }

  return {
    source: "eastmoney",
    url,
    pageTitle: pickTitleFromHtml(html),
    stockInfo,
    notices: pickDetailLinks(html).slice(0, 40)
  };
}

async function fetchEastmoneyNoticeDetail(item) {
  const html = await fetchText(item.url, {
    referer: "https://data.eastmoney.com/",
    accept: "text/html,application/xhtml+xml"
  });

  const title = pickTitleFromHtml(html) || item.title;
  const stockInfoMatch = html.match(/var\s+stockInfo\s*=\s*(\{[\s\S]*?\});/);
  let stockInfo = {};
  try {
    stockInfo = stockInfoMatch ? JSON.parse(stockInfoMatch[1]) : {};
  } catch {
    stockInfo = {};
  }

  const pText = [];
  for (const match of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripHtml(match[1]);
    if (text && text.length >= 6) pText.push(text);
  }
  const summary = pText.slice(0, 18).join(" ");

  let body = null;
  if (item.infocode) {
    try {
      const apiUrl = `https://data.eastmoney.com/api/content/ann/rich?${new URLSearchParams({
        infoCode: item.infocode,
        type: "3"
      }).toString()}`;
      const apiText = await fetchText(apiUrl, {
        referer: item.url,
        accept: "application/json, text/plain, */*"
      });
      let payload = null;
      try {
        payload = JSON.parse(apiText);
      } catch {
        payload = extractJsonpPayload(apiText);
      }
      const post = payload?.data?.post || payload?.post || payload?.data || payload || {};
      body = {
        title: stripHtml(post.post_title || post.title || ""),
        abstract: stripHtml(post.post_abstract || post.abstract || ""),
        content: stripHtml(post.post_content || post.content || "")
      };
    } catch {
      body = null;
    }
  }

  const chunk = body?.abstract || body?.content || summary || title;
  return {
    source: "eastmoney",
    kind: classifyEvidenceText(`${item.kind || ""} ${title} ${chunk}`),
    date: item.date || extractDateFromText(title),
    title,
    url: item.url,
    chunk,
    stockInfo,
    infocode: item.infocode,
    body
  };
}

function buildCninfoSearchUrl(symbol) {
  const code = normalizeStockCode(symbol);
  if (!code) throw new Error("需要股票代码");
  return `https://www.cninfo.com.cn/new/fulltextSearch?searchkey=${encodeURIComponent(code)}&sdate=&edate=&isfulltext=false`;
}

async function fetchCninfoSearch(symbol) {
  const url = buildCninfoSearchUrl(symbol);
  const html = await fetchText(url, {
    referer: "https://www.cninfo.com.cn/",
    accept: "text/html,application/xhtml+xml"
  });

  const rows = [];
  const regex = /<a[^>]+href="([^"]*\/new\/disclosure\/detail\?stockCode=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(regex)) {
    const href = match[1];
    const title = stripHtml(match[2]);
    if (!title || title.length < 3) continue;
    rows.push({
      source: "cninfo",
      title,
      url: resolveUrl(href, "https://www.cninfo.com.cn"),
      kind: classifyEvidenceText(title),
      date: extractDateFromText(title)
    });
  }

  return {
    source: "cninfo",
    url,
    title: pickTitleFromHtml(html),
    notices: uniqBy(rows, (item) => item.url).slice(0, 25)
  };
}

async function fetchCninfoDetail(item) {
  const html = await fetchText(item.url, {
    referer: "https://www.cninfo.com.cn/",
    accept: "text/html,application/xhtml+xml"
  });
  const title = pickTitleFromHtml(html) || item.title;
  const body =
    extractKeySections(html, ["公司简介", "主营业务", "主要会计数据", "经营情况", "核心竞争力", "风险因素", "未来发展规划"], 1300) ||
    stripHtml(textAround(html, "公告内容", 800) || html);
  return {
    source: "cninfo",
    kind: classifyEvidenceText(`${item.kind || ""} ${title} ${body}`),
    date: item.date || extractDateFromText(title),
    title,
    url: item.url,
    chunk: body.slice(0, 1200) || title
  };
}

function normalizeIrCandidate(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `https://www.${trimmed.replace(/^\/+/, "")}`;
  return `https://${trimmed}`;
}

async function fetchCompanyIrCandidates(symbol, companyName = "") {
  const candidates = [];
  const code = normalizeStockCode(symbol);
  if (!code) return candidates;

  const searchSeeds = [companyName, code].filter(Boolean);
  for (const seed of searchSeeds) {
    const q = encodeURIComponent(seed);
    const urls = [
      `https://www.google.com/search?q=${q}+投资者关系`,
      `https://www.bing.com/search?q=${q}+投资者关系`,
      `https://www.baidu.com/s?wd=${q}+投资者关系`
    ];
    for (const url of urls) {
      try {
        const html = await fetchText(url, {
          referer: "https://www.baidu.com/",
          accept: "text/html,application/xhtml+xml"
        });
        const links = [];
        for (const match of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
          const href = match[1];
          const title = stripHtml(match[2]);
          const fullUrl = normalizeIrCandidate(href);
          if (!/^https?:\/\//i.test(fullUrl)) continue;
          if (!/ir|investor|relation|stock|cnstock|cninfo|eastmoney/i.test(fullUrl + " " + title)) continue;
          if (/google|bing|baidu/i.test(fullUrl)) continue;
          links.push({
            source: "ir",
            title,
            url: fullUrl,
            kind: "ir",
            date: ""
          });
        }
        candidates.push(...links.slice(0, 5));
      } catch {
        continue;
      }
    }
  }

  return uniqBy(candidates, (item) => item.url).slice(0, 8);
}

async function fetchIrDetail(item) {
  const html = await fetchText(item.url, {
    referer: item.url,
    accept: "text/html,application/xhtml+xml"
  });
  const title = pickTitleFromHtml(html) || item.title;
  const text =
    extractKeySections(
      html,
      ["公司简介", "主营业务", "核心竞争力", "主要财务数据", "经营情况讨论与分析", "风险因素", "未来发展规划", "投资者关系", "调研", "路演"],
      1500
    ) || stripHtml(html);
  return {
    source: "ir",
    kind: classifyEvidenceText(`${item.kind || ""} ${title} ${text}`),
    date: item.date || extractDateFromText(title),
    title,
    url: item.url,
    chunk: text.slice(0, 1500) || title
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

function summarizeCollected(items) {
  return {
    annual_reports: items.filter((item) => /年报|年度报告/.test(item.title)).length,
    quarterly_reports: items.filter((item) => /季报|季度报告|半年报|半年度报告/.test(item.title)).length,
    notices: items.filter((item) => item.source === "eastmoney").length,
    cninfo_items: items.filter((item) => item.source === "cninfo").length,
    ir_items: items.filter((item) => item.source === "ir").length,
    disclosure_items: items.length
  };
}

export async function collectFundamentalEvidence(symbol, options = {}) {
  const code = normalizeStockCode(symbol);
  if (!code) {
    throw new Error("需要股票代码");
  }

  const eastmoneyLimit = options.eastmoneyLimit ?? 8;
  const cninfoLimit = options.cninfoLimit ?? 8;
  const irLimit = options.irLimit ?? 4;

  const announcementPage = await fetchEastmoneyNoticePage(code);
  const eastmoneyDetails = [];
  for (const item of announcementPage.notices.slice(0, eastmoneyLimit)) {
    try {
      eastmoneyDetails.push(await fetchEastmoneyNoticeDetail(item));
    } catch {
      eastmoneyDetails.push({
        source: "eastmoney",
        kind: item.kind,
        date: item.date || "",
        title: item.title,
        url: item.url,
        chunk: item.title
      });
    }
  }

  let cninfoPage = null;
  let cninfoDetails = [];
  try {
    cninfoPage = await fetchCninfoSearch(code);
    for (const item of cninfoPage.notices.slice(0, cninfoLimit)) {
      try {
        cninfoDetails.push(await fetchCninfoDetail(item));
      } catch {
        cninfoDetails.push({
          source: "cninfo",
          kind: item.kind,
          date: item.date || "",
          title: item.title,
          url: item.url,
          chunk: item.title
        });
      }
    }
  } catch {
    cninfoPage = null;
  }

  const companyName =
    announcementPage?.stockInfo?.name || cninfoPage?.notices?.[0]?.title?.replace(/\s+/g, "") || "";
  let irCandidates = [];
  try {
    irCandidates = await fetchCompanyIrCandidates(code, companyName);
  } catch {
    irCandidates = [];
  }

  const irDetails = [];
  for (const item of irCandidates.slice(0, irLimit)) {
    try {
      irDetails.push(await fetchIrDetail(item));
    } catch {
      irDetails.push({
        source: "ir",
        kind: item.kind,
        date: item.date || "",
        title: item.title,
        url: item.url,
        chunk: item.title
      });
    }
  }

  const evidence = uniqBy(
    [...eastmoneyDetails, ...cninfoDetails, ...irDetails].filter(Boolean),
    (item) => `${item.source}|${item.url || item.title}`
  ).slice(0, 30);

  const structuredEvidence = {
    business: evidence.filter((item) => item.kind === "business"),
    moat: evidence.filter((item) => item.kind === "moat"),
    plan: evidence.filter((item) => item.kind === "plan"),
    risk: evidence.filter((item) => item.kind === "risk"),
    report: evidence.filter((item) => item.kind === "report"),
    ir: evidence.filter((item) => item.kind === "ir")
  };

  return {
    announcementPage,
    cninfoPage,
    irPage: {
      source: "ir",
      candidates: irCandidates
    },
    evidence,
    structuredEvidence,
    sourceLinks: {
      eastmoney: announcementPage?.url || buildEastmoneyNoticeUrl(code),
      cninfo: cninfoPage?.url || "",
      ir: irCandidates[0]?.url || ""
    },
    sourceSummary: summarizeCollected(evidence)
  };
}
