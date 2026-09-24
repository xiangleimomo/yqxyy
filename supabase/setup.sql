-- 在 Supabase Dashboard > SQL Editor 执行。执行前确认项目正确。
-- 每个用户一行，账号由 Supabase Auth 单独负责。
create table if not exists public.user_learning_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  quiz_scores jsonb not null default '{}'::jsonb,
  wordbank jsonb not null default '[]'::jsonb,
  sentences jsonb not null default '[]'::jsonb,
  checkins jsonb not null default '[]'::jsonb,
  points integer not null default 0 check (points >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists user_learning_state_updated_idx
  on public.user_learning_state(updated_at);

alter table public.user_learning_state enable row level security;
revoke all on table public.user_learning_state from anon, authenticated;
grant select, insert, update on table public.user_learning_state to authenticated;

drop policy if exists "read own learning data" on public.user_learning_state;
create policy "read own learning data"
  on public.user_learning_state for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "create own learning data" on public.user_learning_state;
create policy "create own learning data"
  on public.user_learning_state for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "update own learning data" on public.user_learning_state;
create policy "update own learning data"
  on public.user_learning_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
