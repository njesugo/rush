"use client";

import { Bell, Search, Command as CmdIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCommandPalette } from "@/components/command-palette/provider";
import { UserMenu } from "@/components/layout/user-menu";

const labels: Record<string, string> = {
  "/": "Aperçu",
  "/carousels": "Carousels",
  "/news": "Actualités",
  "/bank": "Banque d'images",
  "/cleanup": "File de tri",
  "/pinterest": "Pinterest",
  "/jobs": "Tâches",
  "/settings": "Paramètres",
};

export function Topbar({
  userEmail,
  userInitial,
}: {
  userEmail: string;
  userInitial: string;
}) {
  const pathname = usePathname();
  const { setOpen } = useCommandPalette();
  const label = labels[pathname] ?? "";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-text-muted">Rush</span>
        <span className="text-text-subtle">/</span>
        <span className="font-medium">{label}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(true)}
          className="group flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-text-muted transition-colors hover:border-border-hover"
        >
          <Search size={14} strokeWidth={1.75} />
          <span className="hidden md:inline">Rechercher…</span>
          <kbd className="ml-1 hidden items-center gap-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-muted md:inline-flex">
            <CmdIcon size={10} />K
          </kbd>
        </button>

        <button className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text">
          <Bell size={16} strokeWidth={1.75} />
        </button>

        <UserMenu initial={userInitial} email={userEmail} />
      </div>
    </header>
  );
}
