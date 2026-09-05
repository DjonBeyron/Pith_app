-- Настройки генерации фото (см. generate-image/index.ts, PROJECT.md раздел
-- «Генерация фото через Gemini API»): переключатель провайдера прямо из
-- интерфейса (⚙ в шапке канваса → Настройки), без правки Supabase secrets
-- и передеплоя функции каждый раз.
--
-- image_provider: { "provider": "cloudflare" | "gemini" } — какой провайдер
-- реально используется; секрет IMAGE_PROVIDER остаётся аварийным дефолтом,
-- если строки в базе ещё нет.
-- image_gen_usage: { "date": "YYYY-MM-DD" (UTC), "count": N } — счётчик
-- генераций через Cloudflare за сутки (обновляет сама edge function),
-- ориентир по нагрузке — Cloudflare не отдаёт точный остаток бесплатного
-- бюджета через API, это наш собственный подсчёт, не официальная квота.

insert into public.app_settings (key, value)
values ('image_provider', '{"provider": "cloudflare"}'::jsonb)
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values ('image_gen_usage', '{"date": "", "count": 0}'::jsonb)
on conflict (key) do nothing;
