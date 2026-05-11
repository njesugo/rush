"use client";

import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Layers,
  Newspaper,
  Image as ImageIcon,
  ListChecks,
  Sparkles,
  Activity,
  Settings,
  PlayCircle,
  RefreshCw,
} from "lucide-react";

type Ctx = { open: boolean; setOpen: (v: boolean) => void };
const CommandPaletteContext = createContext<Ctx | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette outside provider");
  return ctx;
}

const navigations = [
  { label: "Aperçu", href: "/", icon: LayoutGrid },
  { label: "Carousels", href: "/carousels", icon: Layers },
  { label: "Actualités", href: "/news", icon: Newspaper },
  { label: "Banque d'images", href: "/bank", icon: ImageIcon },
  { label: "File de tri", href: "/cleanup", icon: ListChecks },
  { label: "Pinterest", href: "/pinterest", icon: Sparkles },
  { label: "Tâches", href: "/jobs", icon: Activity },
  { label: "Paramètres", href: "/settings", icon: Settings },
] as const;

const actions = [
  { label: "Lancer un scrape Pinterest", icon: PlayCircle, action: "scrape" },
  { label: "Pousser la file de review", icon: RefreshCw, action: "push-review" },
] as const;

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href as never);
    },
    [router]
  );

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-[18vh] z-50 w-full max-w-xl -translate-x-1/2 rounded-xl border border-border bg-surface shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <Dialog.Title className="sr-only">Recherche</Dialog.Title>
            <Command label="Recherche" className="overflow-hidden rounded-xl">
              <Command.Input
                placeholder="Rechercher une page ou lancer une action…"
                className="h-12 w-full border-b border-border bg-transparent px-4 text-base outline-none placeholder:text-text-subtle"
              />
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-text-muted">
                  Aucun résultat.
                </Command.Empty>
                <Command.Group
                  heading="Pages"
                  className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wider text-text-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5"
                >
                  {navigations.map((n) => (
                    <Command.Item
                      key={n.href}
                      value={n.label}
                      onSelect={() => go(n.href)}
                      className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-text-body data-[selected=true]:bg-accent-soft data-[selected=true]:text-text"
                    >
                      <n.icon size={15} strokeWidth={1.75} />
                      {n.label}
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group
                  heading="Actions"
                  className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wider text-text-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5"
                >
                  {actions.map((a) => (
                    <Command.Item
                      key={a.action}
                      value={a.label}
                      onSelect={() => setOpen(false)}
                      className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-text-body data-[selected=true]:bg-accent-soft data-[selected=true]:text-text"
                    >
                      <a.icon size={15} strokeWidth={1.75} />
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </CommandPaletteContext.Provider>
  );
}
