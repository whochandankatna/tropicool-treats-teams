alter table public.tt_trainings
  add column if not exists due_at timestamptz;

update public.tt_trainings
set due_at = mandatory_since + make_interval(days => grace_period_days)
where mandatory = true
  and mandatory_since is not null
  and due_at is null;

alter table public.tt_trainings
  drop constraint if exists tt_trainings_mandatory_due_at_check;

alter table public.tt_trainings
  add constraint tt_trainings_mandatory_due_at_check
  check (mandatory = false or due_at is not null);

comment on column public.tt_trainings.due_at is
  'Manager-selected deadline for mandatory training. Incomplete non-manager staff are blocked from clock-in after this time.';

create index if not exists tt_trainings_mandatory_due_at_idx
  on public.tt_trainings (due_at)
  where mandatory = true;

create index if not exists tt_training_completions_team_id_idx
  on public.tt_training_completions (team_id);

revoke insert, update, delete, truncate, references, trigger
  on table public.tt_trainings, public.tt_training_completions
  from anon, authenticated;
