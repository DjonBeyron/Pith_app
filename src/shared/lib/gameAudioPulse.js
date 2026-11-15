// «Пульс звука» для журнала: одной строкой — что сейчас со звуком страницы. Нужен, когда звук пропал, а в журнале тихо:
// видно, какие AudioContext живы, идут ли их часы (ctx.currentTime растёт со скоростью ×1.00 — если стоит, вывод мёртв, хоть state=running),
// тип/состояние аудиосессии, дорожки микрофона, гарнитура/маршрут (outputLatency), играющие <audio>/<video>.
// audioPulse() — короткая строка для каждой секундной строки [perf] (часы считаются от прошлого вызова); audioDeep() — подробности для момента глушения.
// Всё внешнее подставляется аргументами (тесты); ошибки глотаем — журнал не мешает игре.
import { liveContexts } from './audioContextRegistry.js'
import { micTracksLine } from './gameMic.js'

const last = new Map() // ctx → { t: ctx.currentTime, w: мс по часам страницы } на прошлый вызов

const sessionOf = nav => { try { const s = nav?.audioSession; return s ? `${s.type ?? '—'}/${s.state ?? '—'}` : 'нет API' } catch { return '—' } }
const wallNow = () => globalThis.performance?.now?.() ?? Date.now()

/** Часы контекста относительно часов страницы: '×1.00' (идут) | ' ЧАСЫ СТОЯТ' | '' (нет прошлого замера или контекст не running) */
function clockOf(ctx, w) {
  const prev = last.get(ctx)
  if (prev && (w - prev.w) / 1000 < 0.5) return '' // слишком близко к прошлому замеру (реплика Мии между секундными [perf]) — не сравниваем и точку отсчёта не двигаем
  last.set(ctx, { t: ctx.currentTime, w })
  if (!prev || ctx.state !== 'running') return ''
  const dw = (w - prev.w) / 1000
  const rate = (ctx.currentTime - prev.t) / dw
  return rate < 0.5 ? ` ЧАСЫ СТОЯТ(×${rate.toFixed(2)})` : `×${rate.toFixed(2)}`
}

/** Короткая строка: «snd=game:running×1.00,sounds:running×1.00 ses=playback/active mic=live» */
export function audioPulse({ contexts = liveContexts, mic = micTracksLine, nav = globalThis.navigator, wall = wallNow } = {}) {
  const w = wall()
  let snd = 'нет'
  try {
    const list = contexts()
    snd = list.map(({ kind, ctx }) => `${kind}:${ctx.state}${clockOf(ctx, w)}`).join(',') || 'нет'
    const alive = new Set(list.map(c => c.ctx))
    for (const c of [...last.keys()]) if (!alive.has(c)) last.delete(c)
  } catch { snd = '—' }
  let m = '—'
  try { m = mic() } catch { /* без микрофона */ }
  return `snd=${snd} ses=${sessionOf(nav)} mic=${m}`
}

/** Подробности на момент глушения: задержки вывода контекстов, играющие элементы, фокус, дорожка (метка, частота, enabled) */
export function audioDeep({ contexts = liveContexts, doc = globalThis.document, nav = globalThis.navigator, stream = null } = {}) {
  const out = []
  try {
    for (const { kind, ctx } of contexts()) out.push(`${kind}: state=${ctx.state}, t=${ctx.currentTime?.toFixed?.(2)}, base=${ctx.baseLatency?.toFixed?.(3) ?? '—'}, out=${ctx.outputLatency?.toFixed?.(3) ?? '—'}, rate=${ctx.sampleRate}`)
  } catch { out.push('контексты: недоступно') }
  try {
    const els = [...(doc?.querySelectorAll?.('audio,video') ?? [])]
    const playing = els.filter(e => !e.paused)
    out.push(`медиа-элементов ${els.length}, играет ${playing.length}${playing.length ? ` (${playing.map(e => `${e.tagName.toLowerCase()}${e.muted ? ':muted' : ''}`).join(',')})` : ''}`)
  } catch { /* без документа */ }
  try { out.push(`фокус=${doc?.hasFocus?.() ? 'да' : 'нет'}, visibility=${doc?.visibilityState ?? '—'}, mediaSession=${nav?.mediaSession?.playbackState ?? '—'}`) } catch { /* без документа */ }
  try {
    for (const t of stream?.getTracks?.() ?? []) { const s = t.getSettings?.() ?? {}; out.push(`дорожка «${t.label || '—'}» ${t.readyState}${t.muted ? '/muted' : ''}${t.enabled === false ? '/off' : ''}, ${s.sampleRate ?? '—'} Гц, id ${s.deviceId ? String(s.deviceId).slice(0, 6) : '—'}`) }
  } catch { /* без потока */ }
  return out
}
