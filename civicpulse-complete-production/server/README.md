# CivicPulse API

Civic complaint & issue-tracking backend. Citizens report infrastructure problems
(potholes, wire cuts, gas leaks, drainage overflow...); each report is auto-mapped to a
locality (State > District > City > Ward > Colony), classified, and routed to the
responsible department's official dashboard.

**Stack:** Node 20+, TypeScript, Express 4, Prisma, PostgreSQL, Zod.

## Quick start

```bash
cp .env.example .env              # then set JWT_SECRET
docker compose up -d              # local Postgres
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev                       # http://localhost:4000/health
```

Mint a dev token and call the API:

```bash
TOKEN=$(npm run -s dev:token -- citizen@civicpulse.dev)
curl -H "Authorization: Bearer $TOKEN" localhost:4000/api/v1/issues

curl -X POST localhost:4000/api/v1/issues \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Live wire hanging near school","description":"Exposed wire sparking on the pole by the gate","latitude":12.9721,"longitude":77.5951}'
# -> department ELEC, urgency CRITICAL, locality auto-resolved
```

## Layout

```
prisma/            schema.prisma, seed.ts
scripts/           dev-token.ts
src/
  config/          env validation (zod), prisma client
  controllers/     thin HTTP adapters
  services/        business logic (issue, location, department, categorization, health)
  models/          enums, shared interfaces, zod request schemas
  routes/          routers per resource; index.ts mounts /api/v1
  middleware/      auth (JWT + RBAC), validate, error, notFound
  utils/           AppError, asyncHandler, logger, geo
  types/           Express request augmentation
  app.ts           app factory (testable, no side effects)
  server.ts        bootstrap + graceful shutdown
```

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | - | liveness |
| GET | `/health/ready` | - | readiness (DB ping, 503 if down) |
| GET | `/api/v1/departments` | - | |
| GET | `/api/v1/locations` | - | filters: state, district, city, wardNumber, level, zipCode |
| GET | `/api/v1/locations/resolve?lat&lng` | - | nearest colony |
| POST | `/api/v1/issues` | CITIZEN/ADMIN | auto-routes location, dept, urgency |
| GET | `/api/v1/issues` | any | officials auto-scoped to dept + ward |
| GET | `/api/v1/issues/:id` | any | |
| GET | `/api/v1/issues/:id/handles` | any | accountability handles for ward + dept |
| PATCH | `/api/v1/issues/:id/status` | OFFICIAL/ADMIN | validated state machine |
| POST/DELETE | `/api/v1/issues/:id/upvote` | any | one per user |

## Key design decisions

1. **Location is a self-referencing hierarchy** (ward row <- colony rows via `parentId`). `assignedWardId`
   and `OfficialHandle.wardId` always reference ward-level rows; issues reference the most precise row.
2. **Routing is automatic but overridable.** Keyword classifier infers department/urgency; urgency is
   `max(user, inferred)` so safety-critical reports can't be under-tagged.
3. **Officials are authorization-scoped**, not just filtered, in the service layer.
4. **Status transitions are a state machine** (`STATUS_TRANSITIONS`); RESOLVED/REJECTED are terminal.
5. **`upvotesCount` is a denormalised counter** kept consistent with `issue_upvotes` inside a transaction.
6. **Media is never uploaded through this API**: clients upload to object storage (S3/GCS) via pre-signed URLs
   and submit the resulting URLs in `mediaUrls`.

## Known limitations / next steps

- **Auth issuance** (phone OTP / OAuth) not built; only JWT verification + RBAC.
- Pre-signed upload endpoint for media.
- Status history / audit table and notifications (email / SMS / push) to departments.
- PostGIS polygons for exact ward boundaries (current resolver = nearest centroid within a radius).
- Ward-level uniqueness: Postgres NULL semantics mean the unique index does not dedupe ward rows; guard in the admin API.
- Tests (Vitest + Supertest against `createApp()`), CI, Dockerfile, OpenAPI spec.
- Replace the keyword classifier with a model-backed one behind `classifyIssue()`.

---

## AI classification & Twitter/X escalation (Prompt 3)

### Flow: `POST /api/v1/issues/with-media` (multipart/form-data)

