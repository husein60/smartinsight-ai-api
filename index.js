import express from "express";
import fetch from "node-fetch";
import pdfParse from "pdf-parse";

const app = express();
app.use(express.json({ limit: "256kb" }));

const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string" && content.text.trim()) return content.text.trim();
    }
  }
  throw new Error("OpenAI response did not contain text output");
}

async function callOpenAI(input) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned ${response.status}`);
  return extractOutputText(payload);
}

function validateStructuredAnalysis(value, depth = 0) {
  if (depth > 8) throw new Error("Analysis payload is too deeply nested");
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 60) throw new Error("Analysis payload contains an oversized array");
    value.forEach((item) => validateStructuredAnalysis(item, depth + 1));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/^(rawData|dataset|records|observations|sourceRows)$/i.test(key)) {
        throw new Error(`Raw dataset field '${key}' is not accepted by the interpretation endpoint`);
      }
      validateStructuredAnalysis(item, depth + 1);
    }
    return;
  }
  throw new Error("Unsupported value in analysis payload");
}

function parseQualitativeInterpretation(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  const required = ["summary", "inference", "effect", "assumptions", "limitations", "nextSteps"];
  for (const key of required) {
    if (!(key in parsed)) throw new Error(`Interpretation is missing '${key}'`);
  }
  const serialized = JSON.stringify(parsed);
  if (/\d/.test(serialized)) {
    throw new Error("AI interpretation attempted to introduce numeric text");
  }
  if (!Array.isArray(parsed.nextSteps) || parsed.nextSteps.length > 8) {
    throw new Error("Interpretation nextSteps must be a short array");
  }
  return parsed;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "smartinsight-ai-api", capabilities: ["manuscript-review", "statistical-interpretation"] });
});

app.post("/interpret-statistics", async (req, res) => {
  try {
    const analysis = req.body?.analysis;
    if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
      return res.status(400).json({ error: "A structured statistical analysis object is required" });
    }
    validateStructuredAnalysis(analysis);
    const serialized = JSON.stringify(analysis);
    if (serialized.length > 50000) {
      return res.status(413).json({ error: "Structured statistical result exceeds the interpretation limit" });
    }

    const prompt = `You are SmartInsight Statistical Interpretation Assistant.\n\nYou receive ONLY a structured, already-computed statistical result. The deterministic analytics engine is the sole authority for all numerical values.\n\nYour job is qualitative interpretation only. You MUST NOT calculate, change, restate, round, infer, or invent any number. Do not write digits anywhere in your output. Do not give clinical, regulatory, editorial, or causal conclusions beyond what the supplied analysis supports.\n\nReturn ONLY valid JSON with exactly these keys:\n{\n  "summary": "plain-language qualitative summary with no digits",\n  "inference": "what the statistical evidence qualitatively suggests, without numeric restatement",\n  "effect": "qualitative interpretation of the supplied effect size or model effect, or 'not available'",\n  "assumptions": "important assumption or diagnostic considerations from the supplied result",\n  "limitations": "important limitations and cautions",\n  "nextSteps": ["short qualitative next step", "another next step"]\n}\n\nDo not include markdown. Do not include digits. Do not introduce facts not present in the structured result.\n\nSTRUCTURED RESULT:\n${serialized}`;

    let interpretation;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await callOpenAI(attempt === 0 ? prompt : `${prompt}\n\nPrevious output failed validation. Return valid JSON only and absolutely no digits.`);
        interpretation = parseQualitativeInterpretation(text);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!interpretation) throw lastError || new Error("Interpretation validation failed");

    res.json({
      mode: "qualitative-only",
      numericAuthority: "smartinsight-research-analytics-deterministic-engine",
      aiGeneratedStatistics: false,
      interpretation,
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Statistical interpretation failed validation" });
  }
});

app.post("/ai-review", async (req, res) => {
  try {
    const { submission_id, pdf_url } = req.body;
    const response = await fetch(pdf_url);
    if (!response.ok) throw new Error(`PDF download returned ${response.status}`);
    const buffer = await response.arrayBuffer();
    const data = await pdfParse(Buffer.from(buffer));
    const text = data.text.substring(0, 12000);

    const result = await callOpenAI(`
You are SmartInsight AI Reviewer & Editor Assistant.

Your role is NOT only to evaluate, but also to IMPROVE the manuscript.

Perform a full professional engineering journal review:

Return clearly structured output:

1. SII Score (0–100)
2. Editorial Decision (Accept / Minor Revision / Major Revision / Reject)
3. Strengths
4. Weaknesses
5. Missing Sections
6. Technical Gaps
7. Language & Clarity Issues
8. Improvement Suggestions
9. Rewritten Abstract (improved version)
10. Key Recommendations for Publication Readiness

Be strict, analytical, and practical.

TEXT:
${text}
`);

    res.json({ submission_id, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI processing failed" });
  }
});

app.get("/", (_req, res) => {
  res.send("SmartInsight AI API is running 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
