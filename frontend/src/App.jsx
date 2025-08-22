import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { ethers } from "ethers";
import "./styles.css";

// ===== ENV =====
const AGENT = import.meta.env.VITE_AGENT_URL || "http://localhost:3001";
const CONTRACT = import.meta.env.VITE_CONTRACT || ""; // required for mint
const SEI = {
  chainId: "0x530", // 1328
  chainName: "Sei Testnet",
  rpcUrls: [import.meta.env.VITE_RPC_URL || "https://evm-rpc-testnet.sei-apis.com"],
  nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 },
};

// ===== CONTRACT ABI (minimal) =====
const ABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "docHash", type: "bytes32" },
      { internalType: "bytes32", name: "metaHash", type: "bytes32" },
      { internalType: "bool", name: "makePublic", type: "bool" },
      { internalType: "string", name: "tokenURI_", type: "string" },
    ],
    name: "mint",
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "docHash", type: "bytes32" }],
    name: "getTokenByFileHash",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "metaHash", type: "bytes32" }],
    name: "getTokenByMetaHash",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

// ===== UTIL =====
function cls(...xs) { return xs.filter(Boolean).join(" "); }
function copy(t) { if (t) navigator.clipboard?.writeText(t).catch(() => {}); }
const seitraceTx = (hash) => `https://seitrace.com/tx/${hash}?network=testnet`;
const seitraceAddr = (addr) => `https://seitrace.com/address/${addr}?network=testnet`;

