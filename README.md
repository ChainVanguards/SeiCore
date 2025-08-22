# SeiCore — AI notarization on Sei EVM (testnet)

Turn a **PDF → on-chain proof** in seconds.  
AI extracts deterministic metadata; we canonicalize + hash; **Sei EVM** stores reverse lookups for instant verification.

- Fast UX (Sei finality)
- Reproducible AI (model/prompt/version/text digests)
- Verify-first (skip mint/AI if already on chain)

---

## Stack
- **Frontend:** React + Vite, ethers.js
- **Agent:** Node/Express, `pdfjs-dist`, OpenAI
- **Chain:** Sei EVM testnet (chainId `1328` / hex `0x530`)
- **Contract:** `NotaryNFT` (ERC-721 with reverse lookups)

---

## Quick start

### Environment 

`agent/.env`
```env
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173

USE_OPENAI=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AGENT_VERSION=v1.0.0

RPC_URL=https://evm-rpc-testnet.sei-apis.com
CONTRACT=0x...   # fill after deploy
```


`frontend/.env`
```
VITE_AGENT_URL=http://localhost:3001
VITE_CONTRACT=0x...
VITE_RPC_URL=https://evm-rpc-testnet.sei-apis.com
VITE_CHAIN_ID=0x530
```

## 2) Run
### agent
- cd agent && npm i && npm run start  # http://localhost:3001/health
### frontend
- cd ../frontend && npm i && npm run dev  # http://localhost:5173

## Contract (Remix, Sei testnet)
- Open Remix, paste NotaryNFT.sol, connect wallet to Sei EVM testnet.
- Deploy with name SeiCore, symbol SEI.
- Put the address into agent/.env as CONTRACT and frontend/.env as VITE_CONTRACT.
- Restart agent, reload frontend.

### Interface the app uses:
- mint(bytes32 docHash, bytes32 metaHash, bool isPublic, string tokenURI)
- getTokenByFileHash(bytes32) → uint256
- getTokenByMetaHash(bytes32) → uint256

## How it works
- Verify-first: upload file → /verify/file → on-chain reverse lookup by docHash.
- Analyze: if not found → agent extracts text (pdf.js) → OpenAI summarizes → normalize → canonicalize JSON.
- Hashes: docHash = keccak256(file bytes) & metaHash = keccak256(canonical JSON)
- Mint: mint(docHash, metaHash, isPublic, tokenURI) (optional IPFS).
- Verify: re-upload file or paste metadata JSON (we recompute and lookup).

## Reproducibility fields (added to metadata)
- model, model_hash, prompt_hash, agent_version, extract_confidence, pdf_text_sha256, pages_processed.
- These are included before canonicalization and thus bound to metaHash.

## Agent API (brief)
- GET /health → diagnostics
- POST /analyze (multipart: file) → { docHash, metaHash, metadata }
- POST /verify/file (multipart: file) → { docHash, chain:{enabled, tokenId} }
- POST /verify/meta (JSON) → { metaHash, chain:{enabled, tokenId} }

## Troubleshooting (quick)
- 500 on /analyze → ensure pdfExtract passes Uint8Array and disableWorker: true.
- Verify always 0 → mismatch file/contract/network; restart agent after editing .env.
- CORS → FRONTEND_ORIGIN must match the app URL.

## Roadmap (post-hackathon)
- IPFS pinning (auto tokenURI), OCR fallback, gasless/bulk flows, watcher agent (auto-notarize), E2EE private metadata.

## License
- MIT
