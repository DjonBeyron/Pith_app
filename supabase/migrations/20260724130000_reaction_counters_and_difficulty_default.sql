-- Счётчики «сохранили в закладки» / «сделали репост» на модуль (лента) +
-- дефолт сложности «Легко» вместо NULL (серая иконка), пока не набралось
-- голосов. Идемпотентно — можно накатывать повторно.

-- ── Денормализованные счётчики на curricula (как difficulty/difficulty_votes) ──
alter table public.curricula
  add column if not exists save_count   integer not null default 0,
  add column if not exists repost_count integer not null default 0;

-- module_bookmarks закрыт RLS-политикой «только свои строки» (приватность
-- закладок) — публичный агрегат считаем триггером с SECURITY DEFINER, сырые
-- строки чужих закладок наружу не отдаём.
create or replace function public.recalc_module_save_count() returns trigger
    language plpgsql security definer
    as $$
declare
  v_module text := coalesce(new.module_id, old.module_id);
  v_cnt    int;
begin
  select count(*) into v_cnt from public.module_bookmarks where module_id = v_module;
  update public.curricula set save_count = v_cnt where id = v_module;
  return null;
end;
$$;

drop trigger if exists module_bookmarks_recalc on public.module_bookmarks;
create trigger module_bookmarks_recalc
  after insert or delete on public.module_bookmarks
  for each row execute function public.recalc_module_save_count();

-- Разовый пересчёт для уже существующих закладок
update public.curricula c set save_count = (
  select count(*) from public.module_bookmarks b where b.module_id = c.id
);

-- ── Репосты: новая таблица событий (один юзер может репостнуть несколько
-- раз — это не тумблер как лайк/закладка, а счётчик кликов «Репост») ──
create table if not exists public.module_reposts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  module_id  text not null references public.curricula(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

alter table public.module_reposts enable row level security;

drop policy if exists "module_reposts_select_all" on public.module_reposts;
create policy "module_reposts_select_all" on public.module_reposts for select using (true);

drop policy if exists "module_reposts_insert_own" on public.module_reposts;
create policy "module_reposts_insert_own" on public.module_reposts for insert to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.module_reposts to authenticated;
grant select on public.module_reposts to anon;

create or replace function public.recalc_module_repost_count() returns trigger
    language plpgsql security definer
    as $$
declare
  v_module text := coalesce(new.module_id, old.module_id);
  v_cnt    int;
begin
  select count(*) into v_cnt from public.module_reposts where module_id = v_module;
  update public.curricula set repost_count = v_cnt where id = v_module;
  return null;
end;
$$;

drop trigger if exists module_reposts_recalc on public.module_reposts;
create trigger module_reposts_recalc
  after insert or delete on public.module_reposts
  for each row execute function public.recalc_module_repost_count();

-- ── Дефолт сложности: «Легко» (1), а не NULL, пока голосов ещё нет ──
alter table public.curricula alter column difficulty set default 1;
update public.curricula set difficulty = 1 where difficulty is null;

create or replace function public.recalc_module_difficulty() returns trigger
    language plpgsql security definer
    as $$
declare
  v_module text := coalesce(new.module_id, old.module_id);
  v_med    numeric;
  v_cnt    int;
begin
  select percentile_cont(0.5) within group (order by vote), count(*)
  into v_med, v_cnt
  from public.module_difficulty_votes
  where module_id = v_module;

  update public.curricula
  set difficulty       = case when v_cnt > 0 then round(v_med)::smallint else 1 end,
      difficulty_votes = v_cnt
  where id = v_module;
  return null;
end;
$$;
