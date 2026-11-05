-- =====================================================================
--  Tournament Matchmaker — Supabase database setup
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--
--  BEFORE RUNNING: change the starting staff PIN on the line marked
--  >>> STAFF PIN <<< near the bottom. You can change it later in the app.
--
--  Safe to re-run: it drops and recreates everything (this ERASES data).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Remove old versions of the app's functions (their inputs may have changed).
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'staff\_%' or p.proname like 'player\_%' or p.proname like '\_%')
  loop execute 'drop function ' || f.sig || ' cascade'; end loop;
end $$;

drop table if exists public.matches        cascade;
drop table if exists public.player_secrets cascade;
drop table if exists public.players        cascade;
drop table if exists public.teams          cascade;
drop table if exists public.staff_secret   cascade;
drop table if exists public.settings       cascade;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------
create table public.settings (
  id            int primary key default 1 check (id = 1),
  event_name    text not null default 'Tournament Night',
  stations      int  not null default 4 check (stations between 1 and 30),
  station_label text not null default 'Station',
  team_size     int  not null default 4 check (team_size between 1 and 12),
  updated_at    timestamptz not null default now()
);

-- Hidden from the public: hashed staff PIN + brute-force lockout.
create table public.staff_secret (
  id           int primary key default 1 check (id = 1),
  pin_hash     text not null,
  failed       int  not null default 0,
  locked_until timestamptz
);

create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index teams_name_uq on public.teams (lower(trim(name)));

create table public.players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 40),
  team_id       uuid references public.teams(id) on delete set null,
  weapons       text not null default '' check (length(weapons) <= 80),
  checked_in    boolean not null default true,
  ready_since   timestamptz not null default now(), -- when they last became available
  games         int not null default 0,
  wins          int not null default 0,
  losses        int not null default 0,
  points_for    int not null default 0,
  points_against int not null default 0,
  created_at    timestamptz not null default now()
);
create unique index players_name_uq on public.players (lower(trim(name)));

-- Hidden from the public: the secret each phone uses to manage its own player.
create table public.player_secrets (
  player_id uuid primary key references public.players(id) on delete cascade,
  token     text not null
);

create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  station     int  not null,
  status      text not null default 'active' check (status in ('active','done')),
  a_name      text not null,
  b_name      text not null,
  a_team_id   uuid,
  b_team_id   uuid,
  a_players   uuid[] not null,
  b_players   uuid[] not null,
  a_names     text[] not null,
  b_names     text[] not null,
  score_a     int,
  score_b     int,
  winner      text check (winner in ('a','b')),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create unique index matches_one_active_per_station
  on public.matches (station) where status = 'active';

-- ---------------------------------------------------------------------
--  Row-level security: everyone may READ the public tables,
--  nobody may write directly. All writes go through the functions below.
-- ---------------------------------------------------------------------
alter table public.settings       enable row level security;
alter table public.staff_secret   enable row level security;
alter table public.teams          enable row level security;
alter table public.players        enable row level security;
alter table public.player_secrets enable row level security;
alter table public.matches        enable row level security;

create policy "public read" on public.settings for select using (true);
create policy "public read" on public.teams    for select using (true);
create policy "public read" on public.players  for select using (true);
create policy "public read" on public.matches  for select using (true);
-- staff_secret and player_secrets: no policies = no access from the app.

-- ---------------------------------------------------------------------
--  Helpers (internal)
-- ---------------------------------------------------------------------
create or replace function public._pin_ok(p_pin text)
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare s public.staff_secret;
begin
  select * into s from public.staff_secret where id = 1 for update;
  if s.locked_until is not null and s.locked_until > now() then
    return false;
  end if;
  if s.pin_hash = crypt(coalesce(p_pin,''), s.pin_hash) then
    update public.staff_secret set failed = 0, locked_until = null where id = 1;
    return true;
  end if;
  update public.staff_secret
     set failed = case when failed + 1 >= 8 then 0 else failed + 1 end,
         locked_until = case when failed + 1 >= 8 then now() + interval '5 minutes' else locked_until end
   where id = 1;
  return false;
end $$;

-- Returns a standard "bad PIN" response without raising, so the failed
-- attempt counter is saved.
create or replace function public._pin_fail()
returns jsonb language plpgsql security definer
set search_path = public as $$
declare lk timestamptz;
begin
  select locked_until into lk from public.staff_secret where id = 1;
  if lk is not null and lk > now() then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong PINs. Staff access is locked for a few minutes.');
  end if;
  return jsonb_build_object('ok', false, 'error', 'Wrong staff PIN.');
