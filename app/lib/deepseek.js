const DEFAULT_BASE_URL = "https://api.deepseek.com";

export function getDeepSeekConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL,
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL
  };
}

export async function callDeepSeek(messages, options = {}) {
  const config = getDeepSeekConfig();
  const model = options.model || config.model;

  if (!config.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
  if (!model) {
    throw new Error("DEEPSEEK_MODEL is not configured");
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.2
    })
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || `DeepSeek API error ${response.status}`;
    const error = new Error(message);
    error.detail = data;
    error.status = response.status;
    throw error;
  }

  return {
    answer: data?.choices?.[0]?.message?.content || "",
    raw: data
  };
}
