import { NextResponse } from "next/server";

type RouterModel = { id?: string; name?: string; provider?: string };

function routerHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const k = process.env.MAX_ROUTER_API_KEY?.trim();
  if (k) h.Authorization = k.toLowerCase().startsWith("bearer ") ? k : "Bearer " + k;
  return h;
}

function providerKey(model: string) {
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : "";
}

export async function GET() {
  const base = process.env.MAX_ROUTER_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ models: [], error: "MAX_ROUTER_URL belum dikonfigurasi." }, { status: 500 });
  }

  try {
    const r = await fetch(base + "/models", {
      headers: routerHeaders(),
      cache: "no-store",
    });
    const raw = await r.text();
    let d: any = {};
    try { d = JSON.parse(raw); } catch {}

    if (!r.ok) {
      return NextResponse.json({
        models: [],
        error: d?.error?.message || d?.message || raw || "MAX Router gagal mengambil daftar model.",
        status: r.status,
      }, { status: r.status });
    }

    const rawModels: RouterModel[] = Array.isArray(d.data)
      ? d.data
      : Array.isArray(d.models)
        ? d.models
        : [];

    // Put models from other provider connections first. This prevents a
    // suspended openai-compatible connection from becoming Maru's default.
    const models = rawModels
      .filter((m) => m?.id)
      .sort((a, b) => {
        const aBlocked = providerKey(a.id as string).startsWith("openai-compatible-chat-");
        const bBlocked = providerKey(b.id as string).startsWith("openai-compatible-chat-");
        return Number(aBlocked) - Number(bBlocked);
      });

    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json({
      models: [],
      error: e instanceof Error ? e.message : "Tidak dapat terhubung ke MAX Router.",
    }, { status: 502 });
  }
}
