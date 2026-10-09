// Подставные браузерные части для тестов Vosk (Cache Storage, сервер с Range). Не тест и не код приложения.
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

/** Подставной сервер модели на настоящих Response: Range → 206 (+Content-Range, если exposeRange), без Range → 200; HEAD → Content-Length.
 *  opts: range:false — сервер Range не понимает; exposeRange:false — Content-Range скрыт от страницы (нет ExposeHeaders); head:false — HEAD не отвечает;
 *  lastModified(callNo) — подмена версии файла. fn.calls — журнал запросов { method, range } */
export function rangeServer(bytes, { range = true, exposeRange = true, head = true, lastModified = () => 'Mon, 01 Jan 2026 00:00:00 GMT', contentType = 'application/gzip' } = {}) {
  const calls = []
  const fn = async (_url, init = {}) => {
    const method = init.method || 'GET'
    calls.push({ method, range: init.headers?.Range ?? null })
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const base = { 'content-type': contentType, 'last-modified': lastModified(calls.length) }
    if (method === 'HEAD') return head ? new Response(null, { headers: { ...base, 'content-length': String(bytes.length) } }) : new Response(null, { status: 405 })
    const m = /^bytes=(\d+)-(\d+)$/.exec(init.headers?.Range || '')
    if (!range || !m) return new Response(bytes, { headers: { ...base, 'content-length': String(bytes.length) } })
    const s = Number(m[1]), e = Math.min(Number(m[2]), bytes.length - 1)
    const h = { ...base, 'content-length': String(e - s + 1), ...(exposeRange ? { 'content-range': `bytes ${s}-${e}/${bytes.length}` } : {}) }
    return new Response(bytes.slice(s, e + 1), { status: 206, headers: h })
  }
  fn.calls = calls
  return fn
}

/** Запрос, который «висит» до abort (кончается AbortError) — для проверки сторожа и отмены при занятости */
export const hangingFetch = () => (_url, init = {}) => new Promise((_, rej) => {
  const err = () => rej(new DOMException('aborted', 'AbortError'))
  if (init.signal?.aborted) err(); else init.signal?.addEventListener('abort', err, { once: true })
})
