// openaiClient.js
import "dotenv/config";
import OpenAI from "openai";
import { createHash } from "crypto";

const USE = (process.env.USE_OPENAI || "true").toLowerCase() === "true";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const AGENT_VERSION = process.env.AGENT_VERSION || "v1";

function sha256Hex(str) {
  return "0x" + createHash("sha256").update(String(str), "utf8").digest("hex");
}

let client = null;
if (USE && process.env.OPENAI_API_KEY) {
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function summarizeText(text) {
  const prompt = `You extract metadata from a PDF's text. 
Return *valid JSON* with keys: 
- title (string)
- summary (<=120 words, string)
- doc_type (string)
- date_iso (YYYY-MM-DD or empty string)
- parties (array of strings)
- tags (array of strings)
- extract_confidence (0..1 number summarizing your overall extraction confidence)

If unknown, use empty strings/arrays. No extra commentary.`;

  // Default/fallback content if no OpenAI
  const stub = {
    title: "Untitled",
    summary: text.slice(0, 500),
    doc_type: "document",
    date_iso: new Date().toISOString().slice(0, 10),
    parties: [],
    tags: [],
    extract_confidence: 0.5
  };

  let base = stub;
  if (USE && client) {
    try {
      const resp = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You output only strict JSON for metadata extraction." },
          { role: "user", content: `${prompt}\n\nPDF_TEXT:\n${text.slice(0, 8000)}` }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });
      const content = resp.choices?.[0]?.message?.content || "{}";
      base = JSON.parse(content);
    } catch {
      // fall back to stub silently
    }
  }

  // attach reproducibility fields here; server will add text hash & pages
  return {
    ...base,
    extract_confidence:
      typeof base.extract_confidence === "number"
        ? (base.extract_confidence).toFixed(3)
        : "0.500",
    model: MODEL,
    model_hash: sha256Hex(MODEL),
    prompt_hash: sha256Hex(prompt),
    agent_version: AGENT_VERSION
  };
}
