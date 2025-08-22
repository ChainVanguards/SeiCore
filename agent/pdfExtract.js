// pdfExtract.js — Node-safe, no worker; accept Buffer or Uint8Array
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

function toUint8Array(input) {
  // Handle Buffer, Uint8Array, ArrayBuffer defensively
  if (input instanceof Uint8Array && !(input instanceof Buffer)) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  // Buffer or anything array-like -> copy into a pure Uint8Array
  return new Uint8Array(input);
}

export async function extractPdfText(bufferLike, pageLimit = 30) {
  const data = toUint8Array(bufferLike);

  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,     // run in main thread under Node
    isEvalSupported: false,
    useSystemFonts: true
  });

  const pdf = await loadingTask.promise;
  const pages = Math.min(pdf.numPages || 0, pageLimit);
  if (!pages) return { text: "", pagesProcessed: 0 };

  let out = "";
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map(it => (it?.str ?? "")).filter(Boolean);
    out += strings.join(" ") + "\n";
  }
  return { text: out.trim(), pagesProcessed: pages };
}
