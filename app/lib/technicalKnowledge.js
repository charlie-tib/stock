const CHUNKS = [
  {
    id: "candlestick-reversal",
    title: "蜡烛图反转信号",
    tags: ["蜡烛图", "反转", "锤子线", "吞没", "乌云盖顶", "启明星", "黄昏星"],
    content:
      "蜡烛图反转形态要结合位置判断：锤子线、看涨吞没、启明星更适合出现在下跌末段或支撑区；上吊线、看跌吞没、乌云盖顶、黄昏星更适合出现在上涨末段或压力区。单根或两三根K线只是警示信号，必须观察后续确认、成交量和关键价位是否配合。"
  },
  {
    id: "trend-structure",
    title: "趋势结构",
    tags: ["趋势", "高低点", "上升趋势", "下降趋势", "震荡"],
    content:
      "技术趋势可先看高低点结构：高点和低点同步抬高，偏上升趋势；高点和低点同步降低，偏下降趋势；高低点交错且缺少延续，偏震荡。趋势判断优先于形态判断，逆趋势形态需要更强确认。"
  },
  {
    id: "support-resistance",
    title: "支撑压力与突破",
    tags: ["支撑", "压力", "突破", "回踩", "假突破"],
    content:
      "支撑压力通常来自前高前低、密集成交区、缺口、均线和整数位。有效突破通常需要收盘站稳、成交量放大、回踩不破或快速脱离压力区。若突破后缩量回落并跌回区间，需警惕假突破。"
  },
  {
    id: "volume-price",
    title: "量价关系",
    tags: ["成交量", "量价", "放量", "缩量", "换手"],
    content:
      "量价分析关注价格运动是否得到成交量确认。上涨放量且回调缩量，通常说明承接尚可；上涨缩量可能代表追价意愿不足；下跌放量说明分歧或抛压增强；低位放量止跌需要结合形态和后续阳线确认。"
  },
  {
    id: "moving-average",
    title: "均线系统",
    tags: ["均线", "MA", "趋势", "多头排列", "空头排列"],
    content:
      "均线用于观察趋势方向、成本区和动态支撑压力。短中长期均线多头排列且价格在均线上方，趋势偏强；空头排列且价格在均线下方，趋势偏弱。均线缠绕常代表震荡或方向选择前的整理。"
  },
  {
    id: "macd-rsi",
    title: "MACD 与 RSI",
    tags: ["MACD", "RSI", "背离", "动量", "超买", "超卖"],
    content:
      "MACD 更适合观察趋势动量变化和背离，RSI 更适合观察强弱和超买超卖。指标背离不是立即反转信号，只说明动量与价格不一致，需要价格结构确认。强趋势中，超买或超卖状态可能持续较久。"
  },
  {
    id: "wave-principles",
    title: "波浪分析原则",
    tags: ["波浪", "艾略特", "推动浪", "调整浪", "浪型"],
    content:
      "波浪理论常把趋势运动拆为推动和调整，但浪型划分主观性较强。实战中更适合把它作为情景推演工具：标注可能路径、关键失效位和替代数浪，而不是把单一数浪当作确定预测。"
  },
  {
    id: "risk-confirmation",
    title: "技术信号确认与失效",
    tags: ["止损", "失效", "确认", "风险"],
    content:
      "任何技术形态都应给出确认条件和失效条件。确认条件可以是放量突破、站稳关键位、回踩不破、趋势线修复；失效条件可以是跌破前低、放量长阴、跌回突破区间或关键均线失守。"
  }
];

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[\s,，。！？、;；:：()（）/\\\-_.]+/)
    .filter(Boolean);
}

function scoreChunk(chunk, query) {
  const queryText = String(query || "").toLowerCase();
  const tokens = tokenize(queryText);
  let score = 0;

  for (const tag of chunk.tags) {
    if (queryText.includes(tag.toLowerCase())) score += 4;
  }
  for (const token of tokens) {
    if (chunk.title.toLowerCase().includes(token)) score += 2;
    if (chunk.content.toLowerCase().includes(token)) score += 1;
  }
  return score;
}

export function retrieveTechnicalKnowledge(query, limit = 5) {
  const ranked = CHUNKS.map((chunk) => ({ ...chunk, score: scoreChunk(chunk, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.every((chunk) => chunk.score === 0)) {
    return CHUNKS.slice(0, limit);
  }
  return ranked;
}

export function knowledgeToPrompt(chunks) {
  return chunks
    .map((chunk, index) => {
      return `[${index + 1}] ${chunk.title}\n${chunk.content}`;
    })
    .join("\n\n");
}
