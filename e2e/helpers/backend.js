// Предохранитель админ-тестов: они пишут в базу с правами is_admin (создают и
// удаляют модули, переключают статусы). Это допустимо ТОЛЬКО против локального
// стека Supabase (`supabase start`, см. scripts/e2e-local.sh) — никогда против
// боевого проекта, где база общая с живыми пользователями.

// Локальный стек отдаёт API на http://127.0.0.1:54321 (или localhost). Всё,
// что не http-loopback, считаем боевым/удалённым.
export function isLocalBackend(url = process.env.VITE_SUPABASE_URL) {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url ?? '')
}

// Падает (а не skip'ает), если админ-тест случайно запущен не на локальной
// базе: тихий skip спрятал бы ошибку конфигурации CI.
export function assertLocalBackend() {
  if (!isLocalBackend()) {
    throw new Error(
      `Админ-тесты только на локальном стеке, а VITE_SUPABASE_URL=${process.env.VITE_SUPABASE_URL ?? '(пусто)'}. ` +
      'Запускай через scripts/e2e-local.sh.',
    )
  }
}
