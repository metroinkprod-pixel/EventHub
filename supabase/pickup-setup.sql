-- =====================================================================
--  ORGANIZED PICKUP GAMES (random teams, winner stays on)
--
--  Run this in the SAME Supabase project as the run of show + check-in
--  (the one in site-config.js "ops"), AFTER ops-setup.sql.
--  SQL Editor > New query > paste this file > Run. Safe to re-run: it keeps players and results.
--
--  How it works
--   * Players join from their phone with a name and weapon. They go into the line.
--   * When a station is free and 2 teams' worth of players are in line, the people who
--     have waited longest are shuffled into two random teams, and the match starts.
--   * Players report the result from their phones (best of 5 by default).
--   * Losers go to the back of the line. Winners stay on the station and the next
--     players in line (randomly teamed) challenge them. (Optional cap on wins in a row.)
--   * Staff (hub PIN, staff level) can change settings, cancel a match, fix a result,
--     or remove a player. The owner can reset.
--
--  Everything here is public to READ (it's what players see on the page);
--  all changes go through the functions below.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pug_settings (
  id            int primary key default 1 check (id = 1),
  stations      int  not null default 2 check (stations between 1 and 30),
  station_label text not null default 'Station',
  team_size     int  not null default 4 check (team_size between 1 and 8),
  best_of       int  not null default 5 check (best_of in (1, 3, 5, 7)),
  max_streak    int  not null default 0 check (max_streak between 0 and 20),  -- 0 = winners stay on forever
  opens         text not null default '',   -- "17:00" or '' (page shows "opens at" before this)
  closes        text not null default '',   -- "20:00" or ''
  open_date     text not null default '',   -- "2026-11-07" or '' (only open that day)
  updated_at    timestamptz not null default now()
);
insert into public.pug_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.pug_players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 30),
  weapon      text not null default '' check (length(weapon) <= 40),
  status      text not null default 'queue' check (status in ('queue', 'playing', 'away')),
  queued_at   timestamptz not null default now(),   -- place in line
  games       int not null default 0,
  wins        int not null default 0,
  losses      int not null default 0,
  best_streak int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists pug_players_name_uq on public.pug_players (lower(trim(name)));

-- The phone "key" for each player (never readable from the page)
create table if not exists public.pug_tokens (
  player_id uuid primary key references public.pug_players(id) on delete cascade,
  token     text not null
);

create table if not exists public.pug_matches (
  id          uuid primary key default gen_random_uuid(),
  station     int  not null,
  status      text not null check (status in ('waiting', 'active', 'done', 'cancelled')),
  a_name      text not null,                 -- team color name, e.g. "Orange"
  b_name      text not null default '',
  a_players   uuid[] not null,
  b_players   uuid[] not null default '{}',
  a_names     text[] not null,
  b_names     text[] not null default '{}',
  a_streak    int  not null default 0,       -- wins in a row Team A already has on this station
  score_a     int,
  score_b     int,
  winner      text check (winner in ('a', 'b')),
  reported_by text not null default '',
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz,
  updated_at  timestamptz not null default now()
);
create index if not exists pug_matches_status on public.pug_matches (status, station);

alter table public.pug_settings enable row level security;
alter table public.pug_players  enable row level security;
alter table public.pug_tokens   enable row level security;
alter table public.pug_matches  enable row level security;
drop policy if exists "pug read" on public.pug_settings; create policy "pug read" on public.pug_settings for select using (true);
drop policy if exists "pug read" on public.pug_players;  create policy "pug read" on public.pug_players  for select using (true);
drop policy if exists "pug read" on public.pug_matches;  create policy "pug read" on public.pug_matches  for select using (true);
grant select on public.pug_settings, public.pug_players, public.pug_matches to anon, authenticated;
revoke all on public.pug_tokens from anon, authenticated;

-- ---------------------------------------------------------------------
--  Helpers
-- ---------------------------------------------------------------------
create or replace function public.pug__err(p text)
returns jsonb language sql immutable as $$ select jsonb_build_object('ok', false, 'error', p) $$;

create or replace function public.pug__token_ok(p_player uuid, p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pug_tokens where player_id = p_player and token = coalesce(p_token, ''))
$$;

-- Team color names (Splatoon ink colors). Never the same as p_not.
create or replace function public.pug__color(p_not text)
returns text language sql volatile as $$
  select c from unnest(array['Orange','Blue','Pink','Green','Purple','Yellow','Turquoise','Red']) c
   where c <> coalesce(p_not, '') order by random() limit 1
$$;

