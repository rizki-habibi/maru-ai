import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok:true, service:"maru-ai", framework:"nextjs", language:"typescript", timestamp:new Date().toISOString(), routerConfigured:Boolean(process.env.MAX_ROUTER_URL) });
}