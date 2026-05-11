"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function UserMenu({
  initial,
  email,
}: {
  initial: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1 h-7 w-7 rounded-full bg-accent text-center font-mono text-xs leading-7 text-accent-fg transition hover:bg-accent-hover"
        aria-label="Compte"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-52 rounded-md border border-border bg-surface p-1 shadow-lg">
          <div className="px-3 py-2 border-b border-border">
            <div className="truncate text-xs text-text-muted">Connecté</div>
            <div className="truncate text-sm font-medium text-text">{email}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-1 flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-text-body transition hover:bg-surface-2 hover:text-text"
          >
            <LogOut size={14} strokeWidth={1.75} />
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
