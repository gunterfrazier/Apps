begin;

-- Staff are provisioned by the platform operator, independently of church memberships.
create table if not exists public.support_staff (
  user_id uuid primary key references auth.users on delete cascade
);
create table if not exists public.support_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  church_id text references public.churches on delete cascade,
  access_key uuid unique not null default gen_random_uuid(),
  agent_id uuid references public.support_staff on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  closed_at timestamptz
);
create table if not exists public.family_invites (
  access_key uuid primary key default gen_random_uuid(),
  sender uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null default (now() + interval '1 day')
);
create table if not exists public.family_links (
  person_a uuid references auth.users on delete cascade,
  person_b uuid references auth.users on delete cascade,
  primary key (person_a, person_b),
  check (person_a < person_b)
);
alter table public.support_staff enable row level security;
alter table public.support_grants enable row level security;
alter table public.family_invites enable row level security;
alter table public.family_links enable row level security;
revoke all on public.support_staff, public.support_grants, public.family_invites, public.family_links from anon, authenticated;

create or replace function public.help_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from support_staff where user_id = auth.uid())
$$;

drop policy if exists "support accounts stay outside churches" on public.memberships;
create policy "support accounts stay outside churches" on public.memberships
  as restrictive for insert to authenticated with check (not public.help_is_staff());
drop policy if exists "support accounts do not register churches" on public.churches;
create policy "support accounts do not register churches" on public.churches
  as restrictive for insert to authenticated with check (not public.help_is_staff());

create or replace function public.help_create(c text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_key uuid;
begin
  if auth.uid() is null or help_is_staff() or (c is not null and not is_primary(c)) then
    raise exception 'You cannot grant access for this account';
  end if;
  insert into support_grants(owner_id, church_id) values (auth.uid(), c) returning access_key into new_key;
  return new_key;
end $$;

create or replace function public.help_redeem(code uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare grant_id uuid;
begin
  if not help_is_staff() then raise exception 'Support access required'; end if;
  update support_grants set agent_id = auth.uid()
    where access_key = code and agent_id is null and closed_at is null and expires_at > now()
    returning id into grant_id;
  if grant_id is null then raise exception 'This key is unavailable'; end if;
  return grant_id;
end $$;

create or replace function public.help_cases() returns table(id uuid, church_id text, expires_at timestamptz, redeemed boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.church_id, g.expires_at, g.agent_id is not null
    from support_grants g
    where (g.owner_id = auth.uid() or (help_is_staff() and g.agent_id = auth.uid()))
      and g.closed_at is null and g.expires_at > now()
    order by g.created_at desc
$$;

create or replace function public.help_close(case_id uuid) returns void
language sql security definer set search_path = public as $$
  update support_grants set closed_at = now()
    where id = case_id and closed_at is null
      and (owner_id = auth.uid() or (help_is_staff() and agent_id = auth.uid()))
$$;

-- Return operational metadata only. The support identity never impersonates another account.
create or replace function public.help_diagnostics(case_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g support_grants;
begin
  if not help_is_staff() then raise exception 'Support access required'; end if;
  select * into g from support_grants
    where id = case_id and agent_id = auth.uid() and closed_at is null and expires_at > now()
    for share;
  if not found then raise exception 'This access has ended'; end if;
  if g.church_id is not null then
    if not exists(select 1 from churches where id = g.church_id and owner_id = g.owner_id) then
      raise exception 'Church ownership changed';
    end if;
    return (select jsonb_build_object('church', c.name, 'handle', c.handle, 'created', c.created_at,
      'modules', c.data->'modules',
      'campuses', (select count(*) from locations where church_id = c.id))
      from churches c where c.id = g.church_id);
  end if;
  return jsonb_build_object('account', g.owner_id,
    'name', (select name from profiles where id = g.owner_id),
    'churchRoles', coalesce((select jsonb_agg(jsonb_build_object('church', c.name, 'role', m.role_key))
      from memberships m join churches c on c.id = m.church_id where m.user_id = g.owner_id), '[]'::jsonb));
end $$;

create or replace function public.family_create_invite() returns uuid
language plpgsql security definer set search_path = public as $$
declare new_key uuid;
begin
  if auth.uid() is null or help_is_staff() then raise exception 'Personal account required'; end if;
  delete from family_invites where sender = auth.uid();
  insert into family_invites(sender) values(auth.uid()) returning access_key into new_key;
  return new_key;
end $$;

create or replace function public.family_accept(code uuid) returns void
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  if auth.uid() is null or help_is_staff() then raise exception 'Personal account required'; end if;
  delete from family_invites where access_key = code and sender <> auth.uid() and expires_at > now()
    returning sender into other;
  if other is null or exists(select 1 from support_staff where user_id = other) then
    raise exception 'This invitation is unavailable';
  end if;
  insert into family_links values(least(other, auth.uid()), greatest(other, auth.uid())) on conflict do nothing;
end $$;

create or replace function public.family_accounts() returns table(id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name from family_links l
  join profiles p on p.id = case when l.person_a = auth.uid() then l.person_b else l.person_a end
  where auth.uid() in (l.person_a, l.person_b) order by p.name
$$;

create or replace function public.family_unlink(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from family_links where person_a = least(other, auth.uid()) and person_b = greatest(other, auth.uid())
    and auth.uid() in (person_a, person_b)
$$;

revoke execute on function public.help_is_staff(), public.help_create(text), public.help_redeem(uuid), public.help_cases(),
  public.help_close(uuid), public.help_diagnostics(uuid), public.family_create_invite(), public.family_accept(uuid),
  public.family_accounts(), public.family_unlink(uuid) from public, anon;
grant execute on function public.help_is_staff(), public.help_create(text), public.help_redeem(uuid), public.help_cases(),
  public.help_close(uuid), public.help_diagnostics(uuid), public.family_create_invite(), public.family_accept(uuid),
  public.family_accounts(), public.family_unlink(uuid) to authenticated;
commit;
