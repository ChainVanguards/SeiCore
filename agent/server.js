// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import keccak from "keccak";
import { createHash } from "crypto";

import { extractPdfText } from "./pdfExtract.js";      // returns { text, pagesProcessed }
import { summarizeText } from "./openaiClient.js";     // adds model, model_hash, prompt_hash, agent_version, extract_confidence
import { normalizeMetadata, canonicalize } from "./schema.js";

const PORT = Number(process.env.PORT || 3001);
const ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const MAX_UPLOAD_MB = 10;

// ---------- app ----------
const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

// ---------- utils ----------
function keccakHex(buf) {
  return "0x" + keccak("keccak256").update(buf).digest("hex");
}
function sha256HexStr(str) {
  return "0x" + createHash("sha256").update(String(str), "utf8").digest("hex");
}

// ---------- optional chain access ----------
const hasChain = !!process.env.RPC_URL && !!process.env.CONTRACT;

const ABI = [
  {
    inputs: [{ internalType: "bytes32", name: "docHash", type: "bytes32" }],
    name: "getTokenByFileHash",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "bytes32", name: "metaHash", type: "bytes32" }],
    name: "getTokenByMetaHash",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

async function readContract() {
  if (!hasChain) return null;
  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  return new ethers.Contract(process.env.CONTRACT, ABI, provider);
}

// ---------- routes ----------
app.get("/health", (req, res) => {
  const useAI = (process.env.USE_OPENAI || "true").toLowerCase() === "true";
  res.json({
    ok: true,
    port: PORT,
    use_openai: useAI,
    has_api_key: Boolean(process.env.OPENAI_API_KEY),
    has_chain: hasChain,
    contract: process.env.CONTRACT || null,
    rpc: process.env.RPC_URL || null,
    cors_origin: ORIGIN,
    agent_version: process.env.AGENT_VERSION || "v1"
  });
});

// Analyze: extract -> summarize -> enrich reproducibility -> canonicalize -> hash
app.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const fileBuf = req.file.buffer;
    const docHash = keccakHex(fileBuf);

    const { text, pagesProcessed } = await extractPdfText(fileBuf);
    if (!text) {
      return res
        .status(422)
        .json({ error: "No text found in PDF (OCR not enabled in this build)" });
    }

    const textSha = sha256HexStr(text);
    const base = await summarizeText(text); // adds model/prompt hashes, agent_version, extract_confidence

    const merged = {
      ...base,
      pdf_text_sha256: textSha,
      pages_processed: String(pagesProcessed)
    };

    const metadata = normalizeMetadata(merged);
    const canonical = canonicalize(metadata);
    const metaHash = keccakHex(Buffer.from(canonical, "utf8"));

    res.json({
      ok: true,
      bytes: req.file.size,
      docHash,
      metaHash,
      metadata,
      canonical_len: canonical.length
    });
  } catch (e) {
    console.error("[/analyze]", e);
    res.status(500).json({ error: "internal_error", detail: String(e?.message || e) });
  }
});

// Verify by file: recompute docHash -> on-chain reverse lookup (if configured)
app.post("/verify/file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const docHash = keccakHex(req.file.buffer);
    let chain = { enabled: false };

    if (hasChain) {
      try {
        const c = await readContract();
        const tokenId = await c.getTokenByFileHash(docHash);
        chain = { enabled: true, tokenId: Number(tokenId) || 0 };
      } catch (err) {
        chain = { enabled: true, error: String(err?.message || err) };
      }
    }

    res.json({ ok: true, docHash, chain });
  } catch (e) {
    console.error("[/verify/file]", e);
    res.status(500).json({ error: "internal_error", detail: String(e?.message || e) });
  }
});

// Verify by metadata JSON: canonicalize -> metaHash -> on-chain reverse lookup (if configured)
app.post("/verify/meta", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "JSON body required" });
    }

    const metadata = normalizeMetadata(req.body);
    const canonical = canonicalize(metadata);
    const metaHash = keccakHex(Buffer.from(canonical, "utf8"));

    let chain = { enabled: false };
    if (hasChain) {
      try {
        const c = await readContract();
        const tokenId = await c.getTokenByMetaHash(metaHash);
        chain = { enabled: true, tokenId: Number(tokenId) || 0 };
      } catch (err) {
        chain = { enabled: true, error: String(err?.message || err) };
      }
    }

    res.json({ ok: true, metaHash, chain });
  } catch (e) {
    console.error("[/verify/meta]", e);
    res.status(500).json({ error: "internal_error", detail: String(e?.message || e) });
  }
});

// ---------- start ----------
app.listen(PORT, () => {
  console.log(`[agent] listening on http://localhost:${PORT}`);
  console.log(`[agent] CORS origin: ${ORIGIN}`);
  if (hasChain) {
    console.log(`[agent] Chain enabled → contract ${process.env.CONTRACT}`);
  } else {
    console.log("[agent] Chain disabled (RPC_URL or CONTRACT missing)");
  }
});
