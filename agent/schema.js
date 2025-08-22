// schema.js

const S = (v) => (v === undefined || v === null ? "" : String(v)).trim();

export function normalizeMetadata(input) {
  return {
    // core
    title: S(input.title),
    summary: S(input.summary),
    doc_type: S(input.doc_type),
    date_iso: S(input.date_iso),
    parties: Array.isArray(input.parties) ? input.parties.map(String) : [],
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],

    // reproducibility
    model: S(input.model),
    model_hash: S(input.model_hash),
    prompt_hash: S(input.prompt_hash),
    agent_version: S(input.agent_version),
    extract_confidence: S(input.extract_confidence), // "0.873"
    pdf_text_sha256: S(input.pdf_text_sha256),       // sha256 of extracted text
    pages_processed: S(input.pages_processed)        // e.g., "4"
  };
}

// RFC-8785-ish canonicalizer: keys sorted, arrays kept in order, no extra whitespace
export function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}
