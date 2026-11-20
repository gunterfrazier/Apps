-- Veritas Logos accounts (project "Veritas Logos", fxssrtexwwmqrxzlgnmy).
-- Each signed-in reader's saved data: one row per document, their settings and notes as "profile" and one row per
-- study guide as "guide-<id>". Only the owner can see or change their rows.
create table public.user_docs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  doc_id text not null check (char_length(doc_id) between 1 and 200),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_id),
  -- One document holds at most 2 MB.
  constraint user_docs_doc_size check (pg_column_size(data) <= 2097152)
);

comment on table public.user_docs is 'Veritas Logos: each reader''s saved settings, notes and guides, private to that reader.';

alter table public.user_docs enable row level security;

create policy "Readers see their own documents" on public.user_docs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Readers add their own documents" on public.user_docs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Readers change their own documents" on public.user_docs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Readers remove their own documents" on public.user_docs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Visitors who aren't signed in get nothing at all.
revoke all on public.user_docs from anon;
revoke all on public.user_docs from authenticated;
grant select, insert, update, delete on public.user_docs to authenticated;

-- Keeps one account from filling the free database: at most 2,000 documents and 25 MB in all per reader.
create or replace function public.user_docs_limits()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  docs integer;
  total bigint;
begin
  new.updated_at := now();
  select count(*), coalesce(sum(pg_column_size(d.data)), 0)
    into docs, total
    from public.user_docs d
   where d.user_id = new.user_id and d.doc_id <> new.doc_id;
  if docs >= 2000 then
    raise exception 'This account already holds 2,000 saved items.' using errcode = 'P0001', hint = 'veritas:too-many';
  end if;
  if total + pg_column_size(new.data) > 26214400 then
    raise exception 'This account''s saved data is over 25 MB.' using errcode = 'P0001', hint = 'veritas:too-big';
  end if;
  return new;
end;
$$;

create trigger user_docs_limits
  before insert or update on public.user_docs
  for each row execute function public.user_docs_limits();

-- Deletes the signed-in reader's account. Their documents go with it (on delete cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.user_docs_limits() from public, anon, authenticated;
