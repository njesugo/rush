"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Layers,
  Newspaper,
  Image as ImageIcon,
  ListChecks,
  Sparkles,
  Activity,
  Settings,
  CircleDot,
  Film,
  Type,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  badge?: number;
};

const navItems: NavItem[] = [
  { href: "/", label: "Aperçu", icon: LayoutGrid },
  { href: "/carousels", label: "Carousels", icon: Layers, badge: 3 },
  { href: "/reels", label: "Reels", icon: Film },
  { href: "/textcut", label: "Text Cut", icon: Type },
  { href: "/news", label: "Actualités", icon: Newspaper },
  { href: "/bank", label: "Banque d'images", icon: ImageIcon },
  { href: "/cleanup", label: "File de tri", icon: ListChecks, badge: 12 },
  { href: "/pinterest", label: "Pinterest", icon: Sparkles },
  { href: "/jobs", label: "Tâches", icon: Activity },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 items-center px-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg">
            <span className="font-mono text-sm font-bold">R</span>
          </div>
          <span className="text-base font-semibold tracking-tight">Rush</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-accent-soft text-text"
                  : "text-text-body hover:bg-surface-2 hover:text-text"
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon size={16} strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text">
          <CircleDot size={12} className="text-success" />
          <span>Système opérationnel</span>
        </button>
      </div>
    </aside>
  );
}
