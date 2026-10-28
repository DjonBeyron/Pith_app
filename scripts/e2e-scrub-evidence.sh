#!/usr/bin/env bash
# Вычищает из трасс Playwright (zip) пароли и адреса тестовых аккаунтов и JWT перед загрузкой артефакта newbie-live-evidence.
# Репозиторий публичный, а трасса записывает ввод в форму и тела запросов. Секреты — из env (E2E_USER_PASSWORD, E2E_USER_EMAILS,
# через запятую). Токены входа дополнительно гасятся глобальным выходом в конце каждого сценария (helpers/liveBackend.js).
# Запуск из корня репозитория: scripts/e2e-scrub-evidence.sh
set -uo pipefail

# Экранируем текст для sed (разделитель | и спецсимволы)
esc() { printf '%s' "$1" | sed -e 's/[][\.*^$|&/]/\\&/g'; }

secrets=()
IFS=',' read -ra pw <<< "${E2E_USER_PASSWORD:-}"
IFS=',' read -ra em <<< "${E2E_USER_EMAILS:-}"
for s in "${pw[@]}" "${em[@]}"; do
  s="${s// /}"
  [ -n "$s" ] && secrets+=("$s")
done

count=0
while IFS= read -r z; do
  d=$(mktemp -d)
  unzip -q "$z" -d "$d" 2>/dev/null || { rm -rf "$d"; continue; }
  for s in "${secrets[@]}"; do
    grep -rIlF -- "$s" "$d" | xargs -r sed -i "s|$(esc "$s")|***|g"
  done
  grep -rIlE 'eyJ[A-Za-z0-9_-]{10,}\.' "$d" | xargs -r sed -i -E 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/***jwt***/g'
  rm -f "$z"
  (cd "$d" && zip -qr "$OLDPWD/$z" .)
  rm -rf "$d"
  count=$((count + 1))
done < <(find playwright-report test-results -name '*.zip' 2>/dev/null)
echo "вычищено архивов трасс: $count"
