import { NextRequest, NextResponse } from "next/server";

type ChatMessage = { role:"system"|"user"|"assistant"; content:string };

export async function POST(request:NextRequest) {
  const base = process.env.MAX_ROUTER_URL?.replace(/\/$/,"");
  if (!base) return NextResponse.json({ error:"MAX_ROUTER_URL belum dikonfigurasi di Railway." }, { status:500 });
  const body = await request.json().catch(() => null) as { model?:string; messages?:ChatMessage[] } | null;
  if (!body?.messages?.length) return NextResponse.json({ error:"Pesan tidak boleh kosong." }, { status:400 });
  try {
    const response = await fetch(base + "/chat/completions", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ model:body.model && body.model !== "auto" ? body.model : undefined, messages:body.messages, stream:false }),
      cache:"no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error:data?.error?.message || data?.message || "MAX Router HTTP " + response.status }, { status:response.status });
    return NextResponse.json({ message:data.choices?.[0]?.message || data.message || { role:"assistant", content:"Tidak ada respons dari router." }, usage:data.usage });
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "Gagal menghubungi MAX Router." }, { status:502 });
  }
}