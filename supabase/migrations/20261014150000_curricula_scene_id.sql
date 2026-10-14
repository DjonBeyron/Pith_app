-- Сцены в ленте рекомендаций, часть A (данные): у модуля ленты (curricula)
-- появляется ссылка на сцену библиотеки (scenes) — curricula.scene_id. Лента
-- показывает сцену вместо видео фразы (приоритет сцены — на стороне слайда).
-- Сцена удалена → ссылка обнуляется (on delete set null), модуль живёт дальше
-- с видео/заглушкой. Политики curricula не меняются: читают все
-- (curricula_select_all), пишет только админ (curricula_write_admin) — значит
-- и scene_id ставит только админ. ВАЖНО: модуль может ссылаться на сцену в
-- статусе draft — ученик такую строку scenes по RLS не получит, лента покажет
-- модуль без сцены; админка при привязке предлагает только published.

alter table public.curricula add column if not exists scene_id uuid;

comment on column public.curricula.scene_id is
  'Сцена библиотеки (scenes.id) для слайда ленты вместо видео; null — сцены нет. Ученик видит сцену только при status = published.';

-- Внешний ключ — идемпотентно (у alter table нет "if not exists" для constraint)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'curricula_scene_id_fkey') then
    alter table public.curricula add constraint curricula_scene_id_fkey
      foreign key (scene_id) references public.scenes(id) on delete set null;
  end if;
end $$;

-- Частичный индекс: сцен у модулей мало, ищем «какие модули ссылаются на сцену»
create index if not exists curricula_scene_id_idx
  on public.curricula (scene_id) where scene_id is not null;
