# Dire Express Admin

Desktop dashboard for approving post-trial broker loads and viewing agent referral scores. Uses the same PostgreSQL database as the main Dire Express app.

## Run

1. Start Postgres from the main app (`docker compose up -d` in `dire-express`).
2. Copy `.env.example` to `.env` and set `AUTH_SECRET`.
3. Schema changes are owned by the main app. After updating `dire-express/prisma/schema.prisma`, copy it here and regenerate:

```bash
cp ../dire-express/prisma/schema.prisma prisma/schema.prisma
npm run db:generate
```

```bash
npm install
npm run db:generate
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

Demo admin: `admin@direexpress.com` / `password123`
