# Rush v2

Refonte propre, light theme, PC-first. Stack : Next.js 15 + Postgres + Drizzle + BullMQ + Tailwind + shadcn/ui + Framer Motion.

## Démarrage local

```bash
# 1. Installer pnpm si besoin (déjà fait dans WSL)
pnpm -v

# 2. Installer les dépendances
pnpm install

# 3. Lancer Postgres + Redis (à venir : docker-compose.yml)
# Pour l'instant, tu peux pointer DATABASE_URL vers Railway directement.

# 4. Copier l'env
cp .env.example .env
# puis remplir DATABASE_URL et REDIS_URL

# 5. Migrations DB
pnpm db:generate
pnpm db:migrate

# 6. Lancer le dev server
pnpm dev
# → http://localhost:3000
```

## Structure

```
apps/web/         Next.js dashboard + PWA mobile + API
packages/db/      Schéma Drizzle + client Postgres
packages/shared/  Types Zod + utils partagés
```

## Phases prévues

1. ✅ Fondation (design system, layout, Overview)
2. ⏳ DB Postgres + auth
3. ⏳ Pipeline images (upload + bg-removal en worker)
4. ⏳ Carousels + News (port depuis l'ancienne app)
5. ⏳ Bridge Cloudflare worker mobile
6. ⏳ Cutover & migration de données
