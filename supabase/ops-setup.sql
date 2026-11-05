-- =====================================================================
--  Event Hub (staff tools): Supabase setup for Run of Show + Check-in
--
--  Use a SEPARATE Supabase project from the matchmaker. (The matchmaker's
--  schema.sql deletes functions starting with "_", "staff_" or "player_",
--  so the two must never share a project.) Everything here is prefixed
--  "ops_" as an extra safety measure.
--
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  BEFORE RUNNING: set the staff PIN on the line marked >>> STAFF PIN <<<.
--
--  Safe to re-run for updates: it keeps your data (tables use
--  "create if not exists"). To wipe everything, use the in-app reset
--  buttons or drop the ops_ tables yourself.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------
create table if not exists public.ops_secret (
  id           int primary key default 1 check (id = 1),
  pin_hash     text not null,
  failed       int not null default 0,
  locked_until timestamptz
);

-- One row per run-of-show block
create table if not exists public.ops_ros (
  id         uuid primary key default gen_random_uuid(),
  section    text not null default 'day' check (section in ('before', 'day', 'after')),
  start_min  int check (start_min between 0 and 2879),  -- minutes after midnight (null = no time)
  end_min    int check (end_min between 0 and 2879),
  category   text not null default '',
  task       text not null,
  owner      text not null default '',
  notes      text not null default '',
  status     text not null default 'todo' check (status in ('todo', 'live', 'done', 'skipped')),
  added      boolean not null default false,               -- not from the original sheet
  source     text not null default 'manual' check (source in ('sheet', 'manual')),
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  grp           text not null default '',      -- wave / pool / bracket, e.g. "Wave A"
  captain       text not null default '',
  contact       text not null default '',      -- Discord handle, phone, etc.
  switch2       text not null default '',      -- '', 'bringing', 'needs', 'lent'
  notes         text not null default '',
  status        text not null default 'expected' check (status in ('expected', 'checked_in', 'no_show')),
  checked_in_at timestamptz,
  paid          boolean not null default false,
  source        text not null default 'manual',
  sort          int not null default 0,
  updated_at    timestamptz not null default now()
);
create unique index if not exists ops_teams_name_key on public.ops_teams (lower(name));

