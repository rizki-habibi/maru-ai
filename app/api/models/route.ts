import { NextResponse } from "next/server";

const fallback = [{ id:"auto", name:"Otomatis", provider:"MAX Router" }];

export async function GET() {
  const base = process.env.MAX_ROUTER_URL?.replace(/\/$/,"");
  if (!base) return NextResponse.json({ models:fallback });
  try {
    const response = await fetch(base + "/models", { cache:"no-store" });
    if (!response.ok) throw new Error("Router HTTP " + response.status);
    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : fallback;
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models:fallback, source:"fallback" });
  }
}