-- The n players who have waited longest, in random order.
-- Who plays next is fair (first in line, first in); who you're teamed with is random.
create or replace function public.pug__pick(n int, p_pool int)
returns uuid[] language sql volatile security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from (
    select id from (select id from pug_players where status = 'queue' order by queued_at limit p_pool) pool
     order by random() limit n
  ) x
$$;

create or replace function public.pug__names(p_ids uuid[])
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(name order by name), '{}') from pug_players where id = any(p_ids)
$$;

-- Fill free stations and challenger spots from the line. Called after every change.
create or replace function public.pug__fill()
returns void language plpgsql security definer set search_path = public as $$
declare s pug_settings; m pug_matches; st int; b uuid[]; ab uuid[]; a uuid[]; ca text;
begin
  perform pg_advisory_xact_lock(731100);
  select * into s from pug_settings where id = 1;
  -- 1) winners waiting on a station get the next random challengers
  for m in select * from pug_matches where status = 'waiting' and station <= s.stations order by station loop
    exit when (select count(*) from pug_players where status = 'queue') < s.team_size;
    b := pug__pick(s.team_size, s.team_size);
    update pug_players set status = 'playing', updated_at = now() where id = any(b);
    update pug_matches set status = 'active', b_players = b, b_names = pug__names(b), b_name = pug__color(m.a_name),
           started_at = now(), updated_at = now()
     where id = m.id;
  end loop;
  -- 2) empty stations get two new random teams
  for st in 1 .. s.stations loop
    continue when exists (select 1 from pug_matches where station = st and status in ('waiting', 'active'));
    exit when (select count(*) from pug_players where status = 'queue') < s.team_size * 2;
    ab := pug__pick(s.team_size * 2, s.team_size * 2);       -- longest-waiting, shuffled
    a := ab[1 : s.team_size];
    b := ab[s.team_size + 1 : s.team_size * 2];
    update pug_players set status = 'playing', updated_at = now() where id = any(ab);
    ca := pug__color(null);
    insert into pug_matches (station, status, a_name, b_name, a_players, b_players, a_names, b_names, started_at)
    values (st, 'active', ca, pug__color(ca), a, b, pug__names(a), pug__names(b), now());
  end loop;
end $$;

