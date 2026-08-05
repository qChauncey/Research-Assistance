import { NextRequest, NextResponse } from "next/server";

/**
 * Supabase 保活心跳（由 Vercel Cron 每天调用一次，见 vercel.json）。
 *
 * 背景：Supabase 免费层项目在连续无活动约 7 天后会被自动 pause，
 * 一旦 pause，云端同步、登录、以及依赖 Supabase 集成的 Vercel 部署都会失败。
 * 这里每天发一次真实的数据库查询来维持"有活动"。
 *
 * 用 anon key 查 projects：RLS 是按 owner 过滤的，匿名请求返回 0 行，
 * 但请求仍会打到 PostgREST → Postgres，足以计为活动——
 * 因此既不需要 service_role 密钥，也不需要额外建表或放宽任何权限。
 */
export const runtime = "nodejs";
export const maxDuration = 30;
// 必须每次真实执行，不能被静态化或缓存，否则心跳就没打出去
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel Cron 在设置了 CRON_SECRET 时会带上 Authorization: Bearer <secret>。
  // 设了就校验（防止被随意调用），没设则放行，保证开箱即用。
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase 未配置（缺少 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）" },
      { status: 200 }, // 未配置不算失败，避免 cron 一直报错
    );
  }

  const started = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/projects?select=id&limit=1`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        // 只要计数不要数据，进一步减小开销
        prefer: "count=exact",
        range: "0-0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - started;

    // 2xx / 4xx 都说明数据库在线并处理了请求（4xx 多为 RLS/权限，同样计为活动）；
    // 项目被 pause 时通常表现为 5xx 或连接失败。
    const alive = res.status < 500;
    return NextResponse.json(
      {
        ok: alive,
        status: res.status,
        latencyMs,
        checkedAt: new Date().toISOString(),
        note: alive ? "Supabase 有响应，活动已记录" : "Supabase 无响应，可能已被 pause",
      },
      { status: alive ? 200 : 503 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: /timeout|aborted/i.test(msg) ? "Supabase 请求超时（可能已被 pause）" : msg,
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
