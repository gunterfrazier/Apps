-- Version 24: NFC tag links. A tag holds ourfaithfulchurch.com/t/<code>; the church points the code anywhere and can
-- change it later. Tag links are "tagLinks" records; taps are counted per day in tag_taps by tag_open(), which anyone
-- (signed in or not) calls when a tag is tapped.
-- Run after upgrade-23.sql. New projects get the same rules from schema.sql.
begin;

create or replace function can_manage_tags(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_primary(c) or can(c, 'qr.create') or can(c, 'manage.church')
$$;
revoke execute on function can_manage_tags(text) from public, anon;
grant execute on function can_manage_tags(text) to authenticated;

drop policy if exists "read tag links" on records;
create policy "read tag links" on records for select to authenticated using (
  kind = 'tagLinks' and (is_primary(church_id) or church_live(church_id)) and can_manage_tags(church_id));
drop policy if exists "add tag links" on records;
create policy "add tag links" on records for insert to authenticated with check (
  kind = 'tagLinks' and (is_primary(church_id) or church_live(church_id)) and can_manage_tags(church_id));
drop policy if exists "change tag links" on records;
create policy "change tag links" on records for update to authenticated
  using (kind = 'tagLinks' and can_manage_tags(church_id)) with check (kind = 'tagLinks' and can_manage_tags(church_id));
drop policy if exists "remove tag links" on records;
create policy "remove tag links" on records for delete to authenticated using (kind = 'tagLinks' and can_manage_tags(church_id));

-- A code opens one thing across the whole platform.
create unique index if not exists records_tag_code on records (lower(data->>'code')) where kind = 'tagLinks';

create table if not exists tag_taps (
  code text not null,
  church_id text not null references churches(id) on delete cascade,
  day date not null,
  taps integer not null default 0,
  primary key (code, day)
);
create index if not exists tag_taps_church on tag_taps (church_id, day);
alter table tag_taps enable row level security;
drop policy if exists "read tag taps" on tag_taps;
create policy "read tag taps" on tag_taps for select to authenticated using (can_manage_tags(church_id));

-- Opening a tag: where it goes, and one more tap. Nothing comes back for a paused link or a church that isn't live.
create or replace function public.tag_open(tag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r records%rowtype;
begin
  tag := lower(btrim(coalesce(tag, '')));
  if tag !~ '^[a-z0-9-]{3,30}$' then return null; end if;
  select * into r from records where kind = 'tagLinks' and lower(data->>'code') = tag limit 1;
  if not found or not church_live(r.church_id) or coalesce((r.data->>'paused')::boolean, false) then return null; end if;
  insert into tag_taps (code, church_id, day, taps) values (tag, r.church_id, current_date, 1)
    on conflict (code, day) do update set taps = tag_taps.taps + 1;
  return jsonb_build_object('target', r.data->>'target', 'churchId', r.church_id);
end $$;
revoke execute on function public.tag_open(text) from public;
grant execute on function public.tag_open(text) to anon, authenticated;

-- Whether a code is in use anywhere (a church can only see its own tag links).
create or replace function public.tag_code_taken(tag text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from records where kind = 'tagLinks' and lower(data->>'code') = lower(btrim(coalesce(tag, ''))))
$$;
revoke execute on function public.tag_code_taken(text) from public, anon;
grant execute on function public.tag_code_taken(text) to authenticated;

commit;
