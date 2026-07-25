-- Флаг «пользователь уже видел и опробовал подсказку про замедление видео
-- (зажатие над лайком)» — чтобы подсказка показалась ровно один раз за всё
-- время, и это состояние не терялось при регистрации гостя (гость хранит
-- флаг в localStorage, при регистрации клиент переносит его сюда через RPC).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS slowmo_hint_seen boolean DEFAULT false NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_slowmo_hint_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
begin
  if auth.uid() is null then return; end if;
  update public.user_profiles set slowmo_hint_seen = true where id = auth.uid();
end;
$$;

ALTER FUNCTION public.mark_slowmo_hint_seen() OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.mark_slowmo_hint_seen() TO authenticated;
