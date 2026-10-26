create policy family_rpc_only on sf_family_private.assignments as restrictive for all to authenticated using(false) with check(false);
create policy family_rpc_only on sf_family_private.catalog as restrictive for all to authenticated using(false) with check(false);
create policy family_rpc_only on sf_family_private.events as restrictive for all to authenticated using(false) with check(false);
create policy family_rpc_only on sf_family_private.invites as restrictive for all to authenticated using(false) with check(false);
create policy family_rpc_only on sf_family_private.links as restrictive for all to authenticated using(false) with check(false);
create policy family_rpc_only on sf_family_private.profiles as restrictive for all to authenticated using(false) with check(false);
