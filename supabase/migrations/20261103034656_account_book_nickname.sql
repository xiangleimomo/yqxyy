begin;
drop index if exists public.book_nickname_unique;
create index book_nickname_search on public.book_profiles(lower(nickname));
create function sf_books_private.sync_account_nickname() returns trigger
language plpgsql security definer set search_path='' as $$
declare nick text:=trim(new.raw_user_meta_data->>'display_name');
begin
 if nick is null or nick='' then return new; end if;
 if length(nick) not between 2 and 40 then raise exception '昵称需要 2–40 个字'; end if;
 insert into public.book_profiles(user_id,nickname) values(new.id,nick)
 on conflict(user_id) do update set nickname=excluded.nickname;
 update public.story_books set uploader_nickname=nick where owner_id=new.id;
 return new;
end $$;
revoke all on function sf_books_private.sync_account_nickname() from public,anon,authenticated;
-- Display names are cosmetic metadata; permissions still use app_metadata and family roles.
update auth.users u set raw_user_meta_data=coalesce(u.raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('display_name',p.nickname)
from public.book_profiles p where p.user_id=u.id and coalesce(trim(u.raw_user_meta_data->>'display_name'),'')='';
create trigger sf_account_nickname after insert or update of raw_user_meta_data on auth.users
for each row execute function sf_books_private.sync_account_nickname();
insert into public.book_profiles(user_id,nickname)
select id,trim(raw_user_meta_data->>'display_name') from auth.users
where length(trim(raw_user_meta_data->>'display_name')) between 2 and 40
on conflict(user_id) do update set nickname=excluded.nickname;
update public.story_books b set uploader_nickname=p.nickname from public.book_profiles p where b.owner_id=p.user_id;
commit;
