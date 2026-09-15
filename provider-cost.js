const USD_MICROS_PER_USD = 1_000_000n;
const TOKENS_PER_MILLION = 1_000_000n;

// Governed public list-price snapshot used only for cost-to-serve evidence.
// This module never influences statistical computation or model output.
const OPENAI_PRICE_BOOK = Object.freeze({
  "gpt-4o-mini": Object.freeze({
    version: "openai-list-price-gpt-4o-mini-2026-09-15",
    inputUsdPerMillion: "0.15",
    cachedInputUsdPerMillion: "0.075",
    outputUsdPerMillion: "0.60",
    inputUsdMicrosPerMillion: 150_000n,
    cachedInputUsdMicrosPerMillion: 75_000n,
    outputUsdMicrosPerMillion: 600_000n,
  }),
});

function requireTokenCount(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer token count`);
  }
  return value;
}

function ceilDiv(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

export function extractOpenAIUsage(payload) {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    throw new Error("OpenAI response did not contain governed usage metadata");
  }

  const inputTokens = requireTokenCount("input_tokens", usage.input_tokens);
  const outputTokens = requireTokenCount("output_tokens", usage.output_tokens);
  const cachedTokens = requireTokenCount(
    "cached_tokens",
    usage.input_tokens_details?.cached_tokens ?? 0,
  );
  if (cachedTokens > inputTokens) {
    throw new Error("OpenAI cached token count exceeds total input tokens");
  }

  const totalTokens = usage.total_tokens;
  if (totalTokens !== undefined) {
    requireTokenCount("total_tokens", totalTokens);
    if (totalTokens !== inputTokens + outputTokens) {
      throw new Error("OpenAI total token count does not reconcile");
    }
  }

  return Object.freeze({
    inputTokens,
    cachedInputTokens: cachedTokens,
    uncachedInputTokens: inputTokens - cachedTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  });
}

export function priceOpenAIUsage(model, usage) {
  const normalizedModel = String(model || "").trim();
  const price = OPENAI_PRICE_BOOK[normalizedModel];
  if (!price) {
    throw new Error(`No governed OpenAI price book exists for model '${normalizedModel || "unknown"}'`);
  }

  const normalizedUsage = {
    inputTokens: requireTokenCount("inputTokens", usage?.inputTokens),
    cachedInputTokens: requireTokenCount("cachedInputTokens", usage?.cachedInputTokens),
    uncachedInputTokens: requireTokenCount("uncachedInputTokens", usage?.uncachedInputTokens),
    outputTokens: requireTokenCount("outputTokens", usage?.outputTokens),
    totalTokens: requireTokenCount("totalTokens", usage?.totalTokens),
  };
  if (normalizedUsage.cachedInputTokens + normalizedUsage.uncachedInputTokens !== normalizedUsage.inputTokens) {
    throw new Error("OpenAI input token components do not reconcile");
  }
  if (normalizedUsage.inputTokens + normalizedUsage.outputTokens !== normalizedUsage.totalTokens) {
    throw new Error("OpenAI total token components do not reconcile");
  }

  const exactMicroNumerator =
    BigInt(normalizedUsage.uncachedInputTokens) * price.inputUsdMicrosPerMillion +
    BigInt(normalizedUsage.cachedInputTokens) * price.cachedInputUsdMicrosPerMillion +
    BigInt(normalizedUsage.outputTokens) * price.outputUsdMicrosPerMillion;
  const estimatedCostUsdMicros = ceilDiv(exactMicroNumerator, TOKENS_PER_MILLION);
  if (estimatedCostUsdMicros > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("OpenAI priced cost exceeds the supported integer range");
  }

  return Object.freeze({
    provider: "openai",
    model: normalizedModel,
    pricingSourceVersion: price.version,
    pricingBasis: Object.freeze({
      inputUsdPerMillion: price.inputUsdPerMillion,
      cachedInputUsdPerMillion: price.cachedInputUsdPerMillion,
      outputUsdPerMillion: price.outputUsdPerMillion,
    }),
    usage: Object.freeze(normalizedUsage),
    estimatedCostUsdMicros: Number(estimatedCostUsdMicros),
    currency: "USD",
    roundingMode: "ceiling-to-usd-micro",
    numericPurpose: "commercial-cost-evidence-only",
  });
}

export function costOpenAIResponse(model, payload) {
  return priceOpenAIUsage(model, extractOpenAIUsage(payload));
}

export const PROVIDER_COST_CONSTANTS = Object.freeze({
  USD_MICROS_PER_USD: Number(USD_MICROS_PER_USD),
  TOKENS_PER_MILLION: Number(TOKENS_PER_MILLION),
});
