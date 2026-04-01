import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function verifyAdmin(req: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("dms_session")?.value;

  if (!sessionCookie) {
    return { ok: false, error: "Non authentifie" };
  }

  try {
    const session = JSON.parse(sessionCookie);
    if (!session.role || session.role !== "super_admin") {
      return { ok: false, error: "Acces refuse : role super_admin requis" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Session invalide" };
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, nom, role, password_hash } = body;

      if (!email || !password_hash) {
        return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
      }

      const db = getSupabaseAdmin();

      // Check if user already exists
      const { data: existing } = await db
        .from("dms_users")
        .select("id")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "Un utilisateur avec cet email existe deja" }, { status: 409 });
      }

      // Insert user
      const { data, error } = await db
        .from("dms_users")
        .insert({
          email: email.toLowerCase(),
          nom: nom || null,
          role: role || "utilisateur",
          password_hash,
          actif: true,
          created_at: new Date().toISOString(),
        })
        .select("id, email, nom, role")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, user: data });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id requis" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    if (action === "toggle_actif") {
      const { actif } = body;
      const { error } = await db
        .from("dms_users")
        .update({ actif: !!actif })
        .eq("id", user_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "change_password") {
      const { password_hash } = body;
      if (!password_hash) {
        return NextResponse.json({ error: "password_hash requis" }, { status: 400 });
      }

      const { error } = await db
        .from("dms_users")
        .update({ password_hash })
        .eq("id", user_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
