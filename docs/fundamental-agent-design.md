# Fundamental Agent Design

This document defines what the fundamental-analysis agent should do, how it should reason, and what it should return to the master controller.

## Goal

The fundamental agent turns company disclosures, market valuation data, and investor-relations evidence into a structured research memo. It is not responsible for final trading advice. It provides one input block for the master controller.

## Inputs

- `fundamental_input.profile`: industry, main business, business layout, competitive edge, growth driver, risks.
- `fundamental_input.metrics`: PE, PB, price, turnover, market value, amount, and later financial ratios.
- `fundamental_input.financial_series`: quarterly and annual revenue, net profit, margins, ROE, debt, operating cash flow.
- `fundamental_input.evidence`: source-bound text chunks from Eastmoney, CNINFO, and company IR pages.
- `fundamental_input.source_summary`: counts and freshness of evidence sources.

## Analysis Modules

1. Business quality
   - What the company sells, who buys it, whether the revenue structure is understandable.
   - Whether the business has pricing power, recurring demand, policy support, or cyclicality.

2. Growth quality
   - Revenue and profit trend.
   - Whether growth comes from the core business, new layout, M&A, price hikes, capacity expansion, or one-off gains.
   - Whether new business layout is still narrative-only or already showing orders, revenue, margins, or capacity.

3. Financial quality
   - ROE, gross margin, net margin, debt ratio, cash flow, receivables, inventory pressure.
   - Whether accounting profit is supported by operating cash flow.

4. Valuation
   - PE, PB, PS, PEG if available.
   - Relative valuation versus own history and industry peers. This is not implemented yet because peer data is not wired.

5. Moat and competition
   - Product differentiation, brand, license, technology, channel, cost advantage, switching cost, scale advantage.
   - Evidence should come from annual reports, investor relations, or announcements.

6. Catalyst and business layout
   - New capacity, new products, policy, orders, industry cycle, earnings inflection.
   - For growth stocks, this section is critical and should distinguish facts from management narrative.

7. Risk register
   - Demand slowdown, margin compression, regulatory risk, debt, impairment, lawsuit, related-party transactions, pledge, dilution.

8. Missing data
   - The agent must explicitly list missing information instead of inventing.

## Output Contract

The agent returns JSON first, with these fields:

```json
{
  "executive_summary": "",
  "business_quality": { "view": "", "evidence": [], "score": 0 },
  "growth_quality": { "view": "", "evidence": [], "score": 0 },
  "financial_quality": { "view": "", "evidence": [], "score": 0 },
  "valuation_read": { "view": "", "metrics_used": [], "score": 0 },
  "moat_and_competition": { "view": "", "evidence": [], "score": 0 },
  "catalyst_and_layout": { "view": "", "evidence": [], "score": 0 },
  "framework_signals": {
    "piotroski_f_score_view": "",
    "altman_z_score_view": "",
    "beneish_m_score_view": ""
  },
  "red_flags": [{ "flag": "", "severity": "medium", "evidence": "" }],
  "devils_advocate": {
    "bear_case": "",
    "invalidation_evidence": []
  },
  "risk_register": [{ "risk": "", "severity": "medium", "evidence": "" }],
  "missing_data": [],
  "investment_signal_block": {
    "signal": "neutral",
    "confidence": "low",
    "horizon": "medium",
    "score": 0,
    "action": "wait",
    "conviction": "weak"
  }
}
```

The master controller can read `investment_signal_block` directly and blend it with technical, sentiment, and market-flow agents.

## Skill And RAG

The fundamental agent uses two different knowledge layers:

- Skill: `app/lib/fundamentalSkill.js`
  - Defines the agent's operating procedure.
  - Forces the model to identify business type, separate facts from narrative, inspect growth/quality/valuation/risk, downgrade confidence when data is thin, and return JSON.

- Methodology RAG: `app/lib/fundamentalKnowledge.js`
  - Provides lightweight framework notes for financial statement analysis, growth quality, profit quality, three-statement analysis, ROE/DuPont, Piotroski F-Score, Altman Z-Score, Beneish M-Score, valuation, DCF sanity checks, growth-stock layout, moat, financial red flags, IR language analysis, devil's advocate checks, risks, and several industry patterns.
  - Retrieval is query-based and uses the user question, symbol, company name, industry, business layout, risks, and evidence titles.

This is separate from the evidence RAG/data layer. Evidence comes from Eastmoney, CNINFO, company IR pages, market quote data, and financial-series collection.

## Current Implementation

- `app/lib/fundamentalSources.js`: collects and classifies evidence from Eastmoney, CNINFO, and IR candidates.
- `app/lib/fundamentalPipeline.js`: builds one `fundamentalInput` package shared by `/api/fundamental` and `/api/chat`.
- `app/lib/fundamentalSkill.js`: skill prompt that defines how the agent should perform fundamental analysis.
- `app/lib/fundamentalKnowledge.js`: small built-in methodology RAG for analysis frameworks.
- `app/lib/fundamentalAgent.js`: runs the LLM sub-agent and parses structured JSON output.
- `app/api/fundamental/route.js`: manual collect/analyze endpoint.
- `app/api/chat/route.js`: master controller can auto-call the fundamental agent when the user asks about valuation, financials, business, growth, risks, or disclosures.

## Open-Source References

- FinRobot: open-source financial LLM agent platform with annual-report style workflows. https://github.com/AI4Finance-Foundation/FinRobot
- FinSight: multi-agent financial deep-research system with data collection, analysis, chart refinement, report drafting, and evidence tracing. https://github.com/RUC-NLPIR/FinSight
- Financial Research Analyst Agent: hierarchical stock-analysis system with specialized agents, RAG, tools, and multiple interfaces. https://github.com/gsaini/financial-research-analyst-agent
- Anthropic financial-data-analyst quickstart: finance tool-use pattern for structured data analysis and report generation. https://github.com/anthropics/anthropic-quickstarts/tree/main/financial-data-analyst

## Next Build Steps

1. Add peer comparison and industry valuation bands.
2. Store evidence chunks locally so repeated questions do not re-fetch every source.
3. Add a confidence score that drops when source count, freshness, or financial fields are weak.
4. Add source citations into the rendered report.
5. Move methodology RAG from in-code chunks to an editable vector/document store.
