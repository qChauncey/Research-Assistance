import { NextRequest, NextResponse } from "next/server";

/**
 * PDF 抓取代理（研读模式：为检索到的开放获取论文取回原文全文）。
 * 浏览器直接 fetch 出版社/arXiv 的 PDF 会被 CORS 拦截，故经服务端转发；
 * 只允许 http(s)，限制大小，返回二进制交客户端 pdf.js 解析。
 * 只抓取用户在检索结果里已有的合法开放渠道链接（arXiv / OA landing）。
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 30 * 1024 * 1024; // 30MB 上限

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const raw = (body.url ?? "").trim();
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "无效链接" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "只支持 http(s) 链接" }, { status: 400 });
  }

  try {
    const res = await fetch(target.toString(), {
      headers: { "User-Agent": "ArgumentTree/1.0 (research assistant)" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `源站返回 ${res.status}` },
        { status: 502 },
      );
    }
    const ct = res.headers.get("content-type") ?? "";
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "文件过大（>30MB）" }, { status: 413 });
    }
    // 粗校验：多数 PDF 以 %PDF 开头；content-type 有时不准，故两者取其一
    const head = new Uint8Array(buf.slice(0, 5));
    const isPdfMagic =
      head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
    if (!ct.includes("pdf") && !isPdfMagic) {
      return NextResponse.json(
        { error: "该链接不是 PDF（可能是落地页，请用『↗ 链接』手动打开后下载再上传）" },
        { status: 415 },
      );
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: /timeout|aborted/i.test(msg) ? "抓取超时" : msg },
      { status: 502 },
    );
  }
}