Fields: `media` (1-10 files), `title`, `description`, and either `locationId` or `latitude`+`longitude`;
optional `departmentCode`, `urgency`, `overrideIrrelevant=true`.

1. Files are validated (MIME **and** magic bytes), streamed to storage (`local` or any S3-compatible bucket).
2. Gemini inspects the primary photo/video -> department, urgency, spam verdict, one-line summary (concurrent with the upload).
3. Confident "not a civic issue" verdicts are rejected with `422 MEDIA_NOT_CIVIC_ISSUE` (uploads are cleaned up); the citizen can resubmit with `overrideIrrelevant=true`, which saves the issue flagged `aiFlaggedIrrelevant`.
4. Issue is saved `PENDING`. Department precedence: **citizen choice > confident AI > text rules > `DEFAULT_DEPARTMENT_CODE`**. Urgency only goes up: `max(citizen, AI, text escalations)`.
5. Response: `{ issue, ai: {...verdict, degraded, departmentRoutedBy}, twitter: { text, intentUrl, handles, warnings } }`.

### `GET /api/v1/issues/:id/twitter-draft`
Returns the formatted post (kept under X's weighted 280 limit; handles are shed lowest-priority-first before the summary is cut)
and a `https://twitter.com/intent/tweet?...` link. Handles = ward+department officials, then the ward's general officials
(Councillor, Commissioner, Mayor, MLA), then `FALLBACK_TWEET_HANDLES`.

### Failure behaviour
| Situation | Result |
|---|---|
| No `GEMINI_API_KEY`, quota, timeout, bad JSON, blocked response | `ai.source = "fallback"`; routing from text rules; never blocks the citizen |
| Blurry/unclear media (confidence < `AI_MIN_CONFIDENCE`) | AI department not trusted, spam verdict cannot block; urgency escalations still honoured |
| Storage failure | `502 STORAGE_FAILED`, partial uploads removed |
| DB failure / spam rejection | uploaded objects removed |
| No official handles mapped | draft still produced (fallback accounts or no Attn line) + `warnings` |

### Setup
```bash
npm install
npx prisma migrate dev --name add_ai_fields   # adds aiSummary, aiConfidence, aiFlaggedIrrelevant, aiModel
npm run prisma:seed                           # adds sample Commissioner / MLA / SP handles
```

### Security notes
- AI output is untrusted: schema-constrained **and** re-validated with Zod; summaries are stripped of `@`, `#`, URLs and bidi/control characters before reaching a public post (prompt-injection from image text or the description can't tag arbitrary accounts).
- `analyzeCivicIssueMedia(url)` only fetches from allow-listed hosts (SSRF guard); the upload flow passes bytes directly and never re-downloads.
- Submissions are throttled per user (each one costs an AI call).

---

## Deploy (Render API + Supabase)

This repo is the **backend only**. Deploy it from the repo root with `render.yaml` (Render: *New > Blueprint*).

1. **Supabase:** copy the *Transaction pooler* URL (port 6543) into `DATABASE_URL` and append `?pgbouncer=true&connection_limit=1`; copy the *Session pooler / direct* URL (port 5432) into `DIRECT_URL`.
2. **Render env vars** (marked `sync: false` in `render.yaml`): `DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `CLIENT_URL` (your frontend origin), `PUBLIC_API_URL` (the Render URL), `DEFAULT_CITY_HANDLE`, and the `S3_*` values. `JWT_SECRET` is generated for you.
3. **Media storage:** Render's disk is ephemeral, so production must use `STORAGE_DRIVER=s3` (S3, R2, Supabase Storage S3 API...).
4. **Schema:** there is no `prisma/migrations` folder yet, so `npm run start:render` runs `prisma db push` (via `DIRECT_URL`) before booting. Once you generate a baseline locally (`npx prisma migrate dev --name init`) and commit `prisma/migrations`, change the Render start command to `npx prisma migrate deploy && node dist/server.js`.
5. **Reference data:** issue routing needs the departments to exist (`ELEC, PWD, SAN, WATER, GAS, POLICE`). `npm run prisma:seed` creates them but also inserts sample geography and dev users, so replace that data with your real wards before launch.
6. **Auth:** the API verifies JWTs but cannot issue them (no login endpoint yet); `npm run dev:token` is development-only.
