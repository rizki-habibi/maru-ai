import { NextRequest, NextResponse } from "next/server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
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

function isSuspendedAccountError(status: number, detail: string) {
  return status === 403 && /account_suspended|multiple accounts|free-tier limits/i.test(detail);
}

async function fetchModels(base: string) {
  const r = await fetch(base + "/models", {
    headers: routerHeaders(),
    cache: "no-store",
  });
  const raw = await r.text();
  let d: any = {};
  try { d = JSON.parse(raw); } catch {}
  if (!r.ok) return [];
  const models = Array.isArray(d.data) ? d.data : Array.isArray(d.models) ? d.models : [];
  return models.filter((m: RouterModel) => m?.id).map((m: RouterModel) => m.id as string);
}

async function complete(base: string, model: string, messages: ChatMessage[], signal: AbortSignal) {
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: routerHeaders(),
    body: JSON.stringify({ model, messages, stream: false }),
    cache: "no-store",
    signal,
  });
  const raw = await r.text();
  let d: any = {};
  try { d = JSON.parse(raw); } catch {}
  const detail = d?.error?.message || d?.error || d?.message || raw || "MAX Router tidak memberikan detail error.";
  return { r, d, detail: typeof detail === "string" ? detail : JSON.stringify(detail) };
}

export async function POST(request: NextRequest) {
  const base = process.env.MAX_ROUTER_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ error: "MAX_ROUTER_URL belum dikonfigurasi di Railway." }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as { model?: string; messages?: ChatMessage[] } | null;
  if (!body?.model || body.model === "auto") {
    return NextResponse.json({ error: "Model dari MAX Router belum tersedia. Tunggu daftar model selesai dimuat." }, { status: 400 });
  }
  if (!body.messages?.length) {
    return NextResponse.json({ error: "Pesan tidak boleh kosong." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    let selectedModel = body.model;
    let result = await complete(base, selectedModel, body.messages, controller.signal);

    // A provider-level account suspension must not make Maru permanently
    // stick to the first model returned by MAX Router. Ask the router for
    // another model and retry once using a different provider connection.
    if (!result.r.ok && isSuspendedAccountError(result.r.status, result.detail)) {
      const blockedProvider = providerKey(selectedModel);
      const alternatives = await fetchModels(base);
      const fallback = alternatives.find((id) => id !== selectedModel && providerKey(id) !== blockedProvider);

      if (fallback) {
        selectedModel = fallback;
        result = await complete(base, selectedModel, body.messages, controller.signal);
      } else {
        return NextResponse.json({
          error: "Provider MAX Router sedang ditangguhkan.",
          detail: result.detail,
          model: selectedModel,
          fallbackAvailable: false,
        }, { status: 503 });
      }
    }

    if (!result.r.ok) {
      return NextResponse.json({
        error: "MAX Router HTTP " + result.r.status,
        detail: result.detail,
        model: selectedModel,
      }, { status: result.r.status });
    }

    return NextResponse.json({
      message: result.d.choices?.[0]?.message || result.d.message || {
        role: "assistant",
        content: "Tidak ada respons dari MAX Router.",
      },
      usage: result.d.usage,
      model: selectedModel,
      router: true,
    });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error && e.name === "AbortError"
        ? "MAX Router timeout setelah 90 detik."
        : e instanceof Error
          ? e.message
          : "Gagal menghubungi MAX Router.",
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
