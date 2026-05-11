# Rush v2 — Plan de refonte

> Document de continuité. Reprend dans un nouveau chat à partir de ce fichier.

---

## 0. État actuel (déjà livré)

### Stack mise en place
- **Monorepo pnpm** : `apps/web` (Next.js 15) + `packages/db` (Drizzle) + `packages/shared` (Zod)
- **Next.js 15.0.3** + React 19 RC + TypeScript strict
- **Tailwind 3.4** + design tokens light theme (charcoal `#282829` accent)
- **shadcn-style components** : Button, Card, StatusBadge, Counter
- **Framer Motion 11** pour micro-animations
- **cmdk** pour Command Palette `Ctrl+K`
- **Lucide React** pour icônes (stroke 1.5)
- **Drizzle ORM** + Postgres (schéma complet créé, pas encore migré)

### Structure existante
```
rush-v2/
├── apps/web/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx              ✅ Sidebar + Topbar + cmdK
│   │   │   │   ├── page.tsx                ✅ Aperçu (mocks)
│   │   │   │   ├── carousels/page.tsx      🔲 stub
│   │   │   │   ├── news/page.tsx           🔲 stub
│   │   │   │   ├── bank/page.tsx           🔲 stub
│   │   │   │   ├── cleanup/page.tsx        🔲 stub
│   │   │   │   ├── pinterest/page.tsx      🔲 stub
│   │   │   │   ├── jobs/page.tsx           🔲 stub
│   │   │   │   └── settings/page.tsx       🔲 stub
│   │   │   ├── api/health/route.ts         ✅ healthcheck
│   │   │   ├── globals.css                 ✅ design tokens
│   │   │   └── layout.tsx                  ✅ root + fonts (Inter, JetBrains Mono)
│   │   ├── components/
│   │   │   ├── layout/sidebar.tsx          ✅
│   │   │   ├── layout/topbar.tsx           ✅
│   │   │   ├── command-palette/provider.tsx ✅
│   │   │   └── ui/{button,card,status-badge,counter}.tsx ✅
│   │   └── lib/utils.ts                    ✅ cn() + formatRelative()
│   ├── tailwind.config.ts                  ✅
│   ├── next.config.mjs                     ✅
│   ├── tsconfig.json                       ✅
│   └── package.json                        ✅
├── packages/
│   ├── db/
│   │   ├── src/schema.ts                   ✅ 10 tables Drizzle
│   │   ├── src/index.ts                    ✅ getDb()
│   │   ├── src/migrate.ts                  ✅
│   │   └── drizzle.config.ts               ✅
│   └── shared/src/index.ts                 🔲 vide (à remplir)
├── Dockerfile                              ✅
├── railway.json                            ✅
├── pnpm-workspace.yaml                     ✅
├── .env.example                            ✅
├── .gitignore                              ✅
└── README.md                               ✅
```

### Schéma DB déjà défini (Drizzle)
- `users` (id, email, password_hash, name)
- `carousels` (status enum draft/ready/scheduled/published/failed, slides JSONB, scheduled_at, publer_job_id, source_news_ids)
- `hooks` (template, category, performance_score, used_count) — **prêt pour ta future feature**
- `news_items` (source, title, url, summary, fetched_at, published_at, used)
- `images` (filename, storage_key, status enum, source enum, hash, width, height, tags, **embedding** JSONB pour pgvector futur)
- `pinterest_keywords` (keyword unique, score, source, last_used_at)
- `pinterest_swipes` (image_id FK, action, mode, swiped_at)
- `jobs_log` (queue_name, bull_job_id, kind, status, payload, attempts, error)

---

## 1. Environnement de dev (impératif)

### WSL + Node 20
- **Toujours via WSL**. Node système est v18.19.1, mais Next 15 exige Node 20.
- **Pattern à utiliser pour TOUTES les commandes** :
  ```bash
  wsl -- bash -lc 'cd /mnt/c/Users/20016390/Desktop/rush/rush-v2 && . /home/jesugo/.nvm/nvm.sh && nvm use --delete-prefix 20 --silent && <COMMANDE>'
  ```
- pnpm est dans `~/.npm-global/bin/pnpm` (v9.15.9), accessible après `nvm use 20`.

