# CivicPulse — full-stack

Citizens report civic issues (potholes, wire cuts, gas leaks, drainage overflow...) with a
photo; the report is auto-mapped to a locality, classified by AI, routed to the responsible
department, and escalated to officials on X/Twitter.

```
/server   Node 20 + TypeScript + Express + Prisma + PostgreSQL API   (see server/README.md)
/client   React 18 + Vite + TypeScript + Tailwind CSS web app        (see client/README.md)
```

## Local development

```bash
# 1. Backend
cd server
cp .env.example .env            # set JWT_SECRET (and DATABASE_URL/DIRECT_URL if not using docker compose)
docker compose up -d            # local Postgres
npm install
npm run db:push                 # or: npx prisma migrate dev --name init
npm run db:seed                 # departments + sample ward + dev users (password: Password123!)
npm run dev                     # http://localhost:4000

# 2. Frontend (separate terminal)
cd client
cp .env.example .env            # VITE_BACKEND_URL=http://localhost:4000 (default, fine for local dev)
npm install
npm run dev                     # http://localhost:3000
```

Seeded accounts (password `Password123!` for all): `admin@civicpulse.dev`, `citizen@civicpulse.dev`,
`official@civicpulse.dev`. Or register a new citizen account from the web app.

## Deploying

| Piece | Where | Notes |
|---|---|---|
| API | Render (`server/render.yaml`, *New > Blueprint*) | Set `DATABASE_URL`/`DIRECT_URL` (Supabase), `GEMINI_API_KEY`, `CLIENT_URL` (your Vercel URL), `S3_*` (Supabase Storage). `JWT_SECRET` is generated for you. |
| Database | Supabase (Postgres) | Transaction pooler URL -> `DATABASE_URL`, direct/session URL -> `DIRECT_URL`. |
| Media | Supabase Storage (S3-compatible) | `STORAGE_DRIVER=s3`; see `server/.env.example` for the exact Supabase S3 settings. |
| Web app | Vercel, root directory `client` | Set `VITE_BACKEND_URL` to the Render API URL in the Vercel project's environment variables. |

After the API is live on Render, its start command (`npm run start:render`) runs `prisma db push`
then `npm run db:seed` automatically — departments and reference data are created idempotently
(safe to run on every deploy, never duplicates rows). See `server/README.md` for full endpoint
docs, the AI/Twitter escalation flow, and security notes.
