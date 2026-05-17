export function buildFundamentalSkillPrompt() {
  return [
    "Fundamental-analysis skill:",
    "1. Identify the company's business type before scoring anything.",
    "2. Separate facts, evidence-backed inference, and unsupported management narrative.",
    "3. Read business quality from main business, revenue drivers, competitive edge, customer demand, and cyclicality.",
    "4. Read growth quality from revenue/profit trend, business layout, capacity, orders, new products, and whether growth is already reflected in financials.",
    "5. Read financial quality from ROE, margins, debt, operating cash flow, receivables, inventory, impairments, and profit consistency.",
    "6. Read valuation from PE/PB/PS/PEG when available, but always pair valuation with growth quality and industry characteristics.",
    "7. Read moat from brand, technology, cost, channel, license, scale, switching cost, or network effects, and require evidence.",
    "8. Run red-flag checks: cash flow mismatch, receivables/inventory pressure, impairment, related-party complexity, high leverage, pledges, lawsuits, and narrative-heavy IR language.",
    "9. Run a devil's advocate pass: name the strongest bearish interpretation and what evidence would invalidate the bullish case.",
    "10. Build a risk register with severity and evidence; never hide missing data.",
    "11. Downgrade confidence when disclosures are thin, financial series is missing, evidence is old, or conclusions depend on unverified future plans.",
    "12. Return structured JSON only, using the required schema."
  ].join("\n");
}