### Lancer le dev server
```bash
wsl -- bash -lc 'cd /mnt/c/Users/20016390/Desktop/rush/rush-v2 && . /home/jesugo/.nvm/nvm.sh && nvm use --delete-prefix 20 --silent && pnpm dev 2>&1 | tee /tmp/rush-dev.log'
```
Premier `Ready` ~55s, ensuite hot-reload instantané. Sert sur `http://localhost:3000`.

### Endpoints sanity-check
- `GET http://localhost:3000/` → page Aperçu
- `GET http://localhost:3000/api/health` → `{"ok":true,"service":"rush-web",...}`

---

## 2. Phases restantes

### PHASE 2 — Infra locale + Auth
**But** : avoir une vraie DB Postgres + Redis qui tournent + auth fonctionnelle.

**Statut** : ✅ code livré. Reste à installer Docker Desktop puis lancer `docker compose up -d`, `pnpm db:migrate`, `pnpm db:seed` (voir section 9).

#### 2.1 Docker Compose pour Postgres + Redis
Créer `rush-v2/docker-compose.yml` :
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: rush
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
volumes:
  postgres_data:
  redis_data:
```
**Lancement** : `wsl -- bash -lc 'cd /mnt/c/Users/.../rush-v2 && docker compose up -d'`
- Vérifier que Docker Desktop tourne sous Windows (intégration WSL2 activée).

#### 2.2 Migrations Drizzle
```bash
# Générer le SQL
pnpm db:generate
# L'appliquer
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rush pnpm db:migrate
```

#### 2.3 Auth.js (NextAuth v5)
- Installer : `pnpm --filter @rush/web add next-auth@beta @auth/drizzle-adapter bcryptjs`
- Créer `apps/web/src/lib/auth.ts` (config NextAuth) :
  - Provider Credentials (email/password) avec bcrypt
  - DrizzleAdapter sur la DB
  - JWT strategy (pas de table session)
- Créer `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Créer `apps/web/src/app/(auth)/login/page.tsx` (form email/pwd, design assorti)
- Middleware `apps/web/src/middleware.ts` : redirect `/login` si non auth
- Script seed : créer un user admin par défaut (`pnpm --filter @rush/db tsx src/seed.ts`)
- **Google OAuth = plus tard** (à la fin de la refonte, comme demandé)

#### 2.4 Tables Auth.js complémentaires
Drizzle adapter veut `accounts`, `sessions`, `verificationTokens` même en JWT pour future migration. Les ajouter au schéma.

---

### PHASE 3 — Pipeline images (le plus critique)
**But** : remplacer toute la chaîne actuelle `bg-removal + bank + push KV` par un pipeline propre, observable, parallèle.

#### 3.1 Worker process séparé
Créer `apps/worker/` avec `package.json`, `tsconfig.json`, `Dockerfile.worker`.
- BullMQ workers (`Worker` et `Queue` from `bullmq`)
- Queues : `bg-removal`, `pinterest-scrape`, `publer-schedule`, `bank-review-push`
- Concurrency : `bg-removal` à 3 (parallèle, fini le `heavyLock` séquentiel) — gain ×3 sur 65 images
- Retry config : exponential backoff, max 3 tentatives
- Persistence dans `jobs_log` via Drizzle (mirror BullMQ pour observabilité côté UI)

Dépendances : `bullmq`, `ioredis`, `@imgly/background-removal-node`, `sharp`, `tsx`, `pino`

Run : `pnpm --filter @rush/worker dev` (avec `tsx watch src/index.ts`)

#### 3.2 Service `imagePipeline` (logique métier)
Dans `packages/services/imagePipeline.ts` :
- `enqueueUpload(file, source)` → écrit fichier dans `BANK_DIR/raw/`, insert row `images` status=`raw`, push job `bg-removal`
- Job `bg-removal` :
  - Lit image, applique `@imgly/background-removal-node`
  - Sauvegarde dans `BANK_DIR/generic/`
  - Update row : status=`generic` ou `fail`, dimensions, hash
  - **À chaque image traitée** : si batch upload, push incrémental vers `bank-review-push` toutes les 10 (résout le bug "j'ai uploadé 65 images, j'attends 5min avant que ça apparaisse")
- Job `bank-review-push` : envoie batch d'IDs au Cloudflare worker via webhook signé HMAC

#### 3.3 Page **Banque d'images** (`/bank`)
- Header : 2 zones drag & drop côte à côte
  - "Upload générique" (PNG/JPG, va direct en `generic`)
  - "Upload RAW" (PNG/JPG/WebP, passe par bg-removal puis review)
