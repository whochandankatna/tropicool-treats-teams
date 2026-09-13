-- Additive staging schema. Do not schedule the worker until its dry run has
-- been reviewed against current Square roster and timecards.
create table if not exists public.tt_clockout_reminder_events (
  id bigint generated always as identity primary key,
  square_shift_id text not null,
  square_timecard_id text not null,
  team_id integer not null references public.tt_team(id),
  reminder_kind text not null check (reminder_kind in ('before_10', 'at_end', 'after_30')),
  due_at timestamptz not null,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (square_shift_id, reminder_kind, due_at)
);

create table if not exists public.tt_auto_clockout_reviews (
  id bigint generated always as identity primary key,
  square_shift_id text not null unique,
  square_timecard_id text not null unique,
  team_id integer not null references public.tt_team(id),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  auto_end_at timestamptz not null,
  status text not null default 'processing' check (status in ('processing', 'pending', 'approved', 'adjusted', 'failed', 'resolved')),
  actual_end_at timestamptz,
  reviewed_by integer references public.tt_team(id),
  reviewed_at timestamptz,
  review_note text,
  manager_pushed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tt_auto_clockout_reviews_status_idx
  on public.tt_auto_clockout_reviews (status, created_at desc);

alter table public.tt_clockout_reminder_events enable row level security;
alter table public.tt_auto_clockout_reviews enable row level security;
revoke all on public.tt_clockout_reminder_events from anon, authenticated;
revoke all on public.tt_auto_clockout_reviews from anon, authenticated;

-- The old geofence row was writable with the anon key. Only the manager-PIN
-- Edge Function may change it after this migration.
drop policy if exists "geofence settings writable by anon" on public.tt_geofence_settings;
revoke insert, update, delete on public.tt_geofence_settings from anon, authenticated;

alter table public.tt_push_subscriptions
  add column if not exists verified_manager boolean not null default false;
alter table public.tt_push_subscriptions
  add column if not exists manager_verified_at timestamptz;

insert into public.app_secrets (key, value)
select 'clockout_cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.app_secrets where key = 'clockout_cron_secret');
