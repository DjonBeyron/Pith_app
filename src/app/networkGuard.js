// Чистая логика «что показать вместо белого экрана без сети».
// ЗЕРКАЛО: public/net-guard.js (ES5, грузится синхронно в <head> и должен работать, даже когда бандл не загрузился)
// дублирует decideNetworkState и константы ниже. Меняешь здесь — меняй там (networkGuard.test.js сверяет оба).

// «Слабое соединение» показываем не сразу, а через паузу — чтобы не мигало при медленной, но живой сети
export const SLOW_SHOW_DELAY_MS = 2500
// Приложение не смонтировалось за это время — считаем, что бандл не доехал
export const BOOT_TIMEOUT_MS = 8000
// «Нет сети» (navigator.onLine === false) показываем, только если оно держится без перерыва столько мс: iOS на холодном
// старте поднимает радио и может на мгновение отдать false — без паузы это мигающий экран с кабелем на запуске
export const OFFLINE_CONFIRM_MS = 700

// 'offline' — сети нет (показываем сразу); 'slow' — сеть есть, но ресурсы не грузятся; 'none' — ничего не показываем
//   online — navigator.onLine; mounted — приложение уже нарисовалось в #root;
//   resourceFailedMs — сколько мс прошло с первой ошибки загрузки скрипта/стиля приложения (null — ошибок не было);
//   elapsedMs — сколько мс прошло со старта страницы; offlineForMs — сколько мс подряд navigator.onLine === false
export function decideNetworkState({ online, mounted, resourceFailedMs = null, elapsedMs = 0, offlineForMs = Infinity }) {
  if (mounted) return 'none'
  if (online === false && offlineForMs >= OFFLINE_CONFIRM_MS) return 'offline'
  if (resourceFailedMs !== null && resourceFailedMs >= SLOW_SHOW_DELAY_MS) return 'slow'
  if (elapsedMs >= BOOT_TIMEOUT_MS) return 'slow'
  return 'none'
}

// Что написать на экране, когда загрузка уже сорвалась внутри работающего приложения (ленивый чанк)
export function networkKindNow() {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'slow'
}

// Тексты экрана «нет связи» (тон приложения — на «ты», тепло и просто). ЗЕРКАЛА: public/net-guard.js (TEXTS) и
// public/offline.html (скрипт sync) — копии строк, networkGuard.test.js сверяет их с этим объектом. Менять парно.
//   offline — сети точно нет (navigator.onLine === false);
//   slow — «что-то со связью»: сеть есть по версии браузера, но приложение не грузится. Текст НАРОЧНО универсальный: в iOS
//     в режиме полёта navigator.onLine бывает true, поэтому сюда попадает и режим полёта — про него сказано в подписи;
//   server — сеть есть, но наш сервер (Supabase) не отвечает (страны, где он доступен только через VPN) — см. serverReach ниже.
export const NETWORK_TEXTS = {
  offline: { title: 'Связь пропала', text: 'Проверь интернет или режим полёта — как только связь вернётся, мы продолжим сами' },
  slow: { title: 'Что-то со связью', text: 'Подожди немного или проверь интернет и режим полёта — мы продолжим сами' },
  server: {
    title: 'Нет связи с сервером',
    text: 'Наш сервер не отвечает, хотя интернет, похоже, есть. В некоторых странах приложение работает только через VPN — включи его, и мы продолжим сами',
  },
  retry: 'Повторить',
  checking: 'Проверяем…',
}

// ───── «Сервер недоступен» при запуске (страны, где нужен VPN) ─────
// Сторож в public/net-guard.js на старте, параллельно с загрузкой приложения, стучится в наш бэкенд (Supabase). Любой HTTP-ответ
// (даже 401/404) = «сервер достижим»; недоступным он считается только по СЕТЕВОЙ ошибке или таймауту, и только после двух
// неудачных попыток подряд (не ложимся на медленную сеть). ЗЕРКАЛО: net-guard.js (srvDecide, srvHealthUrl, константы SRV_*).
export const SERVER_PROBE_TIMEOUT_MS = 4000 // одна попытка (при затяжной медленной сети экран потом уберётся сам — см. RECHECK)
export const SERVER_PROBE_PAUSE_MS = 1500 // пауза между попытками: до показа не больше 4 + 1.5 + 4 = 9.5 с
export const SERVER_PROBE_ATTEMPTS = 2
export const SERVER_RECHECK_MS = 3500 // пока экран висит, проверяем снова каждые ~3.5 с
export const SERVER_RECHECK_TIMEOUT_MS = 6000 // уже показанному экрану даём больше времени — не мигаем на медленной сети

// results — итоги попыток по порядку: 'ok' (пришёл ЛЮБОЙ HTTP-ответ) или 'fail' (сетевая ошибка / таймаут).
// 'reachable' — достаточно одного ответа, больше не проверяем; 'offline' — сети нет совсем (этим занят экран «Связь пропала»,
// сервер не винить); 'unreachable' — показываем экран; 'pending' — ещё одна попытка
export function decideServerReach({ results, online }) {
  if (results.includes('ok')) return 'reachable'
  if (online === false) return 'offline'
  if (results.length >= SERVER_PROBE_ATTEMPTS) return 'unreachable'
  return 'pending'
}

// Лёгкая точка проверки без ключа: /auth/v1/health (ответ любого статуса годится; запрос no-cors, поэтому ответ непрозрачный
// и от CORS не зависит). base — VITE_SUPABASE_URL, подставленный Vite в <meta name="pithy-supabase-url">; не заменённый
// плейсхолдер «%VITE_…%» или не-http адрес → null (проверка не запускается)
export function serverHealthUrl(base) {
  const b = String(base ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s%]+$/.test(b) ? `${b}/auth/v1/health` : null
}

// Ошибка загрузки ленивого модуля (React.lazy / import()): текст зависит от браузера
const CHUNK_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|Loading CSS chunk [\w-]+ failed/i
export function isChunkLoadError(err) {
  if (!err) return false
  if (err.name === 'ChunkLoadError') return true
  return CHUNK_RE.test(String(err.message ?? err))
}
