import assert from "node:assert/strict";
import test from "node:test";

import {
  costOpenAIResponse,
  extractOpenAIUsage,
  priceOpenAIUsage,
} from "../provider-cost.js";

function responseUsage(overrides = {}) {
  return {
    usage: {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      total_tokens: 2_000_000,
      input_tokens_details: { cached_tokens: 0 },
      ...overrides,
    },
  };
}

test("extracts and reconciles Responses API token usage", () => {
  const usage = extractOpenAIUsage(responseUsage({
    input_tokens: 1000,
    output_tokens: 200,
    total_tokens: 1200,
    input_tokens_details: { cached_tokens: 250 },
  }));
  assert.deepEqual(usage, {
    inputTokens: 1000,
    cachedInputTokens: 250,
    uncachedInputTokens: 750,
    outputTokens: 200,
    totalTokens: 1200,
  });
});

test("prices gpt-4o-mini public list rates using integer USD micros", () => {
  const priced = costOpenAIResponse("gpt-4o-mini", responseUsage());
  assert.equal(priced.estimatedCostUsdMicros, 750_000);
  assert.equal(priced.pricingBasis.inputUsdPerMillion, "0.15");
  assert.equal(priced.pricingBasis.cachedInputUsdPerMillion, "0.075");
  assert.equal(priced.pricingBasis.outputUsdPerMillion, "0.60");
  assert.equal(priced.numericPurpose, "commercial-cost-evidence-only");
});

test("cached input is priced at the governed cached-input rate", () => {
  const priced = costOpenAIResponse("gpt-4o-mini", responseUsage({
    input_tokens: 1_000_000,
    output_tokens: 0,
    total_tokens: 1_000_000,
    input_tokens_details: { cached_tokens: 1_000_000 },
  }));
  assert.equal(priced.estimatedCostUsdMicros, 75_000);
});

test("sub-micro exact costs round conservatively upward once per provider call", () => {
  const priced = priceOpenAIUsage("gpt-4o-mini", {
    inputTokens: 1,
    cachedInputTokens: 0,
    uncachedInputTokens: 1,
    outputTokens: 0,
    totalTokens: 1,
  });
  assert.equal(priced.estimatedCostUsdMicros, 1);
  assert.equal(priced.roundingMode, "ceiling-to-usd-micro");
});

test("fails closed for unsupported model instead of silently applying wrong pricing", () => {
  const usage = extractOpenAIUsage(responseUsage());
  assert.throws(() => priceOpenAIUsage("gpt-unknown", usage), /No governed OpenAI price book/);
});

test("fails closed for missing, fractional, negative, or inconsistent usage", () => {
  assert.throws(() => extractOpenAIUsage({}), /usage metadata/);
  assert.throws(() => extractOpenAIUsage(responseUsage({ input_tokens: 1.5 })), /safe integer/);
  assert.throws(() => extractOpenAIUsage(responseUsage({ output_tokens: -1 })), /safe integer/);
  assert.throws(
    () => extractOpenAIUsage(responseUsage({ input_tokens: 10, output_tokens: 2, total_tokens: 12, input_tokens_details: { cached_tokens: 11 } })),
    /cached token count/,
  );
  assert.throws(
    () => extractOpenAIUsage(responseUsage({ input_tokens: 10, output_tokens: 2, total_tokens: 99 })),
    /does not reconcile/,
  );
});