- Filtres : Toutes / Disponibles / Utilisées / Fails
- Tri : Récentes / Plus utilisées
- **Affichage masonry** (5-6 colonnes) avec `react-masonry-css` ou CSS columns
- Hover image : overlay sombre + actions (Supprimer, Re-détourer, Copier ID, Aperçu)
- Click image : modal zoom Radix Dialog
- Progress bars en haut quand upload en cours (SSE depuis `/api/jobs/stream`)

#### 3.4 Page **File de tri** (`/cleanup`) — version PC
- Grille 4 colonnes de cards image
- 3 boutons sous chaque : `Garder` (vert) / `Skip` (rouge) / `Re-détourer` (charcoal)
- Raccourcis clavier : `←` skip, `→` keep, `↑` redo (sur la card focus)
- Compteur sticky : "X restantes · Y gardées · Z skipées" (animés via `Counter`)
- Endpoint `POST /api/cleanup/decide` : update `images.status` + insert `pinterest_swipes`

#### 3.5 SSE pour temps réel
Endpoint `GET /api/jobs/stream` :
- Retourne `EventSource` qui pousse événements sur les jobs (start, progress, done, fail)
- Côté client : hook `useJobsStream()` qui invalide TanStack Query
- Le worker pousse les events via Redis pub/sub, le route SSE relaie

---

### PHASE 4 — Carousels & News (port depuis ancien)
**But** : porter toute la logique de génération/planification de l'ancien `src/services/`.

#### 4.1 Page **Actualités** (`/news`)
- **Affichage grille** 3 colonnes (cards : source badge + titre + meta + bouton "Utiliser")
- Filtres par source (multi-select)
- Bulk select avec checkboxes
- CTA "Générer carousel à partir de N news" → POST `/api/carousels/generate`
- Click card → drawer Radix avec contenu complet + bouton "Voir source"

#### 4.2 Page **Carousels** (`/carousels`)
- Tabs sticky : Tous / Brouillon / Prêt / Planifié / Publié (underline animé)
- **Grille 3-4 colonnes** de cards :
  - Thumbnail première slide
  - Titre + StatusBadge
  - Pills de progression slides (8/10)
  - Hover → actions revealed (Voir, Éditer, Publier)
- Filtre + tri
- Bouton "+ Nouveau carousel" en haut à droite

#### 4.3 Page détail carousel (`/carousels/[id]`)
- Preview avec navigation entre slides (boutons ou trackpad gesture)
- Panneau droit : metadata, scheduled_at picker (`react-day-picker`), statut Publer, logs récents
- Boutons : "Régénérer images", "Régénérer hook", "Publier maintenant", "Planifier", "Annuler planification"
- **Préparé pour future feature** : structure `slides_json` éditable via PATCH `/api/carousels/[id]/slides`

#### 4.4 Services à porter depuis `one/src/services/`
Lister et porter chaque module :
- `publer.js` → `packages/services/publer.ts` (API client, scheduling, cancel)
- `carouselGen.js` → `packages/services/carouselGen.ts` (matching slides-images, hook generation)
- `newsScraper.js` → job BullMQ + service
- `pinterest.js` → job BullMQ scrape + KV cache keywords (réutiliser logique cascade 24h fresh / 14d stale)

