import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Returns the currently logged-in user (from JWT cookie) or null.
// Used by the VHU portal to skip its legacy "Code d'accès" screen
// when the user already has a JWT session with role=vhu.
export async function GET() {
  const user = await getSession();
  return NextResponse.json({ user });
}