create table if not exists public.ops_players (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.ops_teams(id) on delete cascade,
  name       text not null,
  present    boolean not null default false,
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists ops_players_team on public.ops_players (team_id);

-- ---------------------------------------------------------------------
--  Security: anyone with the link can VIEW; all changes go through the
--  PIN-checked functions below.
-- ---------------------------------------------------------------------
alter table public.ops_secret  enable row level security;
alter table public.ops_ros     enable row level security;
alter table public.ops_teams   enable row level security;
alter table public.ops_players enable row level security;

drop policy if exists "ops view" on public.ops_ros;
create policy "ops view" on public.ops_ros for select using (true);
drop policy if exists "ops view" on public.ops_teams;
create policy "ops view" on public.ops_teams for select using (true);
drop policy if exists "ops view" on public.ops_players;
create policy "ops view" on public.ops_players for select using (true);
revoke all on public.ops_secret from anon, authenticated;

-- >>> STAFF PIN <<<  Change 'CHANGE-ME-123456' to your PIN (6+ digits recommended).
-- Only sets the PIN the first time. To change it later, use the app or ops_change_pin().
insert into public.ops_secret (id, pin_hash)
values (1, extensions.crypt('1115', extensions.gen_salt('bf')))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
--  PIN check: 8 wrong PINs locks edits for 5 minutes.
--  Returns 'ok' | 'bad_pin' | 'locked'. Never raises, so failures are saved.
-- ---------------------------------------------------------------------
create or replace function public.ops__pin(p_pin text)
returns text language plpgsql security definer
set search_path = public, extensions as $$
declare s public.ops_secret;
begin
  select * into s from public.ops_secret where id = 1 for update;
  if s.id is null then return 'bad_pin'; end if;
  if s.locked_until is not null and s.locked_until > now() then return 'locked'; end if;
  if s.pin_hash = crypt(coalesce(p_pin, ''), s.pin_hash) then
    update public.ops_secret set failed = 0, locked_until = null where id = 1;
    return 'ok';
  end if;
  update public.ops_secret
     set failed = case when failed + 1 >= 8 then 0 else failed + 1 end,
         locked_until = case when failed + 1 >= 8 then now() + interval '5 minutes' else locked_until end
   where id = 1;
  return 'bad_pin';
end $$;
revoke all on function public.ops__pin(text) from public, anon, authenticated;

create or replace function public.ops__err(p text)
returns jsonb language sql immutable as $$ select jsonb_build_object('ok', false, 'error', p) $$;

create or replace function public.ops_verify(p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin);
begin
  if r <> 'ok' then return ops__err(r); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ops_change_pin(p_pin text, p_new_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin);
begin
  if r <> 'ok' then return ops__err(r); end if;
  if length(coalesce(p_new_pin, '')) < 4 then return ops__err('pin_too_short'); end if;
  update ops_secret set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Run of show
-- ---------------------------------------------------------------------
create or replace function public.ops__ros_fields(t public.ops_ros, f jsonb)
returns public.ops_ros language plpgsql immutable as $$
begin
  if f ? 'section'   then t.section   := coalesce(nullif(f->>'section', ''), 'day'); end if;
  if f ? 'start_min' then t.start_min := (f->>'start_min')::int; end if;
  if f ? 'end_min'   then t.end_min   := (f->>'end_min')::int; end if;
  if f ? 'category'  then t.category  := left(coalesce(f->>'category', ''), 60); end if;
  if f ? 'task' and trim(coalesce(f->>'task', '')) <> '' then t.task := left(trim(f->>'task'), 400); end if;
  if f ? 'owner'     then t.owner     := left(coalesce(f->>'owner', ''), 200); end if;
  if f ? 'notes'     then t.notes     := left(coalesce(f->>'notes', ''), 1000); end if;
  if f ? 'status'    then t.status    := coalesce(nullif(f->>'status', ''), 'todo'); end if;
  if f ? 'added'     then t.added     := coalesce((f->>'added')::boolean, false); end if;
  if f ? 'sort'      then t.sort      := coalesce((f->>'sort')::int, 0); end if;
  return t;
end $$;

-- Add (no id, or an id that doesn't exist yet) or update (existing id; only the fields sent change)
create or replace function public.ops_ros_save(p_pin text, p_row jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin); t ops_ros; v_id uuid := nullif(p_row->>'id', '')::uuid;
begin
  if r <> 'ok' then return ops__err(r); end if;
  if v_id is not null then select * into t from ops_ros where id = v_id for update; end if;
  if t.id is null then
    if trim(coalesce(p_row->>'task', '')) = '' then return ops__err('empty'); end if;
    t := ops__ros_fields(row(coalesce(v_id, gen_random_uuid()), 'day', null, null, '', 'x', '', '', 'todo', false, 'manual',
                             (select coalesce(max(sort), 0) + 1 from ops_ros), now())::ops_ros, p_row);
    insert into ops_ros values (t.*) returning * into t;
  else
    t := ops__ros_fields(t, p_row);
    t.updated_at := now();
    update ops_ros set section = t.section, start_min = t.start_min, end_min = t.end_min, category = t.category,
      task = t.task, owner = t.owner, notes = t.notes, status = t.status, added = t.added, sort = t.sort,
      updated_at = t.updated_at
    where id = t.id returning * into t;
  end if;
  return jsonb_build_object('ok', true, 'row', to_jsonb(t));
end $$;

create or replace function public.ops_ros_delete(p_pin text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin);
begin
  if r <> 'ok' then return ops__err(r); end if;
  delete from ops_ros where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Import rows pasted from Google Sheets.
-- p_mode 'replace': deletes rows that came from a previous sheet import, keeps tasks added in the app.
-- p_mode 'append' : adds the rows to what's there.
create or replace function public.ops_ros_import(p_pin text, p_rows jsonb, p_mode text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin); x jsonb; n int := 0; base int;
begin
  if r <> 'ok' then return ops__err(r); end if;
  if jsonb_typeof(p_rows) <> 'array' then return ops__err('bad_rows'); end if;
  if p_mode = 'replace' then delete from ops_ros where source = 'sheet'; end if;
  select coalesce(max(sort), 0) into base from ops_ros;
  for x in select * from jsonb_array_elements(p_rows) loop
    if trim(coalesce(x->>'task', '')) = '' then continue; end if;
    n := n + 1;
    insert into ops_ros (section, start_min, end_min, category, task, owner, notes, status, added, source, sort)
    values (coalesce(nullif(x->>'section', ''), 'day'), (x->>'start_min')::int, (x->>'end_min')::int,
            left(coalesce(x->>'category', ''), 60), left(trim(x->>'task'), 400), left(coalesce(x->>'owner', ''), 200),
            left(coalesce(x->>'notes', ''), 1000), coalesce(nullif(x->>'status', ''), 'todo'),
            coalesce((x->>'added')::boolean, false), 'sheet', base + n);
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- Running late? Push every unfinished block that starts at/after p_from by p_delta minutes (negative pulls earlier).
create or replace function public.ops_ros_shift(p_pin text, p_from int, p_delta int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin); n int;
begin
  if r <> 'ok' then return ops__err(r); end if;
  if abs(coalesce(p_delta, 0)) > 600 then return ops__err('too_big'); end if;
  update ops_ros set
    start_min = greatest(0, least(2879, start_min + p_delta)),
    end_min   = case when end_min is null then null else greatest(0, least(2879, end_min + p_delta)) end,
    updated_at = now()
  where section = 'day' and start_min is not null and start_min >= p_from and status in ('todo', 'live');
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

create or replace function public.ops_ros_reset(p_pin text, p_mode text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin);
begin
  if r <> 'ok' then return ops__err(r); end if;
  if p_mode = 'statuses' then update ops_ros set status = 'todo', updated_at = now() where status <> 'todo';
  elsif p_mode = 'everything' then delete from ops_ros;
  else return ops__err('bad_mode'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Check-in
-- ---------------------------------------------------------------------
create or replace function public.ops_team_save(p_pin text, p_team jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin); t ops_teams; v_id uuid := nullif(p_team->>'id', '')::uuid; v_name text := trim(coalesce(p_team->>'name', ''));
begin
  if r <> 'ok' then return ops__err(r); end if;
  if v_id is not null then select * into t from ops_teams where id = v_id for update; end if;
  if t.id is null then
    if v_name = '' then return ops__err('empty'); end if;
    if exists (select 1 from ops_teams where lower(name) = lower(v_name)) then return ops__err('name_taken'); end if;
    insert into ops_teams (name, grp, captain, contact, switch2, notes, paid, sort)
    values (left(v_name, 80), left(coalesce(p_team->>'grp', ''), 40), left(coalesce(p_team->>'captain', ''), 80),
            left(coalesce(p_team->>'contact', ''), 120), left(coalesce(p_team->>'switch2', ''), 20),
            left(coalesce(p_team->>'notes', ''), 500), coalesce((p_team->>'paid')::boolean, false),
            (select coalesce(max(sort), 0) + 1 from ops_teams))
    returning * into t;
  else
    if p_team ? 'name' and v_name <> '' and lower(v_name) <> lower(t.name)
       and exists (select 1 from ops_teams where lower(name) = lower(v_name) and id <> t.id) then
      return ops__err('name_taken');
    end if;
    update ops_teams set
      name    = case when p_team ? 'name' and v_name <> '' then left(v_name, 80) else name end,
      grp     = case when p_team ? 'grp' then left(coalesce(p_team->>'grp', ''), 40) else grp end,
      captain = case when p_team ? 'captain' then left(coalesce(p_team->>'captain', ''), 80) else captain end,
      contact = case when p_team ? 'contact' then left(coalesce(p_team->>'contact', ''), 120) else contact end,
      switch2 = case when p_team ? 'switch2' then left(coalesce(p_team->>'switch2', ''), 20) else switch2 end,
      notes   = case when p_team ? 'notes' then left(coalesce(p_team->>'notes', ''), 500) else notes end,
      paid    = case when p_team ? 'paid' then coalesce((p_team->>'paid')::boolean, false) else paid end,
      status  = case when p_team ? 'status' then p_team->>'status' else status end,
      checked_in_at = case when p_team ? 'status' then
                        case when p_team->>'status' = 'checked_in' then coalesce(checked_in_at, now()) else null end
                      else checked_in_at end,
      updated_at = now()
    where id = t.id returning * into t;
  end if;
  return jsonb_build_object('ok', true, 'team', to_jsonb(t));
end $$;

create or replace function public.ops_team_delete(p_pin text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin);
begin
  if r <> 'ok' then return ops__err(r); end if;
  delete from ops_teams where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Check a team in or out. Checking in also marks the chosen players present (p_players = list of ids, or null for all).
create or replace function public.ops_team_checkin(p_pin text, p_id uuid, p_status text, p_players jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin);
begin
  if r <> 'ok' then return ops__err(r); end if;
  if p_status not in ('expected', 'checked_in', 'no_show') then return ops__err('bad_status'); end if;
  update ops_teams set status = p_status,
    checked_in_at = case when p_status = 'checked_in' then coalesce(checked_in_at, now()) else null end,
    updated_at = now()
  where id = p_id;
  if p_status = 'checked_in' then
    update ops_players set present = true, updated_at = now()
     where team_id = p_id and (p_players is null or id::text in (select jsonb_array_elements_text(p_players)));
  elsif p_status = 'expected' then
    update ops_players set present = false, updated_at = now() where team_id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ops_player_save(p_pin text, p_player jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin); p ops_players; v_id uuid := nullif(p_player->>'id', '')::uuid;
begin
  if r <> 'ok' then return ops__err(r); end if;
  if v_id is null then
    if trim(coalesce(p_player->>'name', '')) = '' then return ops__err('empty'); end if;
    insert into ops_players (team_id, name, present, sort)
    values ((p_player->>'team_id')::uuid, left(trim(p_player->>'name'), 80), coalesce((p_player->>'present')::boolean, false),
            (select coalesce(max(sort), 0) + 1 from ops_players where team_id = (p_player->>'team_id')::uuid))
    returning * into p;
  else
    update ops_players set
      name    = case when p_player ? 'name' and trim(coalesce(p_player->>'name', '')) <> '' then left(trim(p_player->>'name'), 80) else name end,
      present = case when p_player ? 'present' then coalesce((p_player->>'present')::boolean, false) else present end,
      updated_at = now()
    where id = v_id returning * into p;
  end if;
  return jsonb_build_object('ok', true, 'player', to_jsonb(p));
end $$;

create or replace function public.ops_player_delete(p_pin text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin);
begin
  if r <> 'ok' then return ops__err(r); end if;
  delete from ops_players where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Import teams from a Google Sheet paste or from start.gg.
-- p_teams: [{name, grp, captain, contact, switch2, notes, paid, players: ["a","b",...]}]
-- p_mode 'merge'  : adds new teams, fills in details and missing players on existing ones (matched by name). Keeps check-ins.
-- p_mode 'replace': deletes all teams and players first.
create or replace function public.ops_teams_import(p_pin text, p_teams jsonb, p_mode text, p_source text default 'sheet')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin); x jsonb; pn text; t ops_teams; added int := 0; updated int := 0; base int;
begin
  if r <> 'ok' then return ops__err(r); end if;
  if jsonb_typeof(p_teams) <> 'array' then return ops__err('bad_rows'); end if;
  if p_mode = 'replace' then delete from ops_teams; end if;
  select coalesce(max(sort), 0) into base from ops_teams;
  for x in select * from jsonb_array_elements(p_teams) loop
    if trim(coalesce(x->>'name', '')) = '' then continue; end if;
    t := null;
    select * into t from ops_teams where lower(name) = lower(trim(x->>'name'));
    if t.id is null then
      base := base + 1; added := added + 1;
      insert into ops_teams (name, grp, captain, contact, switch2, notes, paid, source, sort)
      values (left(trim(x->>'name'), 80), left(coalesce(x->>'grp', ''), 40), left(coalesce(x->>'captain', ''), 80),
              left(coalesce(x->>'contact', ''), 120), left(coalesce(x->>'switch2', ''), 20), left(coalesce(x->>'notes', ''), 500),
              coalesce((x->>'paid')::boolean, false), left(coalesce(p_source, 'sheet'), 20), base)
      returning * into t;
    else
      updated := updated + 1;
      update ops_teams set
        grp     = coalesce(nullif(x->>'grp', ''), grp),
        captain = coalesce(nullif(x->>'captain', ''), captain),
        contact = coalesce(nullif(x->>'contact', ''), contact),
        switch2 = coalesce(nullif(x->>'switch2', ''), switch2),
        notes   = coalesce(nullif(x->>'notes', ''), notes),
        paid    = paid or coalesce((x->>'paid')::boolean, false),
        updated_at = now()
      where id = t.id;
    end if;
    if jsonb_typeof(x->'players') = 'array' then
      for pn in select trim(v) from jsonb_array_elements_text(x->'players') v loop
        if pn <> '' and not exists (select 1 from ops_players where team_id = t.id and lower(name) = lower(pn)) then
          insert into ops_players (team_id, name, sort)
          values (t.id, left(pn, 80), (select coalesce(max(sort), 0) + 1 from ops_players where team_id = t.id));
        end if;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'added', added, 'updated', updated);
end $$;

create or replace function public.ops_checkin_reset(p_pin text, p_mode text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__pin(p_pin);
begin
  if r <> 'ok' then return ops__err(r); end if;
  if p_mode = 'statuses' then
    update ops_teams set status = 'expected', checked_in_at = null, updated_at = now();
    update ops_players set present = false, updated_at = now();
  elsif p_mode = 'everything' then delete from ops_teams;
  else return ops__err('bad_mode'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Who can call what
-- ---------------------------------------------------------------------
revoke all on function public.ops__ros_fields(public.ops_ros, jsonb) from public, anon, authenticated;
grant execute on function
  public.ops_verify(text), public.ops_change_pin(text, text),
  public.ops_ros_save(text, jsonb), public.ops_ros_delete(text, uuid), public.ops_ros_import(text, jsonb, text),
  public.ops_ros_shift(text, int, int), public.ops_ros_reset(text, text),
  public.ops_team_save(text, jsonb), public.ops_team_delete(text, uuid), public.ops_team_checkin(text, uuid, text, jsonb),
  public.ops_player_save(text, jsonb), public.ops_player_delete(text, uuid),
  public.ops_teams_import(text, jsonb, text, text), public.ops_checkin_reset(text, text)
to anon, authenticated;

-- ---------------------------------------------------------------------
--  Live updates
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.ops_ros;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ops_teams;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ops_players; exception when duplicate_object then null; end;
end $$;
