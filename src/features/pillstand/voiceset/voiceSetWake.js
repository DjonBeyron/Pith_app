// «Экран не гаснет» на время «Записи набора» (Wake Lock API: Safari 16.4+, Chrome 84+). Система сама снимает блокировку, когда страница уходит в фон, — при возврате просим заново.
// Нет API — ничего не делаем (supported() → false: экран подскажет не давать телефону уснуть). Зависимости подставляются.
export function createWake({ nav = globalThis.navigator, doc = globalThis.document } = {}) {
  let lock = null, want = false
  const ask = async () => {
    if (!want || lock || !nav?.wakeLock?.request || doc?.visibilityState === 'hidden') return
    try {
      const l = await nav.wakeLock.request('screen')
      if (!want) { l.release?.().catch?.(() => {}); return }
      lock = l
      l.addEventListener?.('release', () => { if (lock === l) lock = null })
    } catch { lock = null }
  }
  const vis = () => { ask() }
  return {
    supported: () => !!nav?.wakeLock?.request,
    held: () => !!lock,
    /** Включить (из тапа) → Promise */
    on() { if (!want) { want = true; doc?.addEventListener?.('visibilitychange', vis) } return ask() },
    off() {
      want = false
      doc?.removeEventListener?.('visibilitychange', vis)
      const l = lock
      lock = null
      try { l?.release?.().catch?.(() => {}) } catch { /* уже снята */ }
    },
  }
}