#### 4.5 Page **Pinterest** (`/pinterest`)
- Tableau de keywords (mais affichage **grille de cards** par mot-clé : score, dernier scrape, nb d'images récupérées)
- Bouton "Lancer scrape" sur chaque card → push job
- Settings : cookies Pinterest (textarea), boost manuel d'un keyword

#### 4.6 Page **Tâches** (`/jobs`)
- Tabs : Active / Waiting / Failed / Completed
- **Grille 2 colonnes** de job cards live :
  - Type job + payload résumé
  - Progress bar animée (SSE)
  - Durée écoulée (font-mono)
  - Actions : retry, remove, voir logs (drawer)
- Mini-charts : throughput dernière heure (Recharts), taux échec
- Stats globales en header

#### 4.7 Page **Paramètres** (`/settings`)
- **Grille de section cards** (pas accordéon) :
  - Compte (nom, email, mdp)
  - Publer (API key, workspace ID)
  - Pinterest (cookies, keywords boost)
  - Cloudflare worker (URL, KV namespace, signing secret)
  - Bg-removal (modèle, parallelism)
  - Notifications (Telegram bot — plus tard)
  - Backup / Export

---

### PHASE 5 — Migration des données existantes
**But** : récupérer carousels, news, images de l'ancienne app SQLite.

#### 5.1 Script migration
Créer `packages/db/src/migrations/from-legacy-sqlite.ts` :
- Connecter à `one/data.db` (better-sqlite3)
- Lire `carousels`, `news_items` → insérer dans Postgres
- Mapper `bank/done/*` files → insérer rows `images` avec `source=upload_generic`, `status=done`
- Hash sha256 chaque image pour déduplication
- Copier (ou symlink) les fichiers vers nouveau `BANK_DIR`
- Logger résumé : X carousels, Y news, Z images migrés

Lancement : `wsl -- bash -lc '... pnpm --filter @rush/db tsx src/migrations/from-legacy-sqlite.ts'`

#### 5.2 Mapping des statuts
- `carousels.status` legacy : `draft|ready|scheduled|published` → identique
- `images` : déduire le statut depuis le dossier (`bank/done/` → `done`, `bank/raw/` → `raw`, `bank/fail/` → `fail`)

---

### PHASE 6 — Bridge Cloudflare Worker mobile
**But** : garder le worker mobile existant (rapide, gratuit, déjà PWA) mais le faire parler à la nouvelle API.

#### 6.1 Webhooks signés
- Côté nouveau backend : endpoint `POST /api/cleanup/sync` qui accepte des swipes du worker
- Signature HMAC SHA-256 dans header `X-Rush-Signature`
- Secret partagé dans `.env` + `wrangler.toml` du worker

#### 6.2 Adaptations worker
Dans `one/worker-pinterest/src/index.js` (qu'on garde pour l'instant) :
- Remplacer URL d'ack vers nouveau backend (`/api/cleanup/sync` au lieu de l'ancien)
- Garder logique swipe + KV (déjà OK)
- Endpoint `/api/review/push` côté Cloudflare reçoit les images depuis le nouveau backend

#### 6.3 Alternative future
**Plus tard** : intégrer le swipe directement dans Next.js sous `/m/swipe` (route mobile), supprimer le Cloudflare worker. Mais pas prioritaire pour la refonte.

---

### PHASE 7 — Deploy Railway
**But** : mettre en prod sur Railway Hobby ($5/mo + crédits).

#### 7.1 Provisioning
- Créer projet Railway "rush"
- Ajouter services : `web` (Next.js), `worker` (BullMQ), `postgres` (managed), `redis` (managed)
- Variables env : `DATABASE_URL` (auto), `REDIS_URL` (auto), `AUTH_SECRET`, `PUBLER_API_KEY`, etc.
- Volume Railway 5 GB monté sur `/data/bank` pour le service `worker` (alternativement : Cloudflare R2)

#### 7.2 Build
- `Dockerfile` racine pour `web` (déjà créé)
- Créer `Dockerfile.worker` similaire pour `worker`
- Tester build local : `docker build -f Dockerfile -t rush-web .`

#### 7.3 Déploiement
- `railway up` ou push GitHub avec auto-deploy
- DNS : custom domain (optionnel)
- Healthcheck `/api/health` configuré dans `railway.json`

#### 7.4 Cutover
- Migration données (phase 5) sur la prod
- Update DNS / bookmarks
- Monitoring 48h
- Garder l'ancien `one/` archivé en lecture seule

---

## 3. Future features (après refonte, comme demandé)

À ne PAS implémenter pendant la refonte. La structure DB est déjà prévue pour les accueillir.

### 3.1 Algo matching slides-images amélioré
- Utiliser `pgvector` (extension Postgres) sur la colonne `images.embedding`
- Service d'embedding : OpenAI `text-embedding-3-small` ou modèle local CLIP
- Matching par similarité cosinus

### 3.2 Banque de templates de Hook
- Table `hooks` déjà créée
- Seed initial avec templates ayant prouvé leur perf Instagram (à fournir)
- Algo : tirer un hook random pondéré par `performance_score`
- UI dans `/settings/hooks` pour ajouter/éditer

