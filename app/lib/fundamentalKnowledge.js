const CHUNKS = [
  {
    id: "fundamental-workflow",
    title: "基本面分析工作流",
    tags: ["基本面", "分析框架", "流程", "财报"],
    content:
      "基本面分析先识别公司业务类型，再判断收入和利润来源，随后检查成长性、盈利质量、现金流、资产负债表、估值、护城河和风险。结论必须区分事实、推断和待验证假设，不能把公司叙事当成已经兑现的业绩。"
  },
  {
    id: "quality-growth",
    title: "高质量成长判断",
    tags: ["成长", "营收", "利润", "成长股", "业绩"],
    content:
      "高质量成长通常表现为营收增长、利润增长、毛利率或净利率稳定、经营现金流跟得上利润，并且增长来自主业扩张而非一次性收益。若营收增长但利润下滑，需要检查费用率、价格竞争、原材料成本、减值和新业务投入。"
  },
  {
    id: "profit-quality",
    title: "利润质量与现金流",
    tags: ["利润质量", "现金流", "应收账款", "存货", "减值"],
    content:
      "利润质量要看经营现金流、应收账款、存货、资产减值和资本开支。净利润增长但经营现金流长期偏弱，可能说明回款压力、收入确认激进或存货积压。制造业尤其要关注存货与应收账款是否同步异常扩张。"
  },
  {
    id: "three-statements",
    title: "财报三表联动",
    tags: ["三表", "资产负债表", "利润表", "现金流量表", "财务报表"],
    content:
      "三表分析要把利润表、资产负债表和现金流量表连起来看。收入和利润增长需要资产端的应收、存货、固定资产、合同资产变化来验证，也需要现金流量表验证回款和经营现金流。利润表改善但资产负债表恶化或经营现金流变差，说明质量需要打折。"
  },
  {
    id: "roe-dupont",
    title: "ROE 与杜邦拆解",
    tags: ["ROE", "杜邦", "净利率", "周转率", "杠杆"],
    content:
      "ROE 可拆为净利率、资产周转率和权益乘数。ROE 上升要判断来自经营效率改善、盈利能力提升，还是杠杆提高。高 ROE 配合低负债和稳定现金流，质量通常更好；高 ROE 如果依赖高杠杆，需要谨慎。"
  },
  {
    id: "piotroski-f-score",
    title: "Piotroski F-Score 质量框架",
    tags: ["Piotroski", "F-Score", "质量评分", "盈利能力", "杠杆", "运营效率"],
    content:
      "Piotroski F-Score 可作为质量检查清单，关注盈利能力、杠杆/流动性和运营效率三类信号。实务中可检查 ROA、经营现金流、经营现金流是否高于净利润、杠杆是否下降、流动性是否改善、是否稀释、毛利率和资产周转率是否改善。数据不全时只作为方向性质量框架，不要强行打满分。"
  },
  {
    id: "altman-z-score",
    title: "Altman Z-Score 偿债压力框架",
    tags: ["Altman", "Z-Score", "偿债", "破产风险", "资产负债率", "流动性"],
    content:
      "Altman Z-Score 用于观察企业财务困境风险，核心思想是把营运资本、留存收益、盈利能力、市场价值和资产周转结合起来看。A 股实务里可借鉴其精神：高负债、弱利润、弱现金流、低流动性和低周转同时出现时，应提高财务风险评级。"
  },
  {
    id: "beneish-m-score",
    title: "Beneish M-Score 财务操纵红旗",
    tags: ["Beneish", "M-Score", "财务造假", "应收账款", "毛利率", "费用资本化"],
    content:
      "Beneish M-Score 思路用于识别利润操纵红旗。重点关注应收账款相对收入异常上升、毛利率恶化但利润仍强、资产质量下降、销售高速增长伴随现金流弱、折旧政策变化、费用资本化、销售管理费用异常和高杠杆。没有完整数据时，应把这些作为红旗清单而非机械公式。"
  },
  {
    id: "valuation-methods",
    title: "估值方法",
    tags: ["估值", "PE", "PB", "PS", "PEG", "DCF"],
    content:
      "PE 适合盈利相对稳定的公司，PB 常用于银行、保险、周期低谷和资产型公司，PS 可用于利润暂时较弱但收入质量较可观察的成长公司，PEG 用于把估值与增速匹配。估值判断必须结合行业阶段、利润周期和成长确定性。"
  },
  {
    id: "dcf-sanity-check",
    title: "DCF 估值直觉校验",
    tags: ["DCF", "自由现金流", "折现率", "永续增长", "估值"],
    content:
      "DCF 不一定要精确建模，但可以用于校验市场隐含预期。关键看自由现金流、增长期长度、终局利润率、资本开支强度、折现率和永续增长率。若当前估值需要长期高增长和高利润率同时成立，而证据仍停留在规划阶段，应降低估值合理性评分。"
  },
  {
    id: "growth-layout",
    title: "成长股业务布局分析",
    tags: ["成长股", "新业务", "布局", "产能", "订单", "研发"],
    content:
      "成长股不能只看管理层叙事，要追踪新业务是否出现产品、客户、订单、产能、收入、毛利率和现金流。布局早期可以提高想象空间，但若长期没有财务兑现或订单验证，应降低置信度。"
  },
  {
    id: "moat-analysis",
    title: "护城河分析",
    tags: ["护城河", "竞争力", "品牌", "技术", "渠道", "成本"],
    content:
      "护城河可来自品牌、技术专利、规模成本、渠道控制、牌照资源、网络效应和客户切换成本。分析时要看优势是否能转化为更高毛利率、更稳定份额、更强定价权或更低费用率。"
  },
  {
    id: "risk-register",
    title: "基本面风险清单",
    tags: ["风险", "商誉", "质押", "担保", "诉讼", "处罚", "下滑"],
    content:
      "风险清单应覆盖需求下滑、价格竞争、毛利率压缩、客户集中、应收账款回款、存货跌价、商誉减值、诉讼处罚、股权质押、关联交易、担保和融资压力。风险要标注严重程度和证据来源。"
  },
  {
    id: "financial-red-flags",
    title: "财报红旗识别",
    tags: ["红旗", "异常", "应收", "存货", "商誉", "减值", "现金流"],
    content:
      "常见财报红旗包括：营收增长但经营现金流恶化，应收账款增速显著快于收入，存货持续高增且周转变慢，毛利率异常波动，商誉占比高且业绩承诺压力大，资本化研发或在建工程异常，关联交易复杂，分红与融资行为矛盾。红旗不等于结论，但会降低置信度。"
  },
  {
    id: "management-ir-language",
    title: "业绩会与 IR 话术识别",
    tags: ["IR", "业绩说明会", "调研", "管理层", "话术", "投资者关系"],
    content:
      "IR 和业绩会材料要区分事实和话术。订单、客户、产能、价格、收入、毛利率、现金流属于较强事实线索；战略布局、积极推进、持续优化、未来可期属于弱证据。若管理层频繁强调远期空间但缺少当前财务兑现，应标记为叙事强于验证。"
  },
  {
    id: "devils-advocate",
    title: "反方审查",
    tags: ["反方", "审查", "证伪", "风险", "假设"],
    content:
      "反方审查要求主动寻找看多逻辑的脆弱点：增长是否不可持续，估值是否透支，利润是否缺现金流支持，新业务是否只有规划没有订单，行业景气是否处在高点，竞争是否会压低毛利率。最终结论应说明哪些证据会推翻当前判断。"
  },
  {
    id: "segment-reporting",
    title: "分部与收入结构分析",
    tags: ["分部", "收入结构", "产品结构", "地区", "客户", "毛利率"],
    content:
      "分部分析关注不同产品、地区、客户和渠道对收入、毛利和增长的贡献。高增长若来自低毛利业务，质量未必高；高毛利业务若占比下降，整体盈利能力可能被稀释。客户集中度高时，要检查大客户订单稳定性和议价权。"
  },
  {
    id: "consumer-sector",
    title: "消费股分析框架",
    tags: ["消费", "白酒", "食品饮料", "品牌", "渠道", "库存"],
    content:
      "消费股重点看品牌力、渠道质量、价格带、库存、终端动销、毛利率和费用投放效率。白酒还要看批价、渠道库存、产品结构升级和区域扩张；大众消费要看量价关系和渠道费用。"
  },
  {
    id: "tech-manufacturing",
    title: "科技制造分析框架",
    tags: ["半导体", "新能源", "制造", "研发", "产能", "客户"],
    content:
      "科技制造重点看技术路线、客户结构、研发投入、产能利用率、良率、价格周期和资本开支。新产能要判断需求是否匹配，客户验证和订单是否支持收入兑现。"
  },
  {
    id: "cyclical-sector",
    title: "周期股分析框架",
    tags: ["周期", "资源", "化工", "钢铁", "有色", "价格"],
    content:
      "周期股重点看产品价格、供需格局、库存、产能投放、成本曲线和资产负债表。周期低点的低 PE 可能是假低估，周期高点的高利润不可简单年化。"
  },
  {
    id: "bank-sector",
    title: "银行股分析框架",
    tags: ["银行", "PB", "息差", "不良率", "拨备", "资本充足率"],
    content:
      "银行股主要看 PB、净息差、不良率、拨备覆盖率、资本充足率、资产质量和贷款结构。利润增长之外，资产质量和拨备是否充分更关键。"
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

export function retrieveFundamentalKnowledge(query, limit = 6) {
  const ranked = CHUNKS.map((chunk) => ({ ...chunk, score: scoreChunk(chunk, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.every((chunk) => chunk.score === 0)) {
    return CHUNKS.slice(0, limit);
  }
  return ranked;
}

export function fundamentalKnowledgeToPrompt(chunks) {
  return chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.title}\n${chunk.content}`)
    .join("\n\n");
}
