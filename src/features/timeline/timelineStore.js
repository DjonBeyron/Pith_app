// Прохождения «Таймлайна игры» из двух источников — память страницы («это устройство», sceneTrace.runs()) и сервер (shared/api/timelineApi.js): упаковка прохождения для сервера, признак «игра доиграна»,
// общий список для выбора на экране без повторов и подписи источника («это устройство · №2 · 12:41» / «сервер · iPhone 390×844 · 22.11 12:41 · v3.3.339»). Чистые функции без React и сети.
import { APP_VERSION } from '../../shared/lib/version.js'

const two = n => String(n).padStart(2, '0')
export const hasScene = r => !!r?.events?.some(e => e.k === 'stage-in' || e.k === 'line-start')

/** Устройство коротко: платформа и размер экрана — «iPhone 390×844», «Windows 1920×1080» */
export function deviceLabel(env = globalThis) {
  const nav = env.navigator ?? {}, ua = String(nav.userAgent ?? ''), touch = (nav.maxTouchPoints ?? 0) > 1
  const name = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'устройство'
  const w = env.screen?.width, h = env.screen?.height
  return `${name}${w && h ? ` ${w}×${h}` : ''}`
}

/** id прохождения на сервере: время старта и номер в сеансе — одно и то же прохождение при повторном сохранении заменяет себя, а не дублируется */
export const serverId = run => `${Number(run?.at || 0).toString(36)}-${run?.id ?? 0}`

/** Прохождение трассы → запись для сервера { id, savedAt, at, device, appVersion, meta, events, dropped } (события — копия: трасса ещё дописывается) */
export function packRun(run, { now = new Date(), device = deviceLabel(), appVersion = APP_VERSION } = {}) {
  return { id: serverId(run), savedAt: now.toISOString(), at: run?.at ?? null, device, appVersion, meta: { ...run?.meta }, events: (run?.events ?? []).slice(), dropped: run?.dropped ?? 0 }
}

/** Игра доиграна: есть end и игра дошла до итога (или до последней стадии списка — у прохождения одного раунда итога нет). Вышел раньше — false */
export function isFinished(run) {
  const ev = run?.events ?? []
  if (!ev.some(e => e.k === 'end')) return false
  const ins = ev.filter(e => e.k === 'stage-in'), total = Number(run?.meta?.stages) || 0
  return ins.some(e => e.type === 'summary') || (total > 0 && ins.some(e => Number(e.idx) >= total - 1))
}

/** Прохождение этого устройства и запись сервера — одно и то же: совпал id, либо первый t и число событий */
export const sameRun = (local, srv) => srv.id === serverId(local) || (local.events.length > 0 && srv.events.length === local.events.length && srv.events[0]?.t === local.events[0]?.t)

const hhmm = d => `${two(d.getHours())}:${two(d.getMinutes())}`
const game = meta => (meta?.game ? `${meta.game}${meta.only ? `/${meta.only}` : ''}` : '')
/** Время записи сервера: «12:41» сегодня, иначе «22.11 12:41» */
export function savedWhen(iso, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toDateString() === now.toDateString() ? hhmm(d) : `${two(d.getDate())}.${two(d.getMonth() + 1)} ${hhmm(d)}`
}

/**
 * Общий список прохождений для экрана: сначала сохранённые на сервере (старые первыми), потом этого устройства. Повторы убраны: запись сервера, совпавшая с прохождением этого устройства, не показывается
 * (у него пометка saved), одинаковые записи сервера (id + savedAt) — один раз. → [{ key, src: 'local' | 'server', run, saved, label }]
 */
export function sourceList(local = [], server = [], now = new Date()) {
  const mine = local.filter(hasScene), seen = new Set(), out = []
  for (const r of server.filter(hasScene)) {
    const key = `s:${r.id}|${r.savedAt}`
    if (seen.has(key) || mine.some(l => sameRun(l, r))) continue
    seen.add(key)
    out.push({ key, src: 'server', run: r, saved: true, label: ['сервер', r.device, savedWhen(r.savedAt, now), r.appVersion ? `v${r.appVersion}` : '', game(r.meta), `${r.events.length} соб.`].filter(Boolean).join(' · ') })
  }
  for (const r of mine) {
    const saved = server.some(s => sameRun(r, s))
    out.push({ key: `l:${r.id}`, src: 'local', run: r, saved, label: ['это устройство', `№${r.id}`, r.at ? hhmm(new Date(r.at)) : '', game(r.meta), `${r.events.length} соб.`, saved ? '☁ на сервере' : ''].filter(Boolean).join(' · ') })
  }
  return out
}