### 3.3 Édition complète des slides
- `slides_json` est déjà JSONB → éditable
- Composant éditeur dans page détail carousel : Hook / Texte / Outro / Images, drag-drop pour réordonner
- PATCH `/api/carousels/[id]/slides` avec validation Zod

### 3.4 Carousel from scratch
- Wizard `/carousels/new` (3 étapes : choix template, contenu, validation)
- Réutilise le composant éditeur de 3.3

---

## 4. Décisions techniques validées

| Sujet | Choix |
|-------|-------|
| Migration données existantes | OUI (carousels, news, images) |
| Auth | Email/password maintenant, **Google plus tard** |
| Affichage liste | **Grille en priorité partout** |
| Theme | **Light only** (pas de dark mode) |
| Accent color | `#282829` (charcoal) |
| Pas d'emojis | Icônes Lucide React uniquement |
| PC-first | Responsive mobile prévu mais pas prioritaire |
| Mobile swipe | Garder Cloudflare worker actuel (réécrit pour nouvelle API) |
| Stack | Next.js 15 + Drizzle + Postgres + BullMQ + Redis + Tailwind + Framer Motion |
| Déploiement | Railway Hobby plan |
| Repo name | `rush` (déjà nommé `rush` dans `package.json`) |

---

## 5. Convention de commandes WSL

**TOUJOURS préfixer avec :**
```bash
wsl -- bash -lc 'cd /mnt/c/Users/20016390/Desktop/rush/rush-v2 && . /home/jesugo/.nvm/nvm.sh && nvm use --delete-prefix 20 --silent && <CMD>'
```

Raccourci dev :
```bash
# Lancer dev server (async)
wsl -- bash -lc '... && pnpm dev 2>&1 | tee /tmp/rush-dev.log'

# Tail logs
wsl -- bash -lc 'tail -f /tmp/rush-dev.log'

# Typecheck
wsl -- bash -lc '... && pnpm typecheck'

# Migrations
wsl -- bash -lc '... && pnpm db:generate && pnpm db:migrate'
```

---

## 6. Design system (rappel pour cohérence)

### Palette
- Background `#fafaf9` / Surface `#ffffff` / Surface-2 `#f4f4f3`
- Border `#e8e8e6` / Border-strong `#d4d4d1` / Border-hover `#282829`
- Text `#282829` / Body `#3f3f42` / Muted `#6b6b70` / Subtle `#9a9a9f`
- Accent `#282829` / Hover `#1a1a1b` / Foreground `#ffffff`
- States : Success `#15803d`, Warning `#a16207`, Danger `#b91c1c`, Info `#1d4ed8`

### Règles
- **Aucun emoji** en UI → Lucide React stroke 1.5
- **Grille par défaut** pour les listes
- **Inter** pour UI, **JetBrains Mono** pour valeurs numériques/dates/IDs
- Animations : `cubic-bezier(0.16, 1, 0.3, 1)` 180-280ms
- Hover cards : border `#282829` + translateY -1px (pas de scale brutal)
- Focus rings : 2px ring `#282829` à 35% opacity
- Toasts : Sonner bottom-right
- ⌘K : Raycast-style, fond blanc, ombre douce

---

## 7. Checklist pour reprendre dans le nouveau chat

À faire dans l'ordre au prochain chat :

1. [ ] Lire ce fichier `PLAN.md` en entier
2. [ ] Vérifier que `wsl -- bash -lc '... && pnpm dev'` démarre OK et que `http://localhost:3000` répond
3. [x] **PHASE 2** : Docker compose Postgres+Redis, migrations, Auth.js (code prêt — voir §9)
4. [x] **PHASE 3** : Worker BullMQ + pipeline images + page Banque + page File de tri + SSE
5. [ ] **PHASE 4** : Pages News, Carousels, Pinterest, Jobs, Settings + services
6. [ ] **PHASE 5** : Script migration depuis `one/data.db`
7. [ ] **PHASE 6** : Bridge Cloudflare worker
8. [ ] **PHASE 7** : Deploy Railway

---

## 8. Anciens fichiers à conserver pour migration

