import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPaletteProvider } from "@/components/command-palette/provider";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const email = session.user.email ?? "";
  const initial = (session.user.name ?? email)
    .trim()
    .charAt(0)
    .toUpperCase() || "?";

  return (
    <CommandPaletteProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="lg:pl-60">
          <Topbar userEmail={email} userInitial={initial} />
          <main className="mx-auto max-w-[1440px] px-6 py-8">{children}</main>
        </div>
      </div>
      <Toaster position="bottom-right" theme="light" richColors closeButton />
    </CommandPaletteProvider>
  );
}
