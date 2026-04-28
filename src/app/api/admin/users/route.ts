import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function verifyAdmin(): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Non authentifié" };
  if (session.role !== "super_admin") {
    return { ok: false, error: "Accès refusé : rôle super_admin requis" };
  }
  return { ok: true };
}

export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("dms_users")
    .select("id, email, nom, role, actif, created_at, last_login")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ users: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin();
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

      const validRoles = ["super_admin", "admin", "vhu"];
      const finalRole = validRoles.includes(role) ? role : "admin";

      const db = getSupabaseAdmin();

      const { data: existing } = await db
        .from("dms_users")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "Un utilisateur avec cet email existe déjà" }, { status: 409 });
      }

      const { data, error } = await db
        .from("dms_users")
        .insert({
          email: email.toLowerCase().trim(),
          nom: nom || null,
          role: finalRole,
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin();
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("id");
  if (!userId) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { error } = await db.from("dms_users").delete().eq("id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
