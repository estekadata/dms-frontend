"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SidebarWrapper } from "./sidebar-wrapper";

// Enveloppe l'app authentifiée. En mode "embarqué" (page ouverte dans un cadre
// de l'espace multi-onglets, ou ?embed=1), on masque le menu latéral et la barre
// mobile pour n'afficher que le contenu de la page.
export function AuthShell({
  userName,
  userRole,
  children,
}: {
  userName: string;
  userRole: string;
  children: React.ReactNode;
}) {
  const sp = useSearchParams();
  const [inIframe, setInIframe] = useState(false);
  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch {
      setInIframe(true); // cross-origin iframe → on considère embarqué
    }
  }, []);

  const embed = sp.get("embed") === "1" || inIframe;

  if (embed) {
    return (
      <main className="min-h-screen bg-background p-4 md:p-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarWrapper userName={userName} userRole={userRole} />
      <main className="flex-1 p-4 pt-[4.5rem] md:ml-64 md:p-8 md:pt-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
