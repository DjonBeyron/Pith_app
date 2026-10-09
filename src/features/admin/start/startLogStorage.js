// Хранилище журналов старта: читаем то, что записал inline-скрипт из index.html (ключ и формат — там же).
// Ничего не отправляем на сервер: журнал живёт только в localStorage этого устройства.
export const START_LOGS_KEY = 'pithy_start_logs_v1'

// Строка из localStorage → массив нормальных записей (битые отбрасываем), старые первыми
export function parseStartLogs(raw) {
  let list
  try { list = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(list)) return []
  return list
    .filter(r => r && typeof r === 'object' && typeof r.id === 'string' && Array.isArray(r.ev))
    .map(r => ({ ...r, ctx: r.ctx || {}, drop: r.drop || {}, cut: r.cut || {}, splash: Array.isArray(r.splash) ? r.splash : [] }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

// Записи с устройства; если хранилище недоступно или полно — хотя бы «живой» журнал текущей страницы
export function readStartLogs() {
  let raw = null
  try { raw = localStorage.getItem(START_LOGS_KEY) } catch { /* приватный режим */ }
  const list = parseStartLogs(raw)
  const live = typeof window !== 'undefined' ? window.__startLog : null
  if (live && Array.isArray(live.ev) && !list.some(r => r.id === live.id)) list.push(...parseStartLogs(JSON.stringify([live])))
  return list
}

export function clearStartLogs() {
  try { localStorage.removeItem(START_LOGS_KEY) } catch { /* ignore */ }
  // скрипт из index.html больше не перезапишет текущий старт (иначе при сворачивании он вернулся бы в список)
  try { window.__startLogOff = true; window.__startLog = null } catch { /* ignore */ }
}
