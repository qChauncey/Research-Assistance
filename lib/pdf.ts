/**
 * PDF 全文提取（Phase 2, §6.3.3）——客户端用 pdf.js，无需服务端。
 * 提取文本 + 解析元数据（DOI / 年份 / 标题），用于：
 *   - 匹配库中已有条目或反查 OpenAlex
 *   - 分块后进入向量索引（离线降级为关键词，见 lib/search 语义部分）
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

export interface ExtractedPdf {
  text: string;
  pageCount: number;
  title?: string;
  doi?: string;
  year?: number;
  fileHash: string;
}

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import("pdfjs-dist");
  // worker：用打包出的 worker 资源（Next/webpack 支持 new URL(..., import.meta.url)）
  lib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  pdfjsLib = lib;
  return lib;
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;

function parseMeta(text: string, docMeta?: Record<string, unknown>): {
  title?: string;
  doi?: string;
  year?: number;
} {
  const doiMatch = text.match(DOI_RE);
  const doi = doiMatch ? doiMatch[0].replace(/[.,;]$/, "") : undefined;

  // 年份：取 19xx/20xx 中最靠前且合理的
  const years = Array.from(text.matchAll(/\b(19|20)\d{2}\b/g))
    .map((m) => Number(m[0]))
    .filter((y) => y >= 1900 && y <= new Date().getFullYear() + 1);
  const year = years.length ? mostCommon(years) : undefined;

  // 标题：优先 PDF 元数据的 Title，否则取正文第一段较长的行
  let title = (docMeta?.Title as string | undefined)?.trim() || undefined;
  if (!title) {
    const firstLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 12 && l.length < 200);
    title = firstLines[0];
  }
  return { title, doi, year };
}

function mostCommon(nums: number[]): number {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export async function extractPdf(file: File): Promise<ExtractedPdf> {
  const lib = await getPdfjs();
  const buf = await file.arrayBuffer();
  const fileHash = await sha256(buf.slice(0));

  const doc: PDFDocumentProxy = await lib.getDocument({ data: buf }).promise;
  const pageCount = doc.numPages;
  let text = "";
  const maxPages = Math.min(pageCount, 40); // 上限，避免超大 PDF 卡死
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    text += pageText + "\n";
  }

  let docMeta: Record<string, unknown> | undefined;
  try {
    const md = await doc.getMetadata();
    docMeta = (md.info ?? undefined) as Record<string, unknown> | undefined;
  } catch {
    /* 元数据缺失可忽略 */
  }

  const meta = parseMeta(text, docMeta);
  return { text, pageCount, fileHash, ...meta };
}

/** 分块（供向量化）。简单按字符窗口切，保留页边界不严格。 */
export function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) {
    chunks.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return chunks;
}
