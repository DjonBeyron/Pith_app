// Админ → «Старт» → «Быстрый старт (кеш оболочки)»: текст статуса из ответа service worker'а (shell-status). Чистые функции (тесты — shellStatusView.test.js).
const pad = n => String(n).padStart(2, '0')
export const fmtTime = ms => {
  const d = new Date(ms)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const WHY = { manual: 'вручную', nosw: 'адрес ?nosw=1', boot: 'защита: страница не загрузилась два запуска подряд' }

// Статус кеша оболочки одной строкой: { on, text }; on — включён и кеш готов
export function shellState(status) {
  if (!status) return { on: false, text: 'нет данных — сервис-воркер не управляет страницей (dev, первый запуск до установки или воркер не поддерживается)' }
  if (!status.configured) return { on: false, text: 'не настроен (собран без плагина кеша оболочки — dev)' }
  if (!status.enabled) return { on: false, text: `выключен до ${fmtTime(status.disabledUntil)} (${WHY[status.why] || status.why || 'причина не указана'}) — страница грузится с сети` }
  if (!status.own) return { on: false, text: status.blocked ? 'включён, но кеш сброшен (ошибка ленивого чанка) — соберётся при следующей версии' : 'включён, кеш этой версии ещё не собран (соберётся при запуске онлайн)' }
  return { on: true, text: 'включён, кеш готов — страница отдаётся из кеша' }
}

// Строки отчёта: [подпись, значение]
export function shellRows(status, netVersion, pageVersion) {
  const rows = [['Кеш оболочки', shellState(status).text]]
  if (!status) return rows
  rows.push(['Воркер', `build ${status.build || '?'} · v${status.version || '?'}`])
  const own = (status.caches || []).find(c => c.own && c.full)
  const shellVer = own ? own.ver : null
  rows.push(['Версия оболочки (кеш) / сеть / страница', `${shellVer ? `v${shellVer}` : '—'} / ${netVersion ? `v${netVersion}` : '? (нет сети)'} / v${pageVersion}`])
  rows.push(['Кеши на устройстве', status.caches && status.caches.length
    ? status.caches.map(c => `${c.name}${c.own ? ' (текущий)' : ''}${c.full ? ` ${c.n || '?'} ф.` : ' (неполный)'}${c.at ? `, ${fmtTime(c.at)}` : ''}`).join('; ')
    : 'нет'])
  const nav = status.nav
  rows.push(['Эта страница', nav ? `оболочка=${nav.source}${nav.source !== 'cache' ? ` [${nav.why}]` : ''} (build ${nav.build}), воркер ответил за ${nav.ms} мс` : 'неизвестно (воркер перезапущен)'])
  if (status.fails || status.pending) rows.push(['Защита от залипания', `запусков без boot-ok подряд: ${status.fails}${status.pending ? ', последний запуск ещё не подтверждён' : ''} (при 2 — кеш выключается)`])
  return rows
}
