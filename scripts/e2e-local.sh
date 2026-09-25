#!/usr/bin/env bash
# Полный E2E (гость + пользователь + АДМИН + права БД) на ЛОКАЛЬНОМ стеке
# Supabase в Docker. Боевую базу не трогает вообще: схема — из
# supabase/migrations, данные — из supabase/seed.sql (тест-аккаунты
# e2e-user/e2e-admin и модуль «E2E-ТЕСТ»). Нужен Docker.
#
#   scripts/e2e-local.sh                    — весь пакет
#   scripts/e2e-local.sh --project=admin    — любые аргументы playwright test
#   E2E_PLAYER=1 scripts/e2e-local.sh ...   — с полным прогоном плеера
#
# Стек после прогона остаётся запущенным (повторный старт быстрее).
# Остановить: npx supabase stop
set -euo pipefail
cd "$(dirname "$0")/.."

SUPABASE="npx --yes supabase@2.117.0"

# Облачный контейнер Claude: Docker установлен, но демон не запущен
if ! docker info >/dev/null 2>&1; then
  echo "[e2e-local] запускаю dockerd..."
  (dockerd >"${TMPDIR:-/tmp}/dockerd.log" 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

# Только то, что нужно приложению: Postgres, auth, REST-шлюз. Хранилище,
# realtime и edge functions приложение локально не использует (файлы — в R2)
$SUPABASE start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
# Каждый прогон — с чистой базы: миграции + сид заново
$SUPABASE db reset

# Ключи локального стека одинаковые у всех установок — это не секрет
eval "$($SUPABASE status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=')"
export VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY"
# Пустой ключ перекрывает .env.local: капча локально выключена
export VITE_TURNSTILE_SITE_KEY=
# Тест-аккаунты из supabase/seed.sql (существуют только в локальной базе)
export E2E_EMAIL=e2e-user@pithy.local E2E_PASSWORD=e2e-local-password
export E2E_ADMIN_EMAIL=e2e-admin@pithy.local E2E_ADMIN_PASSWORD=e2e-local-password

# Облачный контейнер Claude: браузер Playwright скачать нельзя, есть свой
if [ -z "${CI:-}" ] && [ -z "${PW_CHROMIUM_PATH:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium
fi

npx playwright test "$@"
