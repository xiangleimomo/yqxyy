create table public.story_books (
 id text primary key check (id ~ '^[a-z0-9-]{1,100}$'),
 title text not null check (length(title) between 1 and 180),
 title_zh text not null default '' check (length(title_zh)<=180),
 level text not null default '' check (length(level)<=40),
 description text not null default '' check (length(description)<=1000),
 source_url text not null check (source_url ~ '^https://u\.pone\.rs/[A-Za-z0-9]+\.pdf$'),
 cover_url text not null default '' check (length(cover_url)<=240000 and (cover_url='' or cover_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' or cover_url ~ '^assets/covers/[a-z0-9/_.-]+\.(jpg|png)$' or cover_url ~ '^https://u\.pone\.rs/[A-Za-z0-9]+\.(jpg|jpeg|png)$')),
 updated_at timestamptz not null default now()
);
alter table public.story_books enable row level security;
revoke all on public.story_books from anon, authenticated;
grant select on public.story_books to anon, authenticated;
grant insert, update on public.story_books to authenticated;
create policy books_public_read on public.story_books for select to anon, authenticated using (true);
create policy books_admin_insert on public.story_books for insert to authenticated with check ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
create policy books_admin_update on public.story_books for update to authenticated using ((select auth.jwt()->'app_metadata'->>'site_admin')='true') with check ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
