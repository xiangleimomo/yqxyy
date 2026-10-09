-- Only the project owner should run this in Supabase Dashboard > SQL Editor.
-- Replace the placeholder with the exact email of an ALREADY REGISTERED account.
-- Do not put passwords or service_role keys in this file or website source.
do $$
declare
  target_email text := 'REPLACE_WITH_REGISTERED_EMAIL';
  changed integer;
begin
  if target_email = 'REPLACE_WITH_REGISTERED_EMAIL' then
    raise exception 'Replace target_email with the registered administrator email first';
  end if;
  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"site_admin":true}'::jsonb
    where lower(email) = lower(trim(target_email));
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Expected exactly one registered account, found %; no change was saved', changed;
  end if;
end $$;
