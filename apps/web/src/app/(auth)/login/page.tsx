import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) {
    redirect(params.callbackUrl ?? "/");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-mono text-2xl tracking-tight text-text">rush</div>
          <p className="mt-2 text-sm text-text-muted">Connecte-toi pour continuer</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <LoginForm
            callbackUrl={params.callbackUrl ?? "/"}
            error={params.error}
          />
        </div>
      </div>
    </div>
  );
}
