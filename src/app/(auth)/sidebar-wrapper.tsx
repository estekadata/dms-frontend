"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

interface Props {
  userName: string;
  userRole: string;
}

export function SidebarWrapper({ userName, userRole }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Barre supérieure mobile (burger) */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="flex size-9 items-center justify-center rounded-lg text-text-dim transition hover:bg-surface-hover hover:text-foreground"
        >
          <Menu size={22} />
        </button>
        <span className="font-heading font-bold tracking-wide text-foreground">MULTIREX AUTO</span>
      </div>

      {/* Fond sombre quand le drawer est ouvert */}
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <Sidebar userName={userName} userRole={userRole} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
