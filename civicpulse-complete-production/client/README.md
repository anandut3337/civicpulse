# CivicPulse — web

React 18 + Vite + TypeScript + Tailwind CSS. Talks to the `server/` API over `VITE_BACKEND_URL`.

```bash
cp .env.example .env    # VITE_BACKEND_URL, default http://localhost:4000
npm install
npm run dev              # http://localhost:3000
npm run build             # production build -> dist/
```

## Layout

```
src/
  context/AuthContext.tsx   JWT auth (stored in localStorage, attached by lib/api.ts)
  lib/api.ts                axios instance + auth interceptor + error helper
  components/                Navbar, ProtectedRoute, IssueCard, MediaDropzone, badges
  pages/
    LoginPage / RegisterPage
    DashboardPage            live issue feed (filters, sort, polling)
    ReportIssuePage           photo/video dropzone + geolocation -> POST /issues/with-media
    IssueDetailPage           media gallery, upvote, status transitions, "tag officials on X"
```

## Deploying to Vercel

- Project root directory: `client`
- Build command: `npm run build` (default for Vite)
- Output directory: `dist` (default)
- Environment variable: `VITE_BACKEND_URL` = your Render API URL (e.g. `https://civicpulse-api.onrender.com`)
- `vercel.json` rewrites all routes to `index.html` for client-side routing.