end $$;

-- Find a team by name (case-insensitive) or create it.
create or replace function public._team_for(p_team_id uuid, p_team_name text)
returns uuid language plpgsql security definer
set search_path = public as $$
declare tid uuid; nm text := nullif(trim(coalesce(p_team_name,'')), '');
begin
  if p_team_id is not null then
    if not exists (select 1 from public.teams where id = p_team_id) then
      raise exception 'That team no longer exists.';
    end if;
    return p_team_id;
  end if;
  if nm is null then return null; end if;
  select id into tid from public.teams where lower(trim(name)) = lower(nm);
  if tid is null then
    insert into public.teams(name) values (nm) returning id into tid;
  end if;
  return tid;
end $$;

create or replace function public._team_full_check(p_team_id uuid, p_player uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare cap int; n int;
begin
  if p_team_id is null then return; end if;
  select team_size * 2 into cap from public.settings where id = 1;  -- room for subs
  select count(*) into n from public.players
   where team_id = p_team_id and (p_player is null or id <> p_player);
  if n >= cap then
    raise exception 'That team already has % players on its roster.', n;
  end if;
end $$;

create or replace function public._in_active_match(p_player uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.matches
                  where status = 'active'
                    and (p_player = any(a_players) or p_player = any(b_players)));
$$;

-- ---------------------------------------------------------------------
--  Player functions (no PIN; each phone holds its own secret token)
-- ---------------------------------------------------------------------
create or replace function public.player_check_in(p_name text, p_team_id uuid default null, p_team_name text default null, p_weapons text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare pid uuid; tok text; tid uuid; nm text := trim(coalesce(p_name,''));
begin
  if length(nm) < 1 or length(nm) > 40 then
    raise exception 'Enter a name between 1 and 40 characters.';
  end if;
  if exists (select 1 from public.players where lower(trim(name)) = lower(nm)) then
    raise exception 'The name "%" is already taken. Add a last initial, or ask staff to link your phone if it''s you.', nm;
  end if;
  tid := public._team_for(p_team_id, p_team_name);
  perform public._team_full_check(tid, null);
  if length(trim(coalesce(p_weapons,''))) > 80 then raise exception 'Keep weapons under 80 characters.'; end if;
  insert into public.players(name, team_id, weapons) values (nm, tid, trim(coalesce(p_weapons,''))) returning id into pid;
  tok := encode(gen_random_bytes(18), 'hex');
  insert into public.player_secrets values (pid, tok);
  return jsonb_build_object('ok', true, 'player_id', pid, 'token', tok);
end $$;

create or replace function public._token_ok(p_player uuid, p_token text)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.player_secrets where player_id = p_player and token = p_token);
$$;

create or replace function public.player_set_status(p_player uuid, p_token text, p_checked_in boolean)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._token_ok(p_player, p_token) then
    raise exception 'This phone is no longer linked to that player. Ask staff for help.';
  end if;
  update public.players
     set checked_in = p_checked_in,
         ready_since = case when p_checked_in and not checked_in then now() else ready_since end
   where id = p_player;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.player_set_team(p_player uuid, p_token text, p_team_id uuid default null, p_team_name text default null)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare tid uuid;
begin
  if not public._token_ok(p_player, p_token) then
    raise exception 'This phone is no longer linked to that player. Ask staff for help.';
  end if;
  if public._in_active_match(p_player) then
    raise exception 'You can change teams after your current match.';
  end if;
  tid := public._team_for(p_team_id, p_team_name);
  perform public._team_full_check(tid, p_player);
  update public.players set team_id = tid where id = p_player;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.player_set_weapons(p_player uuid, p_token text, p_weapons text)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._token_ok(p_player, p_token) then
    raise exception 'This phone is no longer linked to that player. Ask staff for help.';
  end if;
  if length(trim(coalesce(p_weapons,''))) > 80 then raise exception 'Keep weapons under 80 characters.'; end if;
  update public.players set weapons = trim(coalesce(p_weapons,'')) where id = p_player;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Staff functions (every call checks the staff PIN)
-- ---------------------------------------------------------------------
create or replace function public.staff_verify(p_pin text)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_add_player(p_pin text, p_name text, p_team_id uuid default null, p_team_name text default null, p_weapons text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare r jsonb;
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  r := public.player_check_in(p_name, p_team_id, p_team_name, p_weapons);
  return r - 'token';
end $$;

create or replace function public.staff_update_player(p_pin text, p_player uuid, p_name text, p_team_id uuid, p_team_name text, p_checked_in boolean, p_weapons text default null)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare tid uuid; nm text := trim(coalesce(p_name,''));
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  if length(nm) < 1 or length(nm) > 40 then raise exception 'Enter a name between 1 and 40 characters.'; end if;
  if exists (select 1 from public.players where lower(trim(name)) = lower(nm) and id <> p_player) then
    raise exception 'Another player is already named "%".', nm;
  end if;
  tid := public._team_for(p_team_id, p_team_name);
  perform public._team_full_check(tid, p_player);
  if length(trim(coalesce(p_weapons,''))) > 80 then raise exception 'Keep weapons under 80 characters.'; end if;
  update public.players
     set name = nm, team_id = tid,
         weapons = case when p_weapons is null then weapons else trim(p_weapons) end,
         ready_since = case when p_checked_in and not checked_in then now() else ready_since end,
         checked_in = p_checked_in
   where id = p_player;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_set_checked_in(p_pin text, p_player uuid, p_checked_in boolean)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  update public.players
     set ready_since = case when p_checked_in and not checked_in then now() else ready_since end,
         checked_in = p_checked_in
   where id = p_player;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_delete_player(p_pin text, p_player uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  if public._in_active_match(p_player) then
    raise exception 'Finish or cancel this player''s current match first.';
  end if;
  delete from public.players where id = p_player;
  return jsonb_build_object('ok', true);
end $$;

-- Gives staff a link a player can open to manage themselves on their phone.
create or replace function public.staff_phone_link(p_pin text, p_player uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare tok text;
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'Player not found.'; end if;
  tok := encode(gen_random_bytes(18), 'hex');
  insert into public.player_secrets values (p_player, tok)
    on conflict (player_id) do update set token = excluded.token;  -- old phone is unlinked
  return jsonb_build_object('ok', true, 'token', tok);
end $$;

create or replace function public.staff_save_team(p_pin text, p_team uuid, p_name text)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare nm text := trim(coalesce(p_name,'')); tid uuid;
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  if length(nm) < 1 or length(nm) > 40 then raise exception 'Enter a team name between 1 and 40 characters.'; end if;
  if exists (select 1 from public.teams where lower(trim(name)) = lower(nm) and id is distinct from p_team) then
    raise exception 'A team named "%" already exists.', nm;
  end if;
  if p_team is null then
    insert into public.teams(name) values (nm) returning id into tid;
  else
    update public.teams set name = nm where id = p_team; tid := p_team;
  end if;
  return jsonb_build_object('ok', true, 'team_id', tid);
end $$;

create or replace function public.staff_delete_team(p_pin text, p_team uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  delete from public.teams where id = p_team;  -- players become free agents
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_start_match(
  p_pin text, p_station int,
  p_a_name text, p_a_team uuid, p_a_players uuid[],
  p_b_name text, p_b_team uuid, p_b_players uuid[])
returns jsonb language plpgsql security definer
set search_path = public as $$
declare mid uuid; st public.settings; bad text; an text[]; bn text[];
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  select * into st from public.settings where id = 1;
  if p_station < 1 or p_station > st.stations then raise exception 'Pick a % between 1 and %.', lower(st.station_label), st.stations; end if;
  if exists (select 1 from public.matches where status='active' and station = p_station) then
    raise exception '% % already has a match in progress.', st.station_label, p_station;
  end if;
  if coalesce(array_length(p_a_players,1),0) = 0 or coalesce(array_length(p_b_players,1),0) = 0 then
    raise exception 'Each side needs at least one player.';
  end if;
  if p_a_players && p_b_players then raise exception 'A player can''t be on both sides.'; end if;
  select string_agg(p.name, ', ') into bad from public.players p
   where p.id = any(p_a_players || p_b_players) and public._in_active_match(p.id);
  if bad is not null then raise exception 'Already playing: %', bad; end if;
  if (select count(*) from public.players where id = any(p_a_players || p_b_players))
     <> cardinality(p_a_players) + cardinality(p_b_players) then
    raise exception 'One of the selected players no longer exists. Refresh and try again.';
  end if;
  select array_agg(name order by name) into an from public.players where id = any(p_a_players);
  select array_agg(name order by name) into bn from public.players where id = any(p_b_players);
  insert into public.matches(station, a_name, b_name, a_team_id, b_team_id, a_players, b_players, a_names, b_names)
  values (p_station, coalesce(nullif(trim(p_a_name),''),'Side A'), coalesce(nullif(trim(p_b_name),''),'Side B'),
          p_a_team, p_b_team, p_a_players, p_b_players, an, bn)
  returning id into mid;
  return jsonb_build_object('ok', true, 'match_id', mid);
end $$;

create or replace function public.staff_record_result(p_pin text, p_match uuid, p_score_a int, p_score_b int, p_winner text)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare m public.matches;
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match not found.'; end if;
  if m.status <> 'active' then raise exception 'This match already has a result.'; end if;
  if p_winner not in ('a','b') then raise exception 'Pick a winner.'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'Scores can''t be negative.'; end if;
  update public.matches set status='done', score_a=p_score_a, score_b=p_score_b, winner=p_winner, finished_at=now()
   where id = p_match;
  update public.players set games = games + 1,
         wins   = wins   + (p_winner = 'a')::int,
         losses = losses + (p_winner = 'b')::int,
         points_for = points_for + p_score_a, points_against = points_against + p_score_b,
         ready_since = now()
   where id = any(m.a_players);
  update public.players set games = games + 1,
         wins   = wins   + (p_winner = 'b')::int,
         losses = losses + (p_winner = 'a')::int,
         points_for = points_for + p_score_b, points_against = points_against + p_score_a,
         ready_since = now()
   where id = any(m.b_players);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_cancel_match(p_pin text, p_match uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  delete from public.matches where id = p_match and status = 'active';
  return jsonb_build_object('ok', true);
end $$;

-- Undo a recorded result (removes the match and reverses everyone's stats).
create or replace function public.staff_void_result(p_pin text, p_match uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare m public.matches;
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  select * into m from public.matches where id = p_match and status = 'done' for update;
  if not found then raise exception 'Finished match not found.'; end if;
  update public.players set games = greatest(games - 1, 0),
         wins   = greatest(wins   - (m.winner = 'a')::int, 0),
         losses = greatest(losses - (m.winner = 'b')::int, 0),
         points_for = points_for - m.score_a, points_against = points_against - m.score_b
   where id = any(m.a_players);
  update public.players set games = greatest(games - 1, 0),
         wins   = greatest(wins   - (m.winner = 'b')::int, 0),
         losses = greatest(losses - (m.winner = 'a')::int, 0),
         points_for = points_for - m.score_b, points_against = points_against - m.score_a
   where id = any(m.b_players);
  delete from public.matches where id = p_match;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_update_settings(p_pin text, p_event_name text, p_stations int, p_station_label text, p_team_size int)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  if exists (select 1 from public.matches where status='active' and station > p_stations) then
    raise exception 'Finish the matches on % above % first.', lower(p_station_label), p_stations;
  end if;
  update public.settings set
    event_name = coalesce(nullif(trim(p_event_name),''), event_name),
    stations = p_stations,
    station_label = coalesce(nullif(trim(p_station_label),''), station_label),
    team_size = p_team_size,
    updated_at = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_change_pin(p_pin text, p_new_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  if length(coalesce(p_new_pin,'')) < 4 then raise exception 'Use at least 4 characters for the PIN.'; end if;
  update public.staff_secret set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- p_mode: 'results' = clear matches + stats, keep players & teams
--         'everything' = start a brand-new event
create or replace function public.staff_reset(p_pin text, p_mode text)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  delete from public.matches where true;
  if p_mode = 'everything' then
    delete from public.players where true;
    delete from public.teams where true;
  else
    update public.players set games=0, wins=0, losses=0, points_for=0, points_against=0, ready_since=now() where true;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Only the public functions are callable from the app.
revoke execute on function public._pin_ok(text), public._pin_fail(), public._team_for(uuid,text),
  public._team_full_check(uuid,uuid), public._in_active_match(uuid), public._token_ok(uuid,text)
  from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public._pin_ok(text), public._pin_fail(), public._team_for(uuid,text),
      public._team_full_check(uuid,uuid), public._in_active_match(uuid), public._token_ok(uuid,text)
      from anon, authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Starting data
-- ---------------------------------------------------------------------
insert into public.settings (id) values (1);

-- >>> STAFF PIN <<<  Change '2468' to your own PIN before running.
insert into public.staff_secret (id, pin_hash) values (1, extensions.crypt('2468', extensions.gen_salt('bf')));

-- Live updates on every phone.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.settings, public.teams, public.players, public.matches;
  end if;
end $$;
