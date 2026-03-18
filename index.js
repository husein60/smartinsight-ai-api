import express from "express";
import fetch from "node-fetch";
import pdfParse from "pdf-parse";

const app = express();
app.use(express.json());

app.post("/ai-review", async (req, res) => {
  try {
    const { submission_id, pdf_url } = req.body;

    const response = await fetch(pdf_url);
    const buffer = await response.arrayBuffer();

    const data = await pdfParse(Buffer.from(buffer));
    const text = data.text.substring(0, 12000);

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an engineering journal reviewer."
          },
          {
            role: "user",
            content: `
Analyze this manuscript and return:
SII score, recommendation, strengths, weaknesses, missing sections, suggestions.

TEXT:
${text}
`
          }
        ]
      })
    });

    const result = await aiResponse.json();

    res.json({
      submission_id,
      result: result.choices[0].message.content
    });

  } catch (error) {
    res.status(500).json({ error: "AI processing failed" });
  }
});

app.get("/", (req, res) => {
  res.send("SmartInsight AI API is running 🚀");
});

app.listen(3000, () => console.log("Running"));
