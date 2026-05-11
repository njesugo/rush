"use client";

import { motion } from "framer-motion";
import {
  Layers,
  ListChecks,
  Newspaper,
  Activity,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Counter } from "@/components/ui/counter";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatRelative } from "@/lib/utils";

const stagger = {
  show: { transition: { staggerChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
};

// Données de démo (remplacées par la DB en phase 2)
const newsMock = [
  { id: 1, source: "Reuters", title: "Apple annonce un nouveau modèle d'IA pour ses Mac", at: Date.now() - 5 * 60_000 },
  { id: 2, source: "TechCrunch", title: "Meta lève 4 Mds pour ses lunettes AR", at: Date.now() - 12 * 60_000 },
  { id: 3, source: "The Verge", title: "OpenAI dévoile un agent autonome pour le code", at: Date.now() - 47 * 60_000 },
  { id: 4, source: "Le Monde", title: "Le Sénat adopte la régulation européenne de l'IA", at: Date.now() - 2 * 3600_000 },
];

const jobsMock = [
  { id: "j1", kind: "Détourage d'image", item: "image_8721.jpg", progress: 78 },
  { id: "j2", kind: "Détourage d'image", item: "image_8722.jpg", progress: 32 },
  { id: "j3", kind: "Scrape Pinterest", item: "kitchen-design", progress: 60 },
];

export default function OverviewPage() {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={item} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aperçu</h1>
          <p className="mt-1 text-sm text-text-muted">
            Vue d'ensemble de votre pipeline de contenu.
          </p>
        </div>
      </motion.div>

      {/* Stats grid */}
      <motion.div variants={stagger} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Carousels programmés"
          value={7}
          trend="+2 cette semaine"
          icon={Layers}
          href="/carousels"
        />
        <StatCard
          label="File de tri"
          value={23}
          trend="+5 dernière heure"
          icon={ListChecks}
          href="/cleanup"
        />
        <StatCard
          label="Actualités fraîches"
          value={12}
          trend="3 sources actives"
          icon={Newspaper}
          href="/news"
        />
        <StatCard
          label="Tâches actives"
          value={3}
          trend="ETA 2 min"
          icon={Activity}
          href="/jobs"
          badge="info"
        />
      </motion.div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* News */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Actualités fraîches</CardTitle>
              <Link
                href="/news"
                className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text"
              >
                Voir tout <ArrowUpRight size={12} />
              </Link>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {newsMock.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{n.title}</div>
                    <div className="mt-0.5 text-xs text-text-muted">
                      {n.source} · <span className="font-mono">{formatRelative(n.at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Jobs */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Tâches en cours</CardTitle>
              <Link
                href="/jobs"
                className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text"
              >
                Voir tout <ArrowUpRight size={12} />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobsMock.map((j) => (
                <div key={j.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <StatusBadge variant="info" withDot>{j.kind}</StatusBadge>
                      <span className="font-mono text-xs text-text-muted">{j.item}</span>
                    </div>
                    <span className="font-mono text-xs text-text-muted">{j.progress}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full bg-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${j.progress}%` }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Planning (placeholder) */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <CardTitle>Planning des 7 prochains jours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d, i) => {
                const count = [2, 1, 0, 2, 1, 0, 1][i];
                return (
                  <div
                    key={d}
                    className="rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="text-xs text-text-muted">{d}</div>
                    <div className="mt-2 flex items-center gap-1">
                      {Array.from({ length: count }).map((_, k) => (
                        <span key={k} className="h-2 w-2 rounded-full bg-accent" />
                      ))}
                      {count === 0 && <span className="text-xs text-text-subtle">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function StatCard({
  label,
  value,
  trend,
  icon: Icon,
  href,
  badge,
}: {
  label: string;
  value: number;
  trend: string;
  icon: typeof Layers;
  href: string;
  badge?: "info" | "success" | "warning";
}) {
  return (
    <motion.div variants={item}>
      <Link href={href as never}>
        <Card interactive className="group">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                {label}
              </span>
              <Icon size={16} strokeWidth={1.75} className="text-text-subtle transition-colors group-hover:text-text" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <Counter value={value} className="font-mono text-3xl font-semibold tracking-tight" />
              {badge && (
                <StatusBadge variant={badge} withDot={false} className="mb-1">
                  live
                </StatusBadge>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-text-muted">
              <TrendingUp size={11} />
              {trend}
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
