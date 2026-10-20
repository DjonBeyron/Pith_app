// Проба ссылки без скачивания файла: HEAD, а если сервер/CORS не дал — GET одного байта (Range). Результат
// { status, contentType, contentLength, error } кладётся в кэш на PROBE_TTL_MS: канвас пересчитывает здоровье урока при
// каждой правке, а сеть дёргать заново незачем. «Проверить снова» (BrokenNodesBadge) сбрасывает кэш по ссылкам урока.

export const PROBE_TTL_MS = 10 * 60 * 1000
export const PROBE_CONCURRENCY = 4
const cache = new Map() // url → { at, probe }

const parseLen = h => { const n = Number(h); return Number.isFinite(n) ? n : null }

function fromResponse(res) {
  return {
    status: res.status,
    contentType: res.headers?.get?.('content-type') ?? null,
    // Range-ответ (206) несёт content-range «bytes 0-0/12345» — общий размер оттуда; иначе content-length
    contentLength: res.status === 206
      ? parseLen(String(res.headers?.get?.('content-range') ?? '').split('/')[1])
      : parseLen(res.headers?.get?.('content-length')),
    error: null,
  }
}

export async function probeUrl(url, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs)
  try {
    try {
      const res = await fetchImpl(url, { method: 'HEAD', cache: 'no-store', signal: ctrl?.signal })
      // 405/501 — HEAD не поддержан, пробуем GET; 4xx остальные — честный ответ
      if (res.status !== 405 && res.status !== 501) return fromResponse(res)
    } catch (e) {
      if (e?.name === 'AbortError') return { status: 0, contentType: null, contentLength: null, error: 'timeout' }
    }
    const res = await fetchImpl(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, cache: 'no-store', signal: ctrl?.signal })
    try { res.body?.cancel?.() } catch { /* тело не читаем */ }
    return fromResponse(res)
  } catch (e) {
    return { status: 0, contentType: null, contentLength: null, error: e?.name === 'AbortError' ? 'timeout' : (e?.message ?? 'network') }
  } finally {
    clearTimeout(timer)
  }
}

export function cachedProbe(url, now = Date.now()) {
  const c = cache.get(url)
  return c && now - c.at < PROBE_TTL_MS ? c.probe : null
}
export function invalidateProbes(urls) { for (const u of urls) cache.delete(u) }
export function resetProbeCache() { cache.clear() }

/**
 * Проверить набор ссылок (пропуская свежие в кэше) с ограничением параллельности; onProbe(url, probe) — по мере готовности.
 * Возвращает Map url → probe по всем ссылкам. cancelled() — прервать (например, ноды поменялись).
 */
export async function probeMany(urls, { onProbe = () => {}, cancelled = () => false, probe = probeUrl, concurrency = PROBE_CONCURRENCY } = {}) {
  const result = new Map()
  const todo = []
  for (const u of urls) {
    const c = cachedProbe(u)
    if (c) { result.set(u, c); onProbe(u, c) } else todo.push(u)
  }
  let i = 0
  async function worker() {
    while (i < todo.length && !cancelled()) {
      const u = todo[i++]
      const p = await probe(u)
      if (cancelled()) return
      // Сетевые сбои не кэшируем — следующая проверка попробует снова
      if (!p.error) cache.set(u, { at: Date.now(), probe: p })
      result.set(u, p)
      onProbe(u, p)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker))
  return result
}
