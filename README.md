SeiCore — Real-time Document Notarization (AI × Sei EVM)

SeiCore turns any PDF into an immutable, verifiable proof in seconds.
Upload → AI extracts structured metadata → we canonicalize + hash → mint proof on Sei EVM testnet.
Verification is a re-upload or metadata paste. Deterministic, cheap, fast.

⚡️ Fast UX: Sei finality makes mint/lookup feel web-speed

🧪 Reproducible AI: model/prompt/agent/version/text digests are hashed into the proof

✅ Verify-first: we check the chain before running AI or minting (saves time & fees)

Table of Contents

Architecture

Repo Structure

Prerequisites

Setup

Environment Variables

Install & Run

Deploy Contract (Sei Testnet)

Using the App

Agent API

Reproducibility Fields

Why Sei + AI

Troubleshooting

Roadmap

Security

License

Acknowledgements

Architecture
PDF (bytes) ──► Agent (/analyze)
                 ├─ extract text (pdf.js)
                 ├─ OpenAI summarize → JSON
                 ├─ normalize + canonicalize JSON
                 ├─ docHash = keccak256(file bytes)
                 └─ metaHash = keccak256(canonical JSON)
                                      │
Frontend (React/Vite) ◄───────────────┘
   ├─ Verify-first (calls /verify/file)
   ├─ Show AI metadata + hashes
   └─ Mint via NotaryNFT on Sei EVM (ethers.js)

Smart Contract (NotaryNFT.sol)
   - mint(docHash, metaHash, isPublic, tokenURI)
   - getTokenByFileHash(bytes32) → tokenId
   - getTokenByMetaHash(bytes32) → tokenId


Determinism: metadata JSON is canonicalized (sorted keys, stable formatting) before hashing, so the same content yields the same metaHash.

Repo Structure
SeiCore/
├─ agent/            # Node.js/Express AI Agent
│  ├─ server.js
│  ├─ pdfExtract.js
│  ├─ openaiClient.js
│  ├─ schema.js
│  └─ .env           # not committed
├─ frontend/         # React/Vite app
│  ├─ src/App.jsx
│  ├─ src/styles.css
│  └─ .env           # not committed
└─ contracts/        # NotaryNFT.sol + scripts (optional if you use Remix)

Prerequisites

Node.js 18+ (or 20/22)

A wallet (Compass / MetaMask) on Sei EVM testnet (chainId 1328, hex 0x530)

OpenAI API Key (or set USE_OPENAI=false to run without it)

Setup
Environment Variables

agent/.env

PORT=3001
FRONTEND_ORIGIN=http://localhost:5173

# OpenAI
USE_OPENAI=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AGENT_VERSION=v1.0.0

# Chain (Sei testnet)
RPC_URL=https://evm-rpc-testnet.sei-apis.com
CONTRACT=0x...   # fill after deploying NotaryNFT


frontend/.env

VITE_AGENT_URL=http://localhost:3001
VITE_CONTRACT=0x...               # same as above
VITE_RPC_URL=https://evm-rpc-testnet.sei-apis.com
VITE_CHAIN_ID=0x530               # 1328 in hex


Do not commit .env files. A root .gitignore is included to prevent leakage.

Install & Run
# Agent
cd agent
npm i
npm run start
# → http://localhost:3001/health should return JSON

# Frontend (new terminal)
cd ../frontend
npm i
npm run dev
# → open http://localhost:5173

Deploy Contract (Sei Testnet)

You can use Remix (simplest) or Hardhat.

Remix

Open Remix → create NotaryNFT.sol with your contract implementation.

Connect wallet to Sei EVM testnet (chainId 1328).

Deploy NotaryNFT with name=SeiCore, symbol=SEI.

Copy the deployed address → put it into both agent/.env and frontend/.env as CONTRACT / VITE_CONTRACT.

Restart the agent and reload the frontend.

Contract interface used by the app:

mint(bytes32 docHash, bytes32 metaHash, bool isPublic, string tokenURI)

getTokenByFileHash(bytes32) → uint256

getTokenByMetaHash(bytes32) → uint256

Using the App

Connect Wallet (Sei testnet; the app offers one-click add/switch).

Upload PDF and click Verify first → Analyze.

If on-chain already → shows Verified (skip AI).

If not → runs AI, shows metadata + docHash/metaHash.

(Optional) Public: set tokenURI (e.g., ipfs://CID) and enable Make public.

Mint NFT → link to Seitrace appears.

Verify: upload the same file or paste metadata JSON → instant on-chain check.

Agent API

Base URL: http://localhost:3001

GET /health → diagnostics (has_chain, contract, rpc, etc.)

POST /analyze → multipart form:

file: PDF

Response:

{
  "ok": true,
  "bytes": 12345,
  "docHash": "0x...",
  "metaHash": "0x...",
  "metadata": { "...": "..." },
  "canonical_len": 1234
}


POST /verify/file → multipart form:

file: PDF

Response: { ok, docHash, chain: { enabled, tokenId? } }

POST /verify/meta → JSON body:

metadata: arbitrary object (the agent normalizes/canonicalizes)

Response: { ok, metaHash, chain: { enabled, tokenId? } }

Hashing

docHash = keccak256(file bytes)

metaHash = keccak256(canonicalized metadata JSON)

Reproducibility Fields

The agent injects these into metadata before canonicalization:

Field	Description
model	OpenAI model used (e.g., gpt-4o-mini)
model_hash	sha256(model)
prompt_hash	sha256(extraction prompt)
agent_version	Version string from AGENT_VERSION
extract_confidence	Overall extraction confidence (string, e.g., "0.873")
pdf_text_sha256	sha256 of extracted text
pages_processed	Page count analyzed (string)

These make the proof auditable and reproducible for Desci / compliance use-cases.

Why Sei + AI

Sei EVM testnet (1328) → low latency & low fees → notarization feels immediate.

AI agent converts unstructured PDFs into deterministic JSON; we bind the exact content (and model/prompt/version) to an on-chain token via metaHash.

Verify-first avoids unnecessary AI calls and transactions.

Troubleshooting

500 internal_error on /analyze with pdf.js
Ensure agent/pdfExtract.js passes a Uint8Array and disables the worker:

const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true });


CORS errors
app.use(cors({ origin: "http://localhost:5173" })) is in server.js. Adjust FRONTEND_ORIGIN if needed.

ERR_CONNECTION_REFUSED in frontend
Start the agent (npm run start) and confirm http://localhost:3001/health.

Verify shows tokenId: 0 after mint

You uploaded a different file (bytes differ)

Wrong CONTRACT in agent/.env or VITE_CONTRACT in frontend/.env

Wrong network / stale RPC
Restart the agent after changing .env.

Cannot access 'app' before initialization
Call app.use(cors(...)) after const app = express();

Scanned PDFs
OCR isn’t enabled in this demo; text-less scans will return 422.

Roadmap

IPFS pinning: /pin endpoint → auto-set tokenURI = ipfs://CID

Private mode v2: E2EE metadata (wallet-derived keys / threshold reveal)

OCR fallback for scans + per-field confidence surface

Bulk notarization & gasless UX

Watcher Agent: auto-notarize files dropped into a folder / instrument export

Security

This is a hackathon-grade demo. Do not use it in production without:

Security review of the contract and agent

E2EE for private metadata

Rate-limiting and auth on the agent

Key management & rotation

License

MIT — see LICENSE.

Acknowledgements

Sei EVM testnet

pdfjs-dist for PDF text extraction

OpenAI for summarization models
