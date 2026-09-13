# Tropicool Treats Teams

Source code for the [live Tropicool Treats Teams app](https://tropicooltreatsteam.netlify.app/). This repository contains the complete React frontend, both Supabase Edge Functions, the available SQL migrations, and the clock-out scheduler release scripts. Generated `dist/` files, dependencies, and credentials are excluded.

## Current production baseline

As verified on 13 September 2026 (Australia/Brisbane):

- Netlify site ID: `73159c4f-108b-4dbe-bb17-299dd3371f6d`; published deploy: `6aa6639e8d14e2fdd583c639`.
- Supabase project ref: `bbyfmxokfarsrifnmjxp`. The main Edge Function `make-server-3ba8d4df` is version 89; `make-server-3ba8d4df-2` is version 7.
- The `check-clockouts` cron job is active every minute. Its first scheduled request returned HTTP 200. A manager phone was verified for review alerts before activation.
- The 200 m clock-in geofence code is deployed, but the manager-controlled switch is **off**. Enable it in Manager → Settings → Geolocation after confirming the store location and device behaviour.

The older `CLOCKOUT-RELEASE-NOTES.md` and `PRODUCTION-CANDIDATE-NOTES.md` describe preparation before deployment and are retained for history. Their statements that production was unchanged are no longer current.

## Local development

Use Node 24, then run:

```sh
npm ci
npx tsc --noEmit
npm run build
```

The frontend starts at `src/main.tsx`. `src/App.tsx` contains the screens; `src/lib/api.ts` and `src/lib/supabase.ts` connect to the backend. `utils/supabase/info.tsx` contains the public Supabase project ID and browser anon key. Keep any private configuration outside Git.

## Backend and deployment

The Edge Function sources are under `supabase/functions/`. The SQL files in `supabase/migrations/` use the versions recorded in the production migration history. Earlier production migrations are not present here, so do not assume this directory can bootstrap a fresh Supabase project or run `supabase db push` without checking the remote history first.

`netlify.toml` builds the frontend and publishes `dist/`. Deploy a draft first, check its assets and routes, then publish the same build to the existing site. The clock-out worker must be dry-run against current Square shifts and timecards before changing its schedule. Use `supabase/release/deactivate-clockout-cron.sql` to stop automatic clock-outs if needed.

Claude and Gemini can clone this repository to work on the same code. Access to the private GitHub repository, Netlify, Supabase, and Square must be granted through each service; no credentials are stored here.
