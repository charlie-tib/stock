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

function dateOnly(value) {
  return String(value || "").slice(0, 10);
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

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    accept: "application/json,text/plain,*/*",
    ...options
  });
  try {
    return JSON.parse(text);
  } catch {
    return extractJsonpPayload(text);
  }
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

function normalizeEastmoneyAnnItem(item) {
  const codeInfo = item?.codes?.[0] || {};
  const artCode = item?.art_code || item?.artCode || "";
  const stockCode = codeInfo.stock_code || "";
  const title = stripHtml(item?.title || item?.title_ch || "");
  return {
    source: "eastmoney",
    title,
    url:
      stockCode && artCode
        ? `https://data.eastmoney.com/notices/detail/${stockCode}/${artCode}.html`
        : artCode
          ? `https://data.eastmoney.com/notices/detail/${artCode}.html`
          : "",
    infocode: artCode,
    kind: classifyEvidenceText(`${title} ${(item?.columns || []).map((column) => column.column_name).join(" ")}`),
    date: dateOnly(item?.notice_date || item?.display_time || item?.sort_date),
    columns: item?.columns || []
  };
}

async function fetchEastmoneyNoticePage(symbol) {
  const code = normalizeStockCode(symbol);
  if (!code) throw new Error("需要股票代码");
  const url = buildEastmoneyNoticeUrl(code);
  let stockInfo = {};
  try {
    const html = await fetchText(url, {
      referer: "https://data.eastmoney.com/",
      accept: "text/html,application/xhtml+xml"
    });
    const stockInfoMatch = html.match(/var\s+stockInfo\s*=\s*(\{[\s\S]*?\});/);
    stockInfo = stockInfoMatch ? JSON.parse(stockInfoMatch[1]) : {};
  } catch {
    stockInfo = {};
  }

  const apiUrl = `https://np-anotice-stock.eastmoney.com/api/security/ann?${new URLSearchParams({
    ann_type: "A",
    client_source: "web",
    stock_list: code,
    page_index: "1",
    page_size: "40"
  }).toString()}`;
  const payload = await fetchJson(apiUrl, {
    referer: url,
    headers: {
      Origin: "https://data.eastmoney.com"
    }
  });
  const rows = payload?.data?.list || [];
  if (!Array.isArray(rows)) {
    throw new Error("东方财富公告列表返回格式无法解析");
  }

  if (!stockInfo.name) {
    const codeInfo = rows[0]?.codes?.[0] || {};
    stockInfo = {
      code,
      name: codeInfo.short_name || "",
      hycode: "",
      hyname: "",
      market: codeInfo.market_code || "",
      type: "",
      hqCode: codeInfo.market_code ? `${codeInfo.market_code}.${code}` : code,
      marketCode: codeInfo.ann_type || ""
    };
  }

  return {
    source: "eastmoney",
    url,
    apiUrl,
    pageTitle: `${stockInfo.name || code}公告列表`,
    stockInfo,
    notices: rows.map(normalizeEastmoneyAnnItem).filter((item) => item.title && item.infocode)
  };
}

async function fetchEastmoneyNoticeDetail(item) {
  let body = null;
  if (item.infocode) {
    try {
      const apiUrl = `https://np-cnotice-stock.eastmoney.com/api/content/ann?${new URLSearchParams({
        art_code: item.infocode,
        client_source: "web",
        page_index: "1"
      }).toString()}`;
      const payload = await fetchJson(apiUrl, {
        referer: item.url || "https://data.eastmoney.com/",
        headers: {
          Origin: "https://data.eastmoney.com"
        }
      });
      const post = payload?.data || {};
      body = {
        title: stripHtml(post.notice_title || ""),
        abstract: "",
        content: stripHtml(post.notice_content || ""),
        attachUrl: post.attach_url_web || post.attach_url || ""
      };
    } catch {
      body = null;
    }
  }

  if (!body) {
    try {
      const html = await fetchText(item.url, {
        referer: "https://data.eastmoney.com/",
        accept: "text/html,application/xhtml+xml"
      });
      const pText = [];
      for (const match of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
        const text = stripHtml(match[1]);
        if (text && text.length >= 6) pText.push(text);
      }
      body = {
        title: pickTitleFromHtml(html) || item.title,
        abstract: "",
        content: pText.slice(0, 18).join(" ")
      };
    } catch {
      body = null;
    }
  }

  const title = body?.title || item.title;
  const chunk = body?.abstract || body?.content || title;
  return {
    source: "eastmoney",
    kind: classifyEvidenceText(`${item.kind || ""} ${title} ${chunk}`),
    date: item.date || extractDateFromText(title),
    title,
    url: item.url,
    chunk: chunk.slice(0, 1800),
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
