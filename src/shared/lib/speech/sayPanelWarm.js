// Прогрев Vosk при монтировании панели «Сказать фразу» (вызывается из эффекта useSayPhrase.js; чистая логика, подставные perm / warm — тесты без браузера).
// Прогрев просим СРАЗУ, по синхронному решению sayPermission.decide(): если панель уйдёт в запасной режим (Firefox, «не могу говорить», отказ) — Vosk не нужен, не греем.
// НЕ ждём perm.refresh(): это Permissions API (navigator.permissions.query), на iPhone он может отвечать долго или вообще не ответить — раньше прогрев стоял за ним, и при
// «зависшем» запросе модель не грузилась никогда. Когда ответ пришёл и оказалось «запрещено» — освобождаем прогрев и уходим в запасной режим (onFallback).
/**
 * @param {{perm: {decide: Function, refresh: Function}, warm: (why: string) => Function, onFallback: (d: object) => void, onRefreshed?: () => void}} p
 * @returns {() => void} остановить (освободить прогрев)
 */
export function startPanelWarm({ perm, warm, onFallback, onRefreshed }) {
  let alive = true
  let release = null
  if (perm.decide().action !== 'fallback') release = warm('panel')
  Promise.resolve(perm.refresh()).then(() => {
    if (!alive) return
    onRefreshed?.() // кэш разрешения обновился — кнопке пора пересчитать вид «нет доступа / доступ выдан»
    const d = perm.decide() // query мог сказать 'denied' — сразу запасной режим, без попытки
    if (d.action === 'fallback') { release?.(); release = null; onFallback(d) }
    else if (!release) release = warm('panel')
  }).catch(() => {})
  return () => { alive = false; release?.(); release = null }
}
