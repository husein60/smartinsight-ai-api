import assert from "node:assert/strict";
import test from "node:test";

import {
  parseResearchCopilotResponse,
  validateResearchCopilotContext,
} from "../index.js";

const SOURCE_SHA = "a".repeat(64);

function governedContext() {
  return {
    policyVersion: "sira-research-copilot-v1",
    mode: "qualitative-only",
    numericAuthority: "smartinsight-research-analytics-deterministic-engine",
    aiGeneratedStatistics: false,
    providerMayCalculateStatistics: false,
    providerMayExecuteAnalyses: false,
    sourceResultSha256: SOURCE_SHA,
    task: "explain-result",
    taskInstruction: "Explain the validated result qualitatively.",
    researchQuestion: "What is the research meaning of this validated result?",
    studyContext: { design: "Evidence synthesis" },
    validatedResult: {
      analysis: "generic-meta-analysis",
      method: "random-effects-dl",
      deterministic: true,
      aiGeneratedStatistics: false,
      pooledEffect: 0.42,
    },
    responseContract: {
      requiredFields: ["answer", "assumptions", "limitations", "nextSteps"],
      numbersAllowedInResponse: false,
      newStatisticalClaimsAllowed: false,
      causalClaimsAllowed: false,
      clinicalDecisionSupportAllowed: false,
    },
  };
}

function qualitativeResponse() {
  return JSON.stringify({
    answer: "The validated result supports a consistent qualitative interpretation within the supplied evidence.",
    assumptions: "Interpretation depends on the stated model assumptions and study comparability.",
    limitations: "The validated result should be discussed within the supplied study design and does not establish causality.",
    nextSteps: ["Review study comparability and discuss the validated limitations."],
  });
}

test("accepts a governed deterministic research-copilot context", () => {
  const context = governedContext();
  assert.equal(validateResearchCopilotContext(context), context);
});

test("rejects contexts that broaden provider statistical authority", () => {
  const context = governedContext();
  context.providerMayCalculateStatistics = true;
  assert.throws(() => validateResearchCopilotContext(context), /provider authority/);
});

test("rejects raw dataset fields inside the validated-result envelope", () => {
  const context = governedContext();
  context.validatedResult.rawData = [{ value: 1 }];
  assert.throws(() => validateResearchCopilotContext(context), /Raw dataset field/);
});

test("rejects malformed or unsupported source-result fingerprints and tasks", () => {
  const badSha = governedContext();
  badSha.sourceResultSha256 = "not-a-hash";
  assert.throws(() => validateResearchCopilotContext(badSha), /fingerprint/);

  const badTask = governedContext();
  badTask.task = "auto-analyze";
  assert.throws(() => validateResearchCopilotContext(badTask), /Unsupported/);
});

test("wraps a qualitative provider response with the deterministic numeric authority", () => {
  const response = parseResearchCopilotResponse(qualitativeResponse(), SOURCE_SHA);
  assert.equal(response.mode, "qualitative-only");
  assert.equal(response.numericAuthority, "smartinsight-research-analytics-deterministic-engine");
  assert.equal(response.aiGeneratedStatistics, false);
  assert.equal(response.sourceResultSha256, SOURCE_SHA);
  assert.deepEqual(Object.keys(response.response).sort(), ["answer", "assumptions", "limitations", "nextSteps"].sort());
});

test("rejects numeric provider text", () => {
  const payload = JSON.parse(qualitativeResponse());
  payload.answer = "The effect is 0.42 and should be emphasized.";
  assert.throws(() => parseResearchCopilotResponse(JSON.stringify(payload), SOURCE_SHA), /numeric text/);
});

test("rejects provider claims of new statistical computation", () => {
  const payload = JSON.parse(qualitativeResponse());
  payload.answer = "I calculated a new effect and it points in the same direction.";
  assert.throws(() => parseResearchCopilotResponse(JSON.stringify(payload), SOURCE_SHA), /prohibited statistical computation/);
});

test("rejects clinical decision support and causal proof claims", () => {
  const clinical = JSON.parse(qualitativeResponse());
  clinical.answer = "I diagnose the patient from the result.";
  assert.throws(() => parseResearchCopilotResponse(JSON.stringify(clinical), SOURCE_SHA), /clinical decision-support/);

  const causal = JSON.parse(qualitativeResponse());
  causal.answer = "This proves that the exposure causes the outcome.";
  assert.throws(() => parseResearchCopilotResponse(JSON.stringify(causal), SOURCE_SHA), /causal-claim/);
});

test("rejects extra or missing response fields", () => {
  const payload = JSON.parse(qualitativeResponse());
  payload.confidence = "high";
  assert.throws(() => parseResearchCopilotResponse(JSON.stringify(payload), SOURCE_SHA), /response fields/);
});
