import { isSceneAudioUrl } from '../../../scene/v2/sceneVoice.js'
import { describeAudioFail } from '../../../scene/v2/sceneAudioFail.js'
import { SOUND_CHECK_TEXT } from '../scenesHelp.js'

// «Проверить звук» в сборщике: почему файл озвучки может не играть. Два независимых замера:
//  · HTTP: HEAD по ссылке → статус, Content-Type, размер (fetch может упереться в CORS бакета —
//    тогда заголовков нет, но <audio> это не мешает: corsBlocked);
//  · медиа: пробный <audio> (preload=auto, без play — жест не нужен) → canplay/loadedmetadata
//    с длительностью либо error с кодом MediaError, либо таймаут.
// Чистая логика с инъекциями (fetchFn/makeAudio/timers) — тест audioProbe.test.js без сети.

export const PROBE_TIMEOUT_MS = 8000

const fill = (tpl, vars = {}) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''))
const fmtSec = v => (Number.isFinite(v) && v > 0 ? v.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '?')
export const isAudioType = ct => /^audio\//i.test(String(ct ?? '').split(';')[0].trim()) || /^(video\/mp4|application\/ogg)$/i.test(String(ct ?? '').split(';')[0].trim())

async function probeHttp(url, fetchFn) {
  try {
    const res = await fetchFn(url, { method: 'HEAD', cache: 'no-store' })
    return { ok: !!res?.ok, status: res?.status ?? 0, contentType: res?.headers?.get?.('content-type') ?? null, size: Number(res?.headers?.get?.('content-length')) || null, corsBlocked: false }
  } catch {
    return { ok: false, status: 0, contentType: null, size: null, corsBlocked: true }
  }
}

function probeMedia(url, makeAudio, timeoutMs, timers) {
  return new Promise(resolve => {
    const a = makeAudio()
    let done = false
    const finish = r => { if (done) return; done = true; timers.clearTimeout(t); try { a.removeAttribute?.('src'); a.load?.() } catch { /* ignore */ }; resolve(r) }
    const t = timers.setTimeout(() => finish({ ok: false, timedOut: true, duration: null, errorCode: null }), timeoutMs)
    a.addEventListener('canplay', () => finish({ ok: true, timedOut: false, duration: a.duration, errorCode: null }), { once: true })
    a.addEventListener('loadedmetadata', () => finish({ ok: true, timedOut: false, duration: a.duration, errorCode: null }), { once: true })
    a.addEventListener('error', () => finish({ ok: false, timedOut: false, duration: null, errorCode: a.error?.code ?? null }), { once: true })
    try { a.preload = 'auto'; a.src = url; a.load?.() } catch { finish({ ok: false, timedOut: false, duration: null, errorCode: null }) }
  })
}

// Итоговые строки по-русски (первая — главный вердикт)
export function probeLines(r) {
  const out = []
  if (!r.hostOk) out.push(fill(SOUND_CHECK_TEXT.bad_host))
  const h = r.http
  if (h.corsBlocked) out.push(fill(SOUND_CHECK_TEXT.cors_only))
  else if (h.status === 403) out.push(fill(SOUND_CHECK_TEXT.http_403))
  else if (h.status === 404) out.push(fill(SOUND_CHECK_TEXT.http_404))
  else if (!h.ok) out.push(fill(SOUND_CHECK_TEXT.http_other, { status: h.status }))
  else if (!isAudioType(h.contentType)) out.push(fill(SOUND_CHECK_TEXT.not_audio_type, { type: h.contentType ?? 'пусто' }))
  const m = r.media
  if (m.ok) out.push(h.ok && isAudioType(h.contentType) && out.length === 0
    ? fill(SOUND_CHECK_TEXT.ok, { type: `${h.contentType}${h.size ? `, ${Math.round(h.size / 1024)} КБ` : ''}`, sec: fmtSec(m.duration) })
    : fill(SOUND_CHECK_TEXT.media_ok, { sec: fmtSec(m.duration) }))
  else if (m.timedOut) out.push(fill(SOUND_CHECK_TEXT.media_timeout, { sec: Math.round(r.timeoutMs / 1000) }))
  else out.push(fill(SOUND_CHECK_TEXT.media_error, { code: describeAudioFail(m.errorCode != null ? `media-error-${m.errorCode}` : 'not-supported') }))
  return out
}

export async function probeSceneAudio(url, {
  fetchFn = (...a) => globalThis.fetch(...a), makeAudio = () => new Audio(), timeoutMs = PROBE_TIMEOUT_MS, timers = globalThis,
} = {}) {
  const hostOk = isSceneAudioUrl(url)
  const [http, media] = await Promise.all([probeHttp(url, fetchFn), probeMedia(url, makeAudio, timeoutMs, timers)])
  const r = { url, hostOk, http, media, timeoutMs }
  r.ok = hostOk && media.ok && (http.corsBlocked || (http.ok && isAudioType(http.contentType)))
  r.lines = probeLines(r)
  return r
}