// ===== APP =====
export default function App() {
  // wallet
  const [account, setAccount] = useState(null);

  // notarize/verify state
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "", text: "" });

  const [analysis, setAnalysis] = useState(null);            // /analyze result
  const [verifyResult, setVerifyResult] = useState(null);    // /verify/* result
  const [makePublic, setMakePublic] = useState(true);
  const [tokenURI, setTokenURI] = useState("");              // ipfs://CID optional
  const [txHash, setTxHash] = useState("");
  const [metaText, setMetaText] = useState("");

  const appRef = useRef(null);

  // toast helpers
  const info = (text) => setToast({ type: "info", text });
  const ok   = (text) => setToast({ type: "ok", text });
  const err  = (text) => setToast({ type: "err", text });

  // ---- wallet / network ----
  async function ensureSeiTestnet() {
    if (!window.ethereum) throw new Error("Wallet not found");
    const cid = await window.ethereum.request({ method: "eth_chainId" });
    if (cid !== SEI.chainId) {
      try {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [SEI] });
      } catch {
        throw new Error("Please switch to Sei Testnet");
      }
    }
  }

  async function connect() {
    try {
      await ensureSeiTestnet();
      const [acc] = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(acc);
      ok("Wallet connected");
    } catch (e) {
      err(e.message || "Wallet error");
    }
  }

  // ---- flows ----
  // Verify-first; only analyze if not already on-chain
  async function verifyFirstThenAnalyze() {
    if (!file) return;
    setBusy(true);
    setAnalysis(null);
    setVerifyResult(null);
    setTxHash("");
    info("Checking on-chain…");

    try {
      const fd = new FormData();
      fd.append("file", file);

      // 1) On-chain lookup
      const v = await axios.post(`${AGENT}/verify/file`, fd);
      setVerifyResult(v.data);
      const tokenId = Number(v.data?.chain?.tokenId || 0);
      if (v.data?.chain?.enabled && tokenId > 0) {
        ok(`Already notarized (token #${tokenId})`);
        return; // skip analyze to save time/cost
      }

      // 2) AI analyze
      info("Analyzing with AI…");
      const a = await axios.post(`${AGENT}/analyze`, fd);
      setAnalysis(a.data);
      ok("Ready to mint");
    } catch (e) {
      err(e?.response?.data?.error || e.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function mint() {
    if (!analysis) return err("Analyze a PDF first");
    if (!CONTRACT) return err("Missing VITE_CONTRACT in frontend/.env");
    if (!account) return err("Connect wallet");

    try {
      setBusy(true);
      info("Preparing transaction…");
      await ensureSeiTestnet();

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(CONTRACT, ABI, signer);

      const tx = await c.mint(analysis.docHash, analysis.metaHash, makePublic, tokenURI || "");
      info("Submitting…");
      await tx.wait();
      setTxHash(tx.hash);
      ok("Minted");
    } catch (e) {
      err(e?.shortMessage || e?.reason || e.message || "Mint failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyFile() {
    if (!file) return;
    setBusy(true);
    info("Verifying file…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const v = await axios.post(`${AGENT}/verify/file`, fd);
      setVerifyResult(v.data);
      const tokenId = Number(v.data?.chain?.tokenId || 0);
      tokenId > 0 ? ok(`Verified (token #${tokenId})`) : info("Not found");
    } catch (e) {
      err(e?.response?.data?.error || e.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function verifyMetaJson() {
    let body;
    try { body = JSON.parse(metaText || "{}"); }
    catch { return err("Invalid JSON"); }

    setBusy(true);
    info("Verifying metadata…");
    try {
      const v = await axios.post(`${AGENT}/verify/meta`, body);
      setVerifyResult(v.data);
      const tokenId = Number(v.data?.chain?.tokenId || 0);
      tokenId > 0 ? ok(`Verified (token #${tokenId})`) : info("Not found");
    } catch (e) {
      err(e?.response?.data?.error || e.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  // ---- helpers ----
  function scrollToApp() {
    appRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    (async () => { if (window.ethereum) { try { await ensureSeiTestnet(); } catch {} } })();
  }, []);

  // ---- UI ----
  return (
    <div className="site">
      {/* HEADER */}
      <header className="header">
        <div className="container nav">
          <div className="brand">SeiCore</div>
          <nav className="links">
            <a href="#why">Why SeiCore</a>
            <a href="#how">How it works</a>
            <a href="#app">App</a>
            <a href="#next">Next steps</a>
          </nav>
          <div className="actions">
            {account ? (
              <span className="badge">{account.slice(0, 6)}…{account.slice(-4)}</span>
            ) : (
              <button className="btn primary" onClick={connect}>Connect Wallet</button>
            )}
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1>Instant, trust-minimized notarization for real documents.</h1>
            <p>
              Upload a PDF, our AI extracts deterministic metadata, and <strong>Sei EVM</strong> mints an immutable proof.
              Verify the same file in one click.
            </p>
            <div className="hero-ctas row stack-sm">
              <button className="btn primary" onClick={scrollToApp}>Start Notarizing</button>
              <a className="btn ghost" href="https://dorahacks.io/hackathon/aiaccelathon/detail" target="_blank" rel="noreferrer">Built for AI Accelathon</a>
            </div>
            <ul className="pill-list">
              <li className="pill">Sei Testnet • chainId 1328</li>
              <li className="pill">AI-extracted metadata</li>
              <li className="pill">Deterministic hashing</li>
              <li className="pill">Verify-first UX</li>
            </ul>
          </div>
          <div className="hero-card">
            <div className="card">
              <h3>What you can do</h3>
              <ul className="list">
                <li>Notarize a PDF in seconds.</li>
                <li>Verify an existing proof by re-upload.</li>
                <li>Public (IPFS) or demo-private mode.</li>
                <li>Copy file & metadata hashes for audits.</li>
              </ul>
              <div className="mini-note">
                Contract:&nbsp;
                {CONTRACT
                  ? (<a href={seitraceAddr(CONTRACT)} target="_blank" rel="noreferrer">{CONTRACT.slice(0, 8)}…{CONTRACT.slice(-6)}</a>)
                  : <em>not set</em>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section id="why" className="section">
        <div className="container">
          <h2>Why SeiCore</h2>
          <div className="grid3">
            <div className="card"><h3>Fast & predictable</h3><p>Sei’s low-latency finality makes notarization feel real-time. No multi-minute waits, no UX confusion.</p></div>
            <div className="card"><h3>AI that’s verifiable</h3><p>We canonicalize metadata JSON and hash it. Same JSON → same proof, every time.</p></div>
            <div className="card"><h3>Simple verification</h3><p>Re-upload the original file or paste metadata JSON. We recompute hashes and look up on-chain.</p></div>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="section tinted">
        <div className="container">
          <h2>How it works</h2>
          <ol className="steps">
            <li><strong>Upload.</strong> Client sends file to the agent.</li>
            <li><strong>Extract.</strong> Agent reads PDF → fills schema (title, summary, parties…).</li>
            <li><strong>Hash.</strong> keccak256 over raw bytes (file) and canonical JSON (metadata).</li>
            <li><strong>Mint.</strong> Contract stores reverse lookups; optional IPFS tokenURI.</li>
            <li><strong>Verify.</strong> Re-upload file or metadata JSON → instant on-chain check.</li>
          </ol>
        </div>
      </section>

      {/* APP */}
      <section id="app" className="section" ref={appRef}>
        <div className="container">
          <h2>Try the app</h2>

          {/* Toast */}
          {toast.text && (
            <div className={cls("toast", toast.type === "ok" && "ok", toast.type === "err" && "err")}>
              {toast.text}
            </div>
          )}

          <div className="grid2">
            {/* Notarize */}
            <div className="card">
              <h3>Notarize</h3>
              <p className="muted">We first check on-chain to avoid unnecessary fees.</p>

              <div className="field">
                <label>PDF file</label>
                <input
                  className="full"
                  type="file"
                  accept="application/pdf"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="row stack-sm">
                <button className="btn primary" disabled={busy || !file} onClick={verifyFirstThenAnalyze}>
                  {busy ? "Working…" : "Verify first → Analyze"}
                </button>
              </div>

              {analysis && (
                <>
                  <div className="hashes">
                    <div>
                      <span>docHash</span>
                      <code>{analysis.docHash}</code>
                      <button className="btn tiny" onClick={() => copy(analysis.docHash)}>Copy</button>
                    </div>
                    <div>
                      <span>metaHash</span>
                      <code>{analysis.metaHash}</code>
                      <button className="btn tiny" onClick={() => copy(analysis.metaHash)}>Copy</button>
                    </div>
                  </div>

                  {/* Reproducibility panel */}
                  <div className="card-sub">
                    <h4 className="h4">Reproducibility</h4>
                    <div className="kv"><span>model</span><code>{analysis.metadata?.model || "—"}</code></div>
                    <div className="kv"><span>model_hash</span><code>{analysis.metadata?.model_hash || "—"}</code></div>
                    <div className="kv"><span>prompt_hash</span><code>{analysis.metadata?.prompt_hash || "—"}</code></div>
                    <div className="kv"><span>agent_version</span><code>{analysis.metadata?.agent_version || "—"}</code></div>
                    <div className="kv"><span>extract_confidence</span><code>{analysis.metadata?.extract_confidence || "—"}</code></div>
                    <div className="kv"><span>pdf_text_sha256</span><code>{analysis.metadata?.pdf_text_sha256 || "—"}</code></div>
                    <div className="kv"><span>pages_processed</span><code>{analysis.metadata?.pages_processed || "—"}</code></div>
                  </div>

                  <div className="field">
                    <label>AI-extracted metadata</label>
                    <pre className="pre">{JSON.stringify(analysis.metadata, null, 2)}</pre>
                  </div>

                  <label className="checkbox">
                    <input type="checkbox" checked={makePublic} onChange={e => setMakePublic(e.target.checked)} />
                    <span>Make public (use tokenURI/IPFS when ready)</span>
                  </label>

                  <div className="field">
                    <label>tokenURI (optional)</label>
                    <input
                      className="full"
                      value={tokenURI}
                      onChange={e => setTokenURI(e.target.value)}
                      placeholder="ipfs://CID (optional)"
                    />
                  </div>

                  <div className="row stack-sm">
                    <button className="btn" disabled={busy || !account} onClick={mint}>Mint NFT</button>
                  </div>
                </>
              )}

              {txHash && (
                <div className="mini-note">
                  Tx: <a href={seitraceTx(txHash)} target="_blank" rel="noreferrer">{txHash.slice(0, 10)}…{txHash.slice(-8)}</a>
                  <button className="btn tiny" style={{ marginLeft: 8 }} onClick={() => copy(txHash)}>Copy</button>
                </div>
              )}
            </div>

            {/* Verify */}
            <div className="card">
              <h3>Verify</h3>
              <p className="muted">Upload a file or paste metadata JSON to check the on-chain proof.</p>

              <div className="field">
                <label>Verify by file</label>
                <div className="row stack-sm">
                  <button className="btn" disabled={busy || !file} onClick={verifyFile}>Verify File</button>
                </div>
              </div>

              <div className="divider"><span>or</span></div>

              <div className="field">
                <label>Verify by metadata JSON</label>
                <textarea
                  rows={8}
                  value={metaText}
                  onChange={e => setMetaText(e.target.value)}
                  placeholder='{"title":"","summary":"","doc_type":"","date_iso":"","parties":[],"tags":[],"model":"","model_hash":"","prompt_hash":"","agent_version":"","extract_confidence":"","pdf_text_sha256":"","pages_processed":""}'
                />
                <div className="row stack-sm">
                  <button className="btn" disabled={busy || !metaText} onClick={verifyMetaJson}>Verify Metadata</button>
                </div>
              </div>

              {verifyResult && (
                <div className="result">
                  <div className="kv"><span>Status</span>
                    <b>{Number(verifyResult?.chain?.tokenId || 0) > 0 ? "Verified ✓" : "Not found"}</b>
                  </div>
                  <div className="kv"><span>docHash</span><code>{verifyResult.docHash || "—"}</code></div>
                  <div className="kv"><span>metaHash</span><code>{verifyResult.metaHash || "—"}</code></div>
                  {"chain" in verifyResult && (
                    <div className="kv"><span>tokenId</span><code>{String(verifyResult.chain.tokenId ?? "—")}</code></div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* NEXT STEPS */}
      <section id="next" className="section">
        <div className="container">
          <h2>Next steps</h2>
          <div className="grid3">
            <div className="card">
              <h3>IPFS pinning</h3>
              <p>Pin <code>metadata.json</code> and pass <code>ipfs://CID</code> as <code>tokenURI</code>. Show “View on IPFS”.</p>
            </div>
            <div className="card">
              <h3>Private mode</h3>
              <p>Server AES-GCM for demo; roadmap: wallet-derived keys + threshold reveal.</p>
            </div>
            <div className="card">
              <h3>OCR & confidence</h3>
              <p>Add OCR fallback for scans and per-field confidence tags.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container foot">
          <span>© {new Date().getFullYear()} SeiCore — built on Sei EVM testnet</span>
          <span className="muted">Deterministic metadata; canonicalized hashes for reproducible verification.</span>
        </div>
      </footer>
    </div>
  );
}
