"use client";

import * as React from "react";
import { Loader2, Check, X, RefreshCw, Eye, EyeOff, Save, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ----------- Types (mirror service shapes) ----------- */
interface ApiKeyStatus {
  name: string;
  label: string;
  category: "ai" | "search" | "social" | "infra" | "pinterest" | "media" | "other";
  required?: boolean;
  description?: string;
  present: boolean;
  preview: string | null;
}

interface AppPrefs {
  claudeModel: string;
  carouselSchedule: string;
  pinterestSyncSchedule: string;
  newsScrapeSchedule: string;
  defaultCarouselCount: number;
  autoEnqueueBgRemoval: boolean;
  carouselOutroTemplate: string;
}

interface SettingsApi {
  user: { id: string; email: string; name: string | null; image: string | null } | null;
  keys: ApiKeyStatus[];
  prefs: AppPrefs;
}

const TABS = [
  { key: "account", label: "Compte" },
  { key: "keys", label: "Clés API" },
  { key: "prefs", label: "Préférences" },
  { key: "tests", label: "Tests" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const CATEGORY_LABELS: Record<ApiKeyStatus["category"], string> = {
  ai: "IA",
  search: "Recherche",
  pinterest: "Pinterest",
  infra: "Infra",
  social: "Social",
  media: "Média",
  other: "Autre",
};

const TESTABLE = [
  { id: "db", label: "Postgres" },
  { id: "redis", label: "Redis" },
  { id: "anthropic", label: "Anthropic" },
  { id: "tavily", label: "Tavily" },
  { id: "pinterest", label: "Pinterest worker" },
  { id: "publer", label: "Publer" },
] as const;

type TestId = (typeof TESTABLE)[number]["id"];
interface TestState {
  status: "idle" | "running" | "ok" | "fail";
  detail?: string;
  latencyMs?: number;
}

export function SettingsPageClient() {
  const [tab, setTab] = React.useState<Tab>("account");
  const [data, setData] = React.useState<SettingsApi | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      setData((await res.json()) as SettingsApi);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
        Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
          <p className="text-sm text-text-muted">Compte, intégrations et préférences d&apos;application.</p>
        </div>
        <button
          onClick={() => void fetchData()}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-sm text-text-body hover:border-border-hover hover:bg-surface-2"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
          Actualiser
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative -mb-px px-4 py-2 text-sm transition-colors",
              tab === t.key
                ? "border-b-2 border-accent text-text"
                : "border-b-2 border-transparent text-text-muted hover:text-text"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "account" && <AccountTab user={data.user} onSaved={() => void fetchData()} />}
      {tab === "keys" && <KeysTab keys={data.keys} />}
      {tab === "prefs" && <PrefsTab prefs={data.prefs} onSaved={() => void fetchData()} />}
      {tab === "tests" && <TestsTab />}
    </div>
  );
}

/* ----------- Account ----------- */
function AccountTab({
  user,
  onSaved,
}: {
  user: SettingsApi["user"];
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(user?.name ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");
  const [savingProfile, setSavingProfile] = React.useState(false);

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [savingPwd, setSavingPwd] = React.useState(false);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, email: email.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast.error(j?.error === "email_taken" ? "Cet email est déjà utilisé" : "Erreur de sauvegarde");
        return;
      }
      toast.success("Profil mis à jour");
      onSaved();
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    if (next.length < 8) {
      toast.error("Minimum 8 caractères");
      return;
    }
    setSavingPwd(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast.error(j?.error === "wrong_password" ? "Mot de passe actuel incorrect" : "Erreur");
        return;
      }
      toast.success("Mot de passe mis à jour");
      setCurrent("");
      setNext("");
      setConfirm("");
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Profil">
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Nom">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
            >
              {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Save className="h-3.5 w-3.5" strokeWidth={1.5} />}
              Enregistrer
            </button>
          </div>
        </form>
      </Card>

      <Card title="Mot de passe" icon={<KeyRound className="h-4 w-4 text-text-muted" strokeWidth={1.5} />}>
        <form onSubmit={savePassword} className="space-y-4">
          <Field label="Mot de passe actuel">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Nouveau mot de passe">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Confirmer">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPwd}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
            >
              {savingPwd ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Save className="h-3.5 w-3.5" strokeWidth={1.5} />}
              Changer
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ----------- API keys ----------- */
function KeysTab({ keys }: { keys: ApiKeyStatus[] }) {
  const [reveal, setReveal] = React.useState<Record<string, boolean>>({});

  const groups = React.useMemo(() => {
    const m = new Map<ApiKeyStatus["category"], ApiKeyStatus[]>();
    for (const k of keys) {
      const arr = m.get(k.category) ?? [];
      arr.push(k);
      m.set(k.category, arr);
    }
    return Array.from(m.entries());
  }, [keys]);

  const presentCount = keys.filter((k) => k.present).length;
  const missingRequired = keys.filter((k) => k.required && !k.present);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-sm">
        <Pill tone="default">{presentCount}/{keys.length} configurées</Pill>
        {missingRequired.length > 0 && (
          <Pill tone="danger">{missingRequired.length} obligatoire{missingRequired.length > 1 ? "s" : ""} manquante{missingRequired.length > 1 ? "s" : ""}</Pill>
        )}
        <span className="text-text-muted">
          Lecture seule. Modifiez les variables d&apos;environnement puis redémarrez le serveur.
        </span>
      </div>

      {groups.map(([cat, items]) => (
        <Card key={cat} title={CATEGORY_LABELS[cat]}>
          <div className="divide-y divide-border">
            {items.map((k) => (
              <div key={k.name} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{k.label}</span>
                    {k.required && (
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                        Requis
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                    <code className="font-mono">{k.name}</code>
                    {k.description && <span>· {k.description}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {k.present ? (
                    <code className="rounded bg-surface-2 px-2 py-1 font-mono text-xs text-text-body">
                      {reveal[k.name] ? k.preview : "•••• •••• ••••"}
                    </code>
                  ) : (
                    <span className="text-xs text-text-muted">Non définie</span>
                  )}
                  {k.present && (
                    <button
                      onClick={() => setReveal((r) => ({ ...r, [k.name]: !r[k.name] }))}
                      className="text-text-muted hover:text-text"
                      title={reveal[k.name] ? "Masquer" : "Afficher (aperçu)"}
                    >
                      {reveal[k.name] ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                  )}
                  <StatusDot ok={k.present} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ----------- Preferences ----------- */
function PrefsTab({ prefs, onSaved }: { prefs: AppPrefs; onSaved: () => void }) {
  const [form, setForm] = React.useState<AppPrefs>(prefs);
  const [saving, setSaving] = React.useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(prefs);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        toast.error("Erreur de sauvegarde");
        return;
      }
      toast.success("Préférences enregistrées");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <Card title="Génération">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modèle Claude">
            <input
              type="text"
              value={form.claudeModel}
              onChange={(e) => setForm({ ...form, claudeModel: e.target.value })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
              placeholder="claude-sonnet-4-5-20250929"
            />
          </Field>
          <Field label="Nb de carrousels par lot">
            <input
              type="number"
              min={1}
              max={20}
              value={form.defaultCarouselCount}
              onChange={(e) => setForm({ ...form, defaultCarouselCount: Number(e.target.value) || 1 })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.autoEnqueueBgRemoval}
            onChange={(e) => setForm({ ...form, autoEnqueueBgRemoval: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          <span className="text-text">Lancer automatiquement le détourage à l&apos;ingestion</span>
        </label>
        <div className="mt-4">
          <Field label="Outro des carrousels">
            <textarea
              value={form.carouselOutroTemplate}
              onChange={(e) => setForm({ ...form, carouselOutroTemplate: e.target.value })}
              rows={4}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none"
              placeholder="Chaque jour, je **décrypte l'IA et ses applications**. L'essentiel en 5 min.\n**Follow** pour ne rien manquer."
            />
            <p className="mt-1 text-[11px] text-text-muted">
              Texte affiché sur la dernière slide. Entoure les mots de **étoiles** pour les mettre en gras italique. Les sauts de ligne sont préservés.
            </p>
          </Field>
        </div>
      </Card>

      <Card title="Plannings (cron)" subtitle="Format cron — ex. */5 * * * * (toutes les 5 min)">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sync Pinterest">
            <input
              type="text"
              value={form.pinterestSyncSchedule}
              onChange={(e) => setForm({ ...form, pinterestSyncSchedule: e.target.value })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
              placeholder="*/5 * * * *"
            />
          </Field>
          <Field label="Scrape news">
            <input
              type="text"
              value={form.newsScrapeSchedule}
              onChange={(e) => setForm({ ...form, newsScrapeSchedule: e.target.value })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
              placeholder="0 */2 * * *"
            />
          </Field>
          <Field label="Génération carrousels">
            <input
              type="text"
              value={form.carouselSchedule}
              onChange={(e) => setForm({ ...form, carouselSchedule: e.target.value })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
              placeholder="0 8 * * *"
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-text-muted">Modifications non enregistrées</span>}
        <button
          type="button"
          onClick={() => setForm(prefs)}
          disabled={!dirty || saving}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm hover:border-border-hover disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Save className="h-3.5 w-3.5" strokeWidth={1.5} />}
          Enregistrer
        </button>
      </div>
    </form>
  );
}

/* ----------- Connection tests ----------- */
function TestsTab() {
  const [results, setResults] = React.useState<Record<TestId, TestState>>(() =>
    Object.fromEntries(TESTABLE.map((t) => [t.id, { status: "idle" }])) as Record<TestId, TestState>
  );

  const runOne = async (id: TestId) => {
    setResults((r) => ({ ...r, [id]: { status: "running" } }));
    try {
      const res = await fetch(`/api/settings/test/${id}`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; detail?: string; latencyMs?: number } | null;
      if (j?.ok) {
        setResults((r) => ({ ...r, [id]: { status: "ok", detail: j.detail, latencyMs: j.latencyMs } }));
      } else {
        setResults((r) => ({ ...r, [id]: { status: "fail", detail: j?.detail ?? `HTTP ${res.status}` } }));
      }
    } catch (err) {
      setResults((r) => ({
        ...r,
        [id]: { status: "fail", detail: err instanceof Error ? err.message : String(err) },
      }));
    }
  };

  const runAll = async () => {
    await Promise.all(TESTABLE.map((t) => runOne(t.id)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">Vérifie la connectivité de chaque intégration en direct.</p>
        <button
          onClick={() => void runAll()}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
          Tout tester
        </button>
      </div>

      <Card>
        <div className="divide-y divide-border">
          {TESTABLE.map((t) => {
            const r = results[t.id];
            return (
              <div key={t.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <ResultIcon status={r.status} />
                  <div>
                    <div className="font-medium text-text">{t.label}</div>
                    {r.detail && (
                      <div className={cn("mt-0.5 text-xs", r.status === "fail" ? "text-danger" : "text-text-muted")}>
                        {r.detail}
                        {r.latencyMs != null && r.status === "ok" && ` · ${r.latencyMs} ms`}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void runOne(t.id)}
                  disabled={r.status === "running"}
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm hover:border-border-hover disabled:opacity-50"
                >
                  {r.status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                  Tester
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ----------- Tiny UI primitives ----------- */
function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {(title || icon) && (
        <div className="mb-4 flex items-center gap-2">
          {icon}
          {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
          {subtitle && <span className="text-xs text-text-muted">· {subtitle}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function Pill({ tone, children }: { tone: "default" | "danger"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
        tone === "danger" ? "border-danger/30 bg-danger/5 text-danger" : "border-border bg-surface-2 text-text-body"
      )}
    >
      {children}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn("h-2 w-2 rounded-full", ok ? "bg-success" : "bg-text-muted/40")}
      title={ok ? "Configurée" : "Non configurée"}
    />
  );
}

function ResultIcon({ status }: { status: TestState["status"] }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-text-muted" strokeWidth={1.5} />;
  if (status === "ok") return <Check className="h-4 w-4 text-success" strokeWidth={1.5} />;
  if (status === "fail") return <X className="h-4 w-4 text-danger" strokeWidth={1.5} />;
  return <span className="h-4 w-4 rounded-full border border-border" />;
}
