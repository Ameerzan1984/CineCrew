import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { isCineMeshAdmin } from "../../../../lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (!isCineMeshAdmin(user.email)) return NextResponse.json({ error: "Admin access required" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ admin: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Admin access is unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
