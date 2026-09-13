# Tropicool Treats Teams

This repository is the shared source for Codex, Claude, and Gemini. Read `README.md` before changing the app or deploying it.

- Frontend: React, TypeScript, and Vite. `src/main.tsx` mounts `src/App.tsx`; `src/lib/api.ts` calls the Supabase Edge Functions.
- Backend: `supabase/functions/make-server-3ba8d4df/` and `supabase/functions/make-server-3ba8d4df-2/`.
- Database changes: `supabase/migrations/`. The connected production database has older migrations that are not represented in this repository. Inspect remote migration history before running any migration command.
- Build with `npm ci`, `npx tsc --noEmit`, and `npm run build` using Node 24. The output is `dist/` and is not committed.
- `netlify.toml` publishes `dist/`. Draft deploy and verify before a production deploy. Check the currently published deploy before changing production.
- The clock-out worker can change Square timecards. Dry-run its endpoint against current Square records before changing its schedule. `supabase/release/deactivate-clockout-cron.sql` stops the worker.
- Never commit private credentials, service-role keys, OAuth tokens, local `.env` files, or Netlify login state. The Supabase anon key in `utils/supabase/info.tsx` is a public browser key.
