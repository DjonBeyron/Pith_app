// Подставные браузерные части для тестов Vosk (Cache Storage). Не тест и не код приложения.
// Подставной Cache Storage на Map (put хранит Response как есть: тело читается один раз — клонируем при match)
export function fakeCaches({ putError } = {}) {
  const caches = new Map()
  const open = async name => {
    if (!caches.has(name)) caches.set(name, new Map())
    const store = caches.get(name)
    return {
      match: async k => (store.has(k) ? store.get(k).clone() : undefined),
      put: async (k, r) => { if (putError) throw putError; store.set(k, r) },
      delete: async k => store.delete(k),
    }
  }
  return { open, delete: async name => caches.delete(name), has: name => caches.has(name), _caches: caches }
}

const GZ = [0x1f, 0x8b, 8, 0]
/** Тело архива: первые байты gzip (чтобы проверка «это архив» прошла) и добивка до n байт */
export const gzBytes = n => { const u = new Uint8Array(n).fill(9); u.set(GZ); return u }
/** Порции по size байт */
export const slices = (u8, size) => { const out = []; for (let i = 0; i < u8.length; i += size) out.push(u8.slice(i, i + size)); return out }

/** Подставной ответ fetch: parts — Uint8Array-порции; hang — после порций тело «зависает» до abort */
export function fakeResponse(parts, { status = 200, headers = {}, signal, hang = false, failAfter = false } = {}) {
  let i = 0
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  const waitAbort = () => new Promise((_, rej) => {
    const err = () => rej(new DOMException('aborted', 'AbortError'))
    if (signal?.aborted) err(); else signal?.addEventListener('abort', err, { once: true })
  })
  return {
    ok: status >= 200 && status < 300, status, headers: { get: k => lower[k.toLowerCase()] ?? null },
    body: { getReader: () => ({ read: async () => {
      if (i < parts.length) return { done: false, value: parts[i++] }
      if (failAfter) throw new TypeError('network error')
      if (hang) return waitAbort()
      return { done: true }
    } }) },
  }
}
