// «Один экземпляр на все вкладки»: фоновую загрузку модели ведёт только одна вкладка/окно приложения.
// Web Locks API (есть в Safari 15.4+, Chrome): замок отпускается сам, когда вкладку закрыли или выгрузили — застрять он не может.
// Запасной путь без Web Locks: метка в localStorage { id, t } с «пульсом» раз в 5 с; метка старше 20 с считается брошенной.
// acquireLock() → release() (функция отпускания) либо null, если загрузку уже ведёт другая вкладка. Без React; всё подставляется в тестах.
export const LOCK_NAME = 'pithy-vosk-bg'
export const LOCK_KEY = 'pithy_vosk_bg_lock_v1'
export const BEAT_MS = 5000
export const STALE_MS = 20000

function viaWebLocks(locks) {
  return new Promise(resolve => {
    try {
      locks.request(LOCK_NAME, { ifAvailable: true }, lock => {
        if (!lock) { resolve(null); return undefined }
        return new Promise(free => { resolve(() => free()) }) // замок держится, пока не вызовут release()
      }).catch(() => resolve(null))
    } catch { resolve(null) }
  })
}

function viaStorage({ store, now, id, setTimer, clearTimer }) {
  const read = () => { try { return JSON.parse(store.getItem(LOCK_KEY) || 'null') } catch { return null } }
  const write = () => { try { store.setItem(LOCK_KEY, JSON.stringify({ id, t: now() })) } catch { /* приватный режим */ } }
  const cur = read()
  if (cur && cur.id !== id && now() - cur.t < STALE_MS) return null
  write()
  if (read()?.id !== id) return null // гонка двух вкладок: выиграла другая
  const timer = setTimer(write, BEAT_MS)
  return () => {
    clearTimer(timer)
    if (read()?.id === id) { try { store.removeItem(LOCK_KEY) } catch { /* приватный режим */ } }
  }
}

export async function acquireLock(opts = {}) {
  const nav = opts.nav ?? globalThis.navigator
  if (nav?.locks?.request) return viaWebLocks(nav.locks)
  let store = opts.store
  if (!store) { try { store = globalThis.localStorage } catch { store = null } }
  if (!store) return () => {} // ни замков, ни хранилища: защитить нечем — работаем без защиты
  return viaStorage({
    store, now: opts.now ?? Date.now, id: opts.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    setTimer: opts.setTimer ?? ((fn, ms) => setInterval(fn, ms)), clearTimer: opts.clearTimer ?? (t => clearInterval(t)),
  })
}
