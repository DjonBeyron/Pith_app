// Какой движок шёл на ПОСЛЕДНЕЙ попытке «Сказать фразу» в этом запуске приложения — для строки админа в настройках модуля (SpeechSayEngine.jsx) и серой плашки над панелью.
// Модульная переменная с подпиской: панель плеера пишет, админская вкладка читает. Звук и текст сюда не попадают — только движок, причина и время.
let last = null
const subs = new Set()

/** pick — результат sayEnginePick.pickEngine() */
export function setLastEngine(pick, at = Date.now()) {
  last = pick ? { engine: pick.engine, reason: pick.reason, at } : null
  subs.forEach(fn => { try { fn() } catch { /* подписчик не должен ломать попытку */ } })
}
export const getLastEngine = () => last
export function subscribeLastEngine(fn) { subs.add(fn); return () => subs.delete(fn) }