-- Record a result. Losers go to the back of the line; winners hold the station
-- (unless they hit the wins-in-a-row cap, then they go back in line too).
create or replace function public.pug__finish(p_match uuid, p_winner text, p_w int, p_l int, p_by text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s pug_settings; m pug_matches; need int; winners uuid[]; losers uuid[]; wnames text[]; wname text; streak int;
begin
  perform pg_advisory_xact_lock(731100);
  select * into s from pug_settings where id = 1;
  select * into m from pug_matches where id = p_match for update;
  if m.id is null then return pug__err('not_found'); end if;
  if m.status <> 'active' then return pug__err('already_reported'); end if;
  if p_winner not in ('a', 'b') then return pug__err('bad_winner'); end if;
  need := s.best_of / 2 + 1;
  if coalesce(p_w, -1) <> need or coalesce(p_l, -1) < 0 or p_l >= need then return pug__err('bad_score'); end if;

  if p_winner = 'a' then winners := m.a_players; losers := m.b_players; wnames := m.a_names; wname := m.a_name; streak := m.a_streak + 1;
  else winners := m.b_players; losers := m.a_players; wnames := m.b_names; wname := m.b_name; streak := 1; end if;

  update pug_matches set status = 'done', winner = p_winner,
         score_a = case when p_winner = 'a' then p_w else p_l end, score_b = case when p_winner = 'b' then p_w else p_l end,
         reported_by = left(coalesce(p_by, ''), 60), finished_at = now(), updated_at = now()
   where id = m.id;
  update pug_players set games = games + 1, wins = wins + 1, best_streak = greatest(best_streak, streak), updated_at = now() where id = any(winners);
  update pug_players set games = games + 1, losses = losses + 1, status = 'queue', queued_at = now(), updated_at = now() where id = any(losers);

  if s.max_streak > 0 and streak >= s.max_streak then
    update pug_players set status = 'queue', queued_at = now() + interval '1 second', updated_at = now() where id = any(winners);
  else
    insert into pug_matches (station, status, a_name, a_players, a_names, a_streak)
    values (m.station, 'waiting', wname, winners, (select coalesce(array_agg(name order by name), '{}') from pug_players where id = any(winners)), streak);
  end if;
  perform pug__fill();
  return jsonb_build_object('ok', true, 'streak', streak);
end $$;

-- A player on a team that's waiting for challengers leaves: the waiting team breaks up
-- and the others go to the front of the line.
create or replace function public.pug__break_waiting(p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m pug_matches;
begin
  for m in select * from pug_matches where status = 'waiting' and p_player = any(a_players) loop
    update pug_matches set status = 'cancelled', updated_at = now() where id = m.id;
    update pug_players set status = 'queue', queued_at = now() - interval '1 hour', updated_at = now()
     where id = any(m.a_players) and id <> p_player;
  end loop;
end $$;

create or replace function public.pug__in_active(p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pug_matches where status = 'active' and (p_player = any(a_players) or p_player = any(b_players)))
$$;

-- ---------------------------------------------------------------------
--  Player functions (from their phone)
-- ---------------------------------------------------------------------
create or replace function public.pug_join(p_name text, p_weapon text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_name text := trim(coalesce(p_name, '')); v_id uuid; v_token text := encode(gen_random_bytes(16), 'hex');
begin
  if length(v_name) < 1 then return pug__err('empty'); end if;
  if length(v_name) > 30 then return pug__err('too_long'); end if;
  if exists (select 1 from pug_players where lower(trim(name)) = lower(v_name)) then return pug__err('name_taken'); end if;
  insert into pug_players (name, weapon) values (v_name, left(trim(coalesce(p_weapon, '')), 40)) returning id into v_id;
  insert into pug_tokens (player_id, token) values (v_id, v_token);
  perform pug__fill();
  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token);
end $$;

-- p_status: 'queue' (join the line) or 'away' (take a break). p_weapon: new weapon, or null to keep.
create or replace function public.pug_set(p_player uuid, p_token text, p_status text, p_weapon text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p pug_players;
begin
  if not pug__token_ok(p_player, p_token) then return pug__err('bad_token'); end if;
  perform pg_advisory_xact_lock(731100);
  select * into p from pug_players where id = p_player for update;
  if p_weapon is not null then update pug_players set weapon = left(trim(p_weapon), 40), updated_at = now() where id = p.id; end if;
  if p_status is not null and p_status <> p.status then
    if p_status not in ('queue', 'away') then return pug__err('bad_status'); end if;
    if pug__in_active(p.id) then return pug__err('in_match'); end if;
    perform pug__break_waiting(p.id);
    update pug_players set status = p_status, queued_at = case when p_status = 'queue' then now() else queued_at end, updated_at = now() where id = p.id;
  end if;
  perform pug__fill();
  return jsonb_build_object('ok', true);
end $$;

-- Leave for good (frees the name). Not allowed mid-match.
create or replace function public.pug_leave(p_player uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not pug__token_ok(p_player, p_token) then return pug__err('bad_token'); end if;
  perform pg_advisory_xact_lock(731100);
  if pug__in_active(p_player) then return pug__err('in_match'); end if;
  perform pug__break_waiting(p_player);
  delete from pug_players where id = p_player;
  perform pug__fill();
  return jsonb_build_object('ok', true);
end $$;

-- Report your match: p_winner 'a' or 'b', games won by the winner and by the loser (e.g. 3 and 1).
create or replace function public.pug_report(p_player uuid, p_token text, p_match uuid, p_winner text, p_w int, p_l int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m pug_matches; who text;
begin
  if not pug__token_ok(p_player, p_token) then return pug__err('bad_token'); end if;
  select * into m from pug_matches where id = p_match;
  if m.id is null then return pug__err('not_found'); end if;
  if not (p_player = any(m.a_players) or p_player = any(m.b_players)) then return pug__err('not_in_match'); end if;
  select name into who from pug_players where id = p_player;
  return pug__finish(p_match, p_winner, p_w, p_l, who);
end $$;

-- ---------------------------------------------------------------------
--  Staff functions (hub PIN). Settings / fixes: staff. Reset: owner.
-- ---------------------------------------------------------------------
create or replace function public.pug_staff_settings(p_pin text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := ops__need(p_pin, 'staff'); t text := '^([01]?[0-9]|2[0-3]):[0-5][0-9]$';
begin
  if r <> 'ok' then return pug__err(r); end if;
  if p ? 'opens' and coalesce(p->>'opens', '') <> '' and (p->>'opens') !~ t then return pug__err('bad_time'); end if;
  if p ? 'closes' and coalesce(p->>'closes', '') <> '' and (p->>'closes') !~ t then return pug__err('bad_time'); end if;
  if p ? 'open_date' and coalesce(p->>'open_date', '') <> '' and (p->>'open_date') !~ '^\d{4}-\d{2}-\d{2}$' then return pug__err('bad_date'); end if;
  update pug_settings set
    stations      = case when p ? 'stations' then greatest(1, least(30, (p->>'stations')::int)) else stations end,
    station_label = case when p ? 'station_label' and trim(coalesce(p->>'station_label', '')) <> '' then left(trim(p->>'station_label'), 20) else station_label end,
    team_size     = case when p ? 'team_size' then greatest(1, least(8, (p->>'team_size')::int)) else team_size end,
    best_of       = case when p ? 'best_of' and (p->>'best_of')::int in (1, 3, 5, 7) then (p->>'best_of')::int else best_of end,
    max_streak    = case when p ? 'max_streak' then greatest(0, least(20, (p->>'max_streak')::int)) else max_streak end,
    opens         = case when p ? 'opens' then coalesce(p->>'opens', '') else opens end,
    closes        = case when p ? 'closes' then coalesce(p->>'closes', '') else closes end,
    open_date     = case when p ? 'open_date' then coalesce(p->>'open_date', '') else open_date end,
    updated_at    = now()
  where id = 1;
  perform pug__fill();
  return jsonb_build_object('ok', true);
end $$;

-- Cancel a match (or a team waiting for challengers): everyone goes to the FRONT of the line.
create or replace function public.pug_staff_cancel(p_pin text, p_match uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := ops__need(p_pin, 'staff'); m pug_matches;
begin
  if r <> 'ok' then return pug__err(r); end if;
  perform pg_advisory_xact_lock(731100);
  select * into m from pug_matches where id = p_match for update;
  if m.id is null or m.status not in ('waiting', 'active') then return pug__err('not_found'); end if;
  update pug_matches set status = 'cancelled', updated_at = now() where id = m.id;
  update pug_players set status = 'queue', queued_at = now() - interval '1 hour', updated_at = now()
   where id = any(m.a_players || m.b_players) and status = 'playing';
  perform pug__fill();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pug_staff_result(p_pin text, p_match uuid, p_winner text, p_w int, p_l int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := ops__need(p_pin, 'staff');
begin
  if r <> 'ok' then return pug__err(r); end if;
  return pug__finish(p_match, p_winner, p_w, p_l, 'staff');
end $$;

-- p_action: 'queue' | 'away' | 'remove'. Not allowed while they're in a match (cancel the match first).
create or replace function public.pug_staff_player(p_pin text, p_player uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := ops__need(p_pin, 'staff');
begin
  if r <> 'ok' then return pug__err(r); end if;
  perform pg_advisory_xact_lock(731100);
  if pug__in_active(p_player) then return pug__err('in_match'); end if;
  perform pug__break_waiting(p_player);
  if p_action = 'remove' then delete from pug_players where id = p_player;
  elsif p_action in ('queue', 'away') then
    update pug_players set status = p_action, queued_at = case when p_action = 'queue' then now() else queued_at end, updated_at = now() where id = p_player;
  else return pug__err('bad_action'); end if;
  perform pug__fill();
  return jsonb_build_object('ok', true);
end $$;

-- Owner only. 'results': clear matches and stats, keep players (all back in line). 'everything': remove everyone.
create or replace function public.pug_staff_reset(p_pin text, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := ops__need(p_pin, 'owner');
begin
  if r <> 'ok' then return pug__err(r); end if;
  perform pg_advisory_xact_lock(731100);
  if p_mode = 'results' then
    delete from pug_matches;
    update pug_players set games = 0, wins = 0, losses = 0, best_streak = 0,
           status = case when status = 'away' then 'away' else 'queue' end, queued_at = now(), updated_at = now();
  elsif p_mode = 'everything' then
    delete from pug_matches; delete from pug_players;
  else return pug__err('bad_mode'); end if;
  perform pug__fill();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Permissions + live updates
-- ---------------------------------------------------------------------
revoke all on function public.pug__token_ok(uuid, text), public.pug__pick(int, int), public.pug__names(uuid[]), public.pug__fill(),
  public.pug__finish(uuid, text, int, int, text), public.pug__break_waiting(uuid), public.pug__in_active(uuid) from public, anon, authenticated;
grant execute on function public.pug_join(text, text), public.pug_set(uuid, text, text, text), public.pug_leave(uuid, text),
  public.pug_report(uuid, text, uuid, text, int, int), public.pug_staff_settings(text, jsonb), public.pug_staff_cancel(text, uuid),
  public.pug_staff_result(text, uuid, text, int, int), public.pug_staff_player(text, uuid, text), public.pug_staff_reset(text, text)
  to anon, authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.pug_settings; exception when others then null; end;
  begin alter publication supabase_realtime add table public.pug_players;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.pug_matches;  exception when others then null; end;
end $$;
