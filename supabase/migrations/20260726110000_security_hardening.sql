-- Закрытие дыр в правах доступа (июль 2026).
--
-- 1) push_subscriptions: политики стояли `using (true)` для anon+authenticated
--    на UPDATE и DELETE. Прочитать строки было нельзя (SELECT-политики нет), но
--    один запрос `delete from push_subscriptions where endpoint <> ''` стирал
--    подписки ВСЕХ пользователей, а INSERT позволял записать чужой user_id.
--    Лечим так: прямой доступ к таблице клиенту закрываем совсем, запись — через
--    две security definer функции, которые сами подставляют auth.uid().
--
-- 2) client_errors: INSERT был `with check (true)` — можно было писать ошибки от
--    имени любого user_id. Теперь только свой (или NULL у гостя).

-- ── 1. push_subscriptions ────────────────────────────────────────────────

drop policy if exists push_subs_insert on public.push_subscriptions;
drop policy if exists push_subs_update on public.push_subscriptions;
drop policy if exists push_subs_delete on public.push_subscriptions;

revoke all on table public.push_subscriptions from anon, authenticated;

-- Сохранить/обновить свою подписку. Гость (auth.uid() is null) тоже может —
-- у него подписка живёт без user_id, как и раньше.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_ua       text default ''
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if p_endpoint is null or p_p256dh is null or p_auth is null then
    raise exception 'push subscription: endpoint/keys required';
  end if;

  -- endpoint уникален (первичный ключ): перезаписываем строку целиком,
  -- владельцем становится тот, кто вызвал функцию
  delete from public.push_subscriptions where endpoint = p_endpoint;

  insert into public.push_subscriptions (endpoint, p256dh, auth, user_id, ua)
  values (p_endpoint, p_p256dh, p_auth, auth.uid(), left(coalesce(p_ua, ''), 200));
end;
$$;

-- Удалить подписку этого устройства. Знание endpoint = владение устройством:
-- прочитать чужой endpoint из базы клиент не может (SELECT закрыт).
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if p_endpoint is null then return; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text) to anon, authenticated;

revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.delete_push_subscription(text) to anon, authenticated;

-- ── 2. client_errors ─────────────────────────────────────────────────────

drop policy if exists client_errors_insert_all on public.client_errors;
create policy client_errors_insert_own
  on public.client_errors
  for insert
  with check (user_id is null or user_id = auth.uid());
