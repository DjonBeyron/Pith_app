-- Белый список имён событий журнала вынесен из константы log_events в таблицу
-- app_event_names: новое событие клиента больше не требует миграции. log_events читает
-- список одним запросом в начале вызова; пустой/недоступный список = ничего не пишем, не падаем.
-- Читает и правит только админ (и service_role); функция — SECURITY DEFINER, ей RLS не мешает.
--
-- Как пополнить список БЕЗ миграции (Supabase → SQL Editor или админ-сессия):
--   insert into public.app_event_names (name, note) values ('my_new_event', 'зачем')
--     on conflict (name) do nothing;
-- Убрать:  delete from public.app_event_names where name = 'my_new_event';
-- Остальное поведение log_events — как в 20261014120000_app_events_guard.sql.

create table if not exists public.app_event_names (
  name       text primary key,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.app_event_names is
  'Белый список имён событий для log_events. Имени нет здесь = событие тихо отбрасывается. Правит админ без миграции.';

alter table public.app_event_names enable row level security;

drop policy if exists app_event_names_select_admin on public.app_event_names;
create policy app_event_names_select_admin
  on public.app_event_names for select to authenticated using (public.is_admin());

drop policy if exists app_event_names_insert_admin on public.app_event_names;
create policy app_event_names_insert_admin
  on public.app_event_names for insert to authenticated with check (public.is_admin());

drop policy if exists app_event_names_update_admin on public.app_event_names;
create policy app_event_names_update_admin
  on public.app_event_names for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists app_event_names_delete_admin on public.app_event_names;
create policy app_event_names_delete_admin
  on public.app_event_names for delete to authenticated using (public.is_admin());

revoke all on table public.app_event_names from anon, authenticated;
grant select, insert, update, delete on table public.app_event_names to authenticated;
grant all on table public.app_event_names to service_role;

-- Текущий список из 20261014120000 + новые scene_task_*.
insert into public.app_event_names (name) values
  ('app_open'), ('push_open'), ('signup'), ('paywall_view'), ('paywall_click'),
  ('feed_view'), ('feed_learn'),
  ('lesson_start'), ('lesson_finish'), ('lesson_abandon'), ('lesson_answer'),
  ('review_start'), ('review_answer'), ('review_finish'), ('review_abandon'),
  ('feed_catch_start'), ('feed_catch_next'), ('feed_catch_check'), ('feed_catch_hint'),
  ('feed_catch_reveal'), ('feed_catch_later'), ('feed_catch_finish'),
  ('feed_swipe'), ('feed_pause'), ('feed_sound'), ('feed_slow'), ('feed_phrase_open'),
  ('feed_reveal'), ('feed_recall_answer'), ('feed_like'), ('feed_save'), ('feed_repost'),
  ('feed_search'), ('feed_filter'), ('say_attempt'),
  ('say_phrase_start'), ('say_phrase_result'), ('say_phrase_skip'),
  ('scene_task_shown'), ('scene_task_answer'), ('scene_task_skip')
on conflict (name) do nothing;

create or replace function public.log_events(
  p_anon_id text,
  p_app_version text,
  p_events jsonb
) returns int
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid     uuid := auth.uid();
  v_recent  int;
  v_day     int;
  v_room    int;
  v_n       int;
  v_allowed text[];
begin
  if p_anon_id is null or p_anon_id !~ '^[A-Za-z0-9-]{8,64}$' then return 0; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;

  -- Белый список имён — из таблицы app_event_names; пусто → писать нечего.
  select array_agg(name) into v_allowed from public.app_event_names;
  if v_allowed is null then return 0; end if;

  -- Анти-спам: 600 за 10 минут и 3000 за сутки с одного устройства.
  -- Пишем не больше, чем осталось до потолка (пачка режется, а не отбрасывается целиком).
  select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
    into v_recent, v_day
  from public.app_events
  where anon_id = p_anon_id and created_at > now() - interval '24 hours';
  v_room := least(50, 600 - v_recent, 3000 - v_day);
  if v_room <= 0 then return 0; end if;

  insert into public.app_events (user_id, anon_id, session_id, name, props, app_version, client_at)
  select v_uid,
         p_anon_id,
         left(e->>'sid', 64),
         e->>'name',
         case when pg_column_size(public.sanitize_event_props(e->'props')) <= 2048
              then public.sanitize_event_props(e->'props') end,
         left(p_app_version, 32),
         case when abs(extract(epoch from (now() - public.try_client_time(e->>'at')))) <= 7 * 86400
              then public.try_client_time(e->>'at') end
  from (
    select value as e
    from jsonb_array_elements(p_events) with ordinality o(value, i)
    where jsonb_typeof(value) = 'object'
      and (value->>'name') = any(v_allowed)
    order by i
    limit v_room
  ) x;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.log_events(text, text, jsonb) from public;
grant execute on function public.log_events(text, text, jsonb) to anon, authenticated;
