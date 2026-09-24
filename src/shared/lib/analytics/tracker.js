// Очередь событий аналитики — без сети и без браузерных глобалов (отправку,
// хранилище и часы передают снаружи), поэтому покрыта тестами. Живой
// экземпляр с отправкой в Supabase — track.js.
//
// Событие в очереди: { name, props, at: ISO-время, sid: id сессии }.
// Сессия — отрезок активности: пауза дольше idleMs начинает новую.
// Очередь переживает перезагрузку (storage) — события, накопленные без сети
// или в момент закрытия, уйдут при следующем запуске.

const QUEUE_KEY = 'pithy_events_queue'

export function createTracker({
  send,                      // async (batch, { keepalive }) → true, если сервер принял
  storage = null,            // localStorage-подобный объект или null
  now = () => Date.now(),
  newId,                     // () → новый id сессии
  batchSize = 50,
  cap = 300,                 // потолок очереди: старое выкидывается первым
  idleMs = 30 * 60 * 1000,
}) {
  let queue = read()
  let sid = null
  let lastAt = 0
  let sending = false

  function read() {
    try {
      const q = JSON.parse(storage?.getItem(QUEUE_KEY) ?? '[]')
      return Array.isArray(q) ? q : []
    } catch { return [] }
  }

  function save() {
    try { storage?.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch { /* хранилище недоступно — живём в памяти */ }
  }

  // true — сессия началась заново (первое событие или после долгой паузы)
  function touchSession() {
    const t = now()
    const fresh = !sid || t - lastAt > idleMs
    if (fresh) sid = newId()
    lastAt = t
    return fresh
  }

  function push(name, props = null) {
    touchSession()
    queue.push({ name, props, at: new Date(now()).toISOString(), sid })
    // Пока пачка в пути, не режем начало очереди — иначе после ответа
    // сервера удалились бы не те события
    if (queue.length > cap && !sending) queue = queue.slice(-cap)
    save()
    return queue.length
  }

  // keepalive — отправка при сворачивании/закрытии: ответа можем не дождаться,
  // поэтому пачка снимается с очереди сразу (иначе при следующем запуске она
  // ушла бы второй раз)
  async function flush({ keepalive = false } = {}) {
    if (sending || !queue.length) return 0
    const batch = queue.slice(0, batchSize)
    if (keepalive) {
      queue = queue.slice(batch.length)
      save()
      try { await send(batch, { keepalive: true }) } catch { /* страница уходит — не важно */ }
      return batch.length
    }
    sending = true
    try {
      const ok = await send(batch, { keepalive: false })
      if (!ok) return 0
      queue = queue.slice(batch.length)
      save()
      return batch.length
    } catch {
      return 0
    } finally {
      sending = false
    }
  }

  return { push, flush, touchSession, size: () => queue.length }
}
