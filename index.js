import express from "express";
import fetch from "node-fetch";
import pdfParse from "pdf-parse";

const app = express();
app.use(express.json());

app.post("/ai-review", async (req, res) => {
  try {
    const { submission_id, pdf_url } = req.body;

    // تحميل ملف PDF
    const response = await fetch(pdf_url);
    const buffer = await response.arrayBuffer();

    // استخراج النص
    const data = await pdfParse(Buffer.from(buffer));
    const text = data.text.substring(0, 12000);

    // إرسال إلى OpenAI (API الجديد)
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: `
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
`
      })
    });

    const result = await aiResponse.json();

    res.json({
      submission_id,
      result: result.output[0].content[0].text
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI processing failed" });
  }
});

app.get("/", (req, res) => {
  res.send("SmartInsight AI API is running 🚀");
});

app.listen(3000, () => console.log("Running on port 3000 🚀"));
