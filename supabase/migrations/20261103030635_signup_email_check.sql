-- A single-email boolean lookup implements the requested duplicate signup message.
-- No user identifiers, email lists, or profile data are returned.
create or replace function public.sf_email_registered(candidate text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if candidate is null or length(candidate) > 254 or candidate !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email';
  end if;
  return exists (select 1 from auth.users where lower(email) = lower(trim(candidate)));
end;
$$;
revoke all on function public.sf_email_registered(text) from public;
grant execute on function public.sf_email_registered(text) to anon, authenticated;
