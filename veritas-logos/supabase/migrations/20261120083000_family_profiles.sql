-- Child profiles belong to the existing adult account.
create table public.family_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 32),
  age_group text not null check (age_group in ('young', 'middle', 'teen')),
  theme text not null check (theme in ('ocean', 'orchard', 'grove')),
  created_at timestamptz not null default now()
);

create index family_profiles_owner on public.family_profiles (owner_id, created_at, id);
alter table public.family_profiles enable row level security;

revoke all on public.family_profiles from public, anon, authenticated;
grant select, delete on public.family_profiles to authenticated;
grant insert (nickname, age_group, theme), update (nickname, age_group, theme)
  on public.family_profiles to authenticated;

create policy "Adult accounts manage their own family profiles"
  on public.family_profiles for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
