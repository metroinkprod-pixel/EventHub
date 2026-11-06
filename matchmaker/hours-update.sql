-- =====================================================================
--  Scrims opening hours (adds to the EXISTING free play database).
--  Run this in the matchmaker's Supabase project: SQL Editor > New query > Run.
--  Safe to run more than once. It does NOT touch players, teams or matches.
--
--  DO NOT re-run schema.sql to get this: schema.sql starts a brand-new,
--  empty database.
-- =====================================================================

alter table public.settings add column if not exists opens     text not null default '';  -- "17:00" or ''
alter table public.settings add column if not exists closes    text not null default '';  -- "20:00" or ''
alter table public.settings add column if not exists open_date text not null default '';  -- "2026-11-07" or ''

create or replace function public.staff_set_hours(p_pin text, p_opens text, p_closes text, p_date text)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if not public._pin_ok(p_pin) then return public._pin_fail(); end if;
  if coalesce(p_opens, '') !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' and coalesce(p_opens, '') <> '' then raise exception 'Opening time should look like 17:00.'; end if;
  if coalesce(p_closes, '') !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' and coalesce(p_closes, '') <> '' then raise exception 'Closing time should look like 20:00.'; end if;
  if coalesce(p_date, '') !~ '^\d{4}-\d{2}-\d{2}$' and coalesce(p_date, '') <> '' then raise exception 'Date should look like 2026-11-07.'; end if;
  update public.settings set opens = coalesce(p_opens, ''), closes = coalesce(p_closes, ''), open_date = coalesce(p_date, ''), updated_at = now()
   where id = 1;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.staff_set_hours(text, text, text, text) to anon, authenticated;