Dans `c:\Users\20016390\Desktop\rush\one\` :
- `data.db` — SQLite source pour migration phase 5
- `bank/done/`, `bank/generic/`, `bank/raw/`, `bank/fail/` — images à copier
- `src/services/publer.js`, `pinterest.js`, `bgRemoval.js`, `bankReview.js`, `carouselGen.js`, `newsScraper.js` — code à porter en TS dans `packages/services/`
- `worker-pinterest/src/index.js` — base du worker mobile à adapter
- `worker-pinterest/wrangler.jsonc` — config Cloudflare à conserver

Garder l'ancienne app **fonctionnelle en parallèle** jusqu'au cutover (phase 7).

---

## 9. Phase 2 — Bring-up local (à exécuter une fois Docker installé)

Docker Desktop n'est pas encore installé sur cette machine — `docker compose up -d` échoue avec `command not found`. Une fois Docker Desktop installé + intégration WSL2 activée :

```bash
# 1. Lancer Postgres + Redis
wsl -- bash -lc 'cd /mnt/c/Users/20016390/Desktop/rush/rush-v2 && docker compose up -d'

# 2. Copier l'env si pas déjà fait
copy .env.example .env   # (PowerShell) — puis générer un AUTH_SECRET :
#    openssl rand -base64 32

# 3. Appliquer les migrations
wsl -- bash -lc 'cd /mnt/c/Users/20016390/Desktop/rush/rush-v2 && . /home/jesugo/.nvm/nvm.sh && nvm use --delete-prefix 20 --silent && DATABASE_URL=postgres://postgres:postgres@localhost:5432/rush pnpm db:migrate'

# 4. Créer l'utilisateur admin (admin@rush.local / rush-admin par défaut)
wsl -- bash -lc 'cd /mnt/c/Users/20016390/Desktop/rush/rush-v2 && . /home/jesugo/.nvm/nvm.sh && nvm use --delete-prefix 20 --silent && DATABASE_URL=postgres://postgres:postgres@localhost:5432/rush pnpm db:seed'

# 5. Lancer le dev server
wsl -- bash -lc 'cd /mnt/c/Users/20016390/Desktop/rush/rush-v2 && . /home/jesugo/.nvm/nvm.sh && nvm use --delete-prefix 20 --silent && pnpm dev 2>&1 | tee /tmp/rush-dev.log'

# 6. Aller sur http://localhost:3000 → redirige sur /login → admin@rush.local / rush-admin
```

### Récap des fichiers Phase 2 livrés

- `docker-compose.yml` — Postgres 16 + Redis 7 avec healthchecks et volumes nommés
- `packages/db/src/schema.ts` — ajout `users.id` en `text uuid` + tables `accounts`, `sessions`, `verification_tokens` (Drizzle adapter NextAuth)
- `packages/db/src/seed.ts` — crée un admin (override via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)
- `packages/db/drizzle/0000_*.sql` — migration initiale générée
- `apps/web/src/lib/auth.config.ts` — config edge-safe (middleware)
- `apps/web/src/lib/auth.ts` — config complète (Credentials + bcrypt + DrizzleAdapter, JWT strategy)
- `apps/web/src/middleware.ts` — protège toutes les routes sauf `/login`, `/api/auth/*`, `/api/health`
- `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- `apps/web/src/app/(auth)/login/{page,login-form}.tsx` — formulaire light theme + transition + erreur
- `apps/web/src/components/layout/user-menu.tsx` — menu compte + logout
- `apps/web/src/components/layout/topbar.tsx` — affiche initiale + email
- `apps/web/src/app/(dashboard)/layout.tsx` — server-side `auth()` + redirect `/login`
- `package.json` racine : nouveau script `pnpm db:seed`
- `.env.example` : `AUTH_TRUST_HOST` + `SEED_ADMIN_*`

### Notes techniques importantes

- **`users.id` est devenu `text` (uuid via `gen_random_uuid()`)** au lieu de `serial` pour compatibilité avec `@auth/drizzle-adapter`. Aucune autre table ne référençait encore `users.id` donc pas de ripple. À garder en tête pour la phase 5 si l'ancienne DB SQLite avait des `user_id` numériques (sinon : on peut juste recréer un user par défaut et tout rattacher à lui).
- Auth strategy = JWT, donc l'adapter Drizzle n'est pas appelé à l'exécution actuellement — il est branché pour préparer l'ajout de Google OAuth plus tard sans toucher au schéma.
- Le `middleware.ts` utilise `lib/auth.config.ts` (pas de `bcryptjs` ni de drizzle) pour rester edge-runtime safe ; le `lib/auth.ts` complet n'est instancié que côté Node (route handlers / RSC).

