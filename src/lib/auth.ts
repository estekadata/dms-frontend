import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export { hashPassword } from "./hash";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback-secret");

export type UserRole = "super_admin" | "admin" | "vhu";

export interface SessionUser {
  id: number;
  email: string;
  nom: string;
  role: UserRole;
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);
  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("dms-session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

