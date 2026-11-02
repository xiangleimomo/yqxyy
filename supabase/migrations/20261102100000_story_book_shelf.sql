-- Separate shelf state also covers bundled books: deleting an override alone
-- would otherwise make the bundled book reappear.
create table public.story_book_shelf (
 id text primary key check (id ~ '^[a-z0-9-]{1,100}$'),
 deleted boolean not null default false,
 sort_order integer not null default 2147483647 check (sort_order >= 0)
);
alter table public.story_book_shelf enable row level security;
revoke all on public.story_book_shelf from anon, authenticated;
grant select on public.story_book_shelf to anon, authenticated;
grant insert, update on public.story_book_shelf to authenticated;
create policy shelf_public_read on public.story_book_shelf for select to anon, authenticated using (true);
create policy shelf_admin_insert on public.story_book_shelf for insert to authenticated
 with check ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
create policy shelf_admin_update on public.story_book_shelf for update to authenticated
 using ((select auth.jwt()->'app_metadata'->>'site_admin')='true')
 with check ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
