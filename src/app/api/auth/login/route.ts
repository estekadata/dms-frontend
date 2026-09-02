import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPassword, type SessionUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
  }

  const pwdHash = await hashPassword(password);
  let user: SessionUser | null = null;

  // Vérification via la fonction SECURITY DEFINER `dms_login`.
  // La table dms_users est verrouillée par RLS : la clé anon n'y a plus accès
  // en direct (cf. secure_dms_users.sql). La fonction ne renvoie l'utilisateur
  // que si (email, password_hash, actif) correspondent et met à jour last_login.
  // Les comptes sont stockés en minuscules (cf. création). On normalise
  // l'email saisi pour qu'un "Olenormand@..." matche "olenormand@...".
  const { data, error } = await supabase.rpc("dms_login", {
    p_email: email.trim().toLowerCase(),
    p_password_hash: pwdHash,
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (row && !error) {
    user = { id: row.id, email: row.email, nom: row.nom || "", role: row.role };
  }

  // Fallback admin de secours — UNIQUEMENT si explicitement configuré via env.
  // (plus de défaut "admin"/"change-moi" en dur : c'était un backdoor super_admin)
  if (!user) {
    const adminUser = process.env.ADMIN_USER;
    const adminPwd = process.env.ADMIN_PASSWORD;
    if (adminUser && adminPwd && email === adminUser && password === adminPwd) {
      user = { id: 0, email: "admin", nom: "Administrateur", role: "super_admin" };
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
  }

  const token = await createSession(user);
  const response = NextResponse.json({ user });
  response.cookies.set("dms-session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return response;
}
