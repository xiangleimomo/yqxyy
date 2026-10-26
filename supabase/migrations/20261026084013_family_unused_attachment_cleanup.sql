create function sf_family_private.file_unused(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and split_part(p_name,'/',1)=auth.uid()::text and not exists(
 select 1 from sf_family_private.assignments a where
 exists(select 1 from jsonb_array_elements(a.attachments) f where f->>'path'=p_name) or
 exists(select 1 from jsonb_array_elements(coalesce(a.submission->'attachments','[]')) f where f->>'path'=p_name));
$$;
revoke all on function sf_family_private.file_unused(text) from public,anon;
grant execute on function sf_family_private.file_unused(text) to authenticated;
create policy family_homework_remove_unused on storage.objects for delete to authenticated
using(bucket_id='family-homework' and sf_family_private.file_unused(name));
