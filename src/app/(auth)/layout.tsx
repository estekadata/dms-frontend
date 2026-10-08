import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "./auth-shell";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AuthShell userName={session.nom} userRole={session.role}>
        {children}
      </AuthShell>
    </Suspense>
  );
}
