-- Сброс тестового аккаунта до «новичка» для e2e-прогонов на настоящей базе (workflow newbie-live,
-- e2e/helpers/liveAccounts.js → resetLiveAccount). Клиенту писать в word_memory / review_events и
-- в профиль напрямую нельзя (RLS: только select, 20260924120000_word_memory.sql), поэтому нужна своя функция.
-- ЗАЩИТА: работает только для аккаунтов, чей email лежит в приватном ключе app_settings 'e2e_accounts'
-- (jsonb-массив строк; ключа нет в app_settings_public_keys, значит читает только админ). Обычный пользователь
-- получает { ok: false, reason: 'not_e2e' } и ничего не теряет. Сбрасывает ТОЛЬКО данные вызвавшего.
-- Идемпотентна: create or replace. Необязательна: без неё спеки newbie-live работают, но не могут обнулить память
-- (тогда сценарий «новичок» честно сообщает об этом и проверяет то, что возможно).
--
-- ПОСЛЕ применения владелец один раз вносит адреса тестовых аккаунтов (те же, что в секрете E2E_USER_EMAILS):
--   insert into public.app_settings (key, value)
--   values ('e2e_accounts', '["a@example.com","b@example.com","c@example.com"]'::jsonb)
--   on conflict (key) do update set value = excluded.value;

create or replace function public.e2e_reset_me() returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_list  jsonb;
  v_mem   int;
  v_likes int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select value into v_list from public.app_settings where key = 'e2e_accounts';
  if v_list is null or jsonb_typeof(v_list) <> 'array' or not exists (
    select 1 from jsonb_array_elements_text(v_list) a where lower(a) = v_email
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_e2e');
  end if;

  delete from public.word_memory where user_id = v_uid;
  get diagnostics v_mem = row_count;
  delete from public.review_events where user_id = v_uid;
  delete from public.module_likes where user_id = v_uid;
  get diagnostics v_likes = row_count;

  update public.user_profiles
     set remind_at = null, remind_enabled = false, next_remind_at = null,
         ear_level = null, ear_sigma = null, vocab_level = null, vocab_sigma = null,
         prompt_group = null
   where id = v_uid;

  return jsonb_build_object('ok', true, 'memory', v_mem, 'likes', v_likes);
end;
$$;

revoke all on function public.e2e_reset_me() from public, anon;
grant execute on function public.e2e_reset_me() to authenticated;
