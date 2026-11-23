// «Какая настройка дала эту тишину» (CONCEPT_TIMELINE.md, «Шаг 2: паузы как настройки — экран»): события трассы → отрезки ожиданий по настройкам пауз, и разложение любого зазора / паузы на эти отрезки.
// Модель таймлайна (timelineModel.buildTimeline) не меняется: настройки читаются из тех же событий отдельно — старые прохождения и события knob её не ломают. Чистые функции без React.
// Источники в трассе (shared/lib/scenePauseTrace.js):
//  • событие knob { t, key, ms, from, until, sid, set } — «с этого мгновения идёт ожидание по настройке key длиной ms» → отрезок [t, t + ms];
//  • поле pauses у stage-in [{ key, ms, as, set }] — что запечено в стадию. Когда именно оно отсчитывается, в трассе НЕТ — отрезок ставится по смыслу роли as:
//      'ms' (минимум плашки, заставка Мии), 'lead' (реплика этапа после плашки), 'pit1' (первая реплика Пита в экзамене) — от начала стадии;
//      'pause', 'lineTail' (плашка после слов Пита) — от конца первой реплики, договорённой в этой стадии (нет такой — от начала стадии). Это ОЦЕНКА: помечено how: 'stage'.
//  • событие run: pauses «ключ=мс,…» — что было переопределено в этой игре.
// Прохождение без единого knob и без pauses (игра до v3.3.351) — recorded: false.
import { pauseInfo, parsePausesParam, validatePauses, SCENE_PAUSES } from '../../shared/lib/scenePauses.js'
import { sec as dur } from './montage/montageEditsText.js' // секунды до сотых: шаг настройки 50 мс, одной десятой мало

export const START_SLACK_MS = 100 // настройка, стартовавшая в начале зазора ± столько, относится к нему
export const MIN_PART_MS = 20     // пересечение короче — не считается
export const REST_WHY = { player: 'ждём игрока', anim: 'анимация без речи', count: 'отсчёт нотами', wait: 'ждём технику', paused: 'игра на паузе', mixed: 'ждём игрока, отсчёт, анимация — это не настройки', dead: 'анимация, кадры, длина звука — в трассе не записано' }
const AFTER_LINE = ['pause', 'lineTail']

/** События прохождения → { recorded, spans: [{ t, end, key, ms, set, how: 'knob' | 'stage', from, until, sid, as }], overrides: { ключ: мс } } (время — мс от начала прохождения) */
export function collectKnobs(events = [], meta = {}) {
  const evs = (events ?? []).filter(e => e && Number.isFinite(e.t)), t0 = evs.length ? evs[0].t : 0
  const spans = []
  let recorded = false
  const stages = evs.filter(e => e.k === 'stage-in')
  for (const e of evs) {
    if (e.k === 'knob' && pauseInfo(e.key)) { recorded = true; const t = e.t - t0, ms = Number(e.ms) || 0; spans.push({ t, end: t + ms, key: e.key, ms, set: !!e.set, how: 'knob', from: e.from ?? null, until: e.until ?? null, sid: e.sid ?? null }) }
  }
  stages.forEach((s, i) => {
    if (!Array.isArray(s.pauses)) return
    recorded = true
    const end = stages[i + 1]?.t ?? Infinity
    const said = evs.find(e => e.k === 'line-end' && e.t >= s.t && e.t < end)
    for (const p of s.pauses) {
      if (!pauseInfo(p?.key)) continue
      const ms = Number(p.ms) || 0, t = (AFTER_LINE.includes(p.as) && said ? said.t : s.t) - t0
      spans.push({ t, end: t + ms, key: p.key, ms, set: !!p.set, how: 'stage', as: p.as ?? null, sid: s.sid ?? null, from: null, until: null })
    }
  })
  const run = evs.find(e => e.k === 'run'), raw = meta?.pauses ?? run?.pauses ?? null
  const overrides = validatePauses(typeof raw === 'string' ? parsePausesParam(raw) : raw ?? {}).pauses
  return { recorded, spans: spans.sort((a, b) => a.t - b.t), overrides }
}

/**
 * Отрезок тишины { t, end, kind } → разложение: { recorded, ms, parts: [{ key, title, where, ms (значение настройки), part (сколько мс зазора она покрывает), set, how }], covered, rest, restWhy }.
 * Настройка относится к зазору, если её отрезок пересекает зазор (≥ MIN_PART_MS) или стартовал в его начале ± START_SLACK_MS. Сумма part может быть больше covered (настройки идут одновременно).
 */
export function gapKnobs(span, k) {
  const a = span.t, b = span.end ?? span.t, ms = Math.max(0, b - a)
  if (!k?.recorded) return { recorded: false, ms, parts: [], covered: 0, rest: ms, restWhy: REST_WHY[span.kind] ?? REST_WHY.dead }
  const hit = []
  for (const s of k.spans) {
    if (s.t > b) break
    const part = Math.max(0, Math.min(b, s.end) - Math.max(a, s.t))
    if (part >= MIN_PART_MS || (s.ms > 0 && Math.abs(s.t - a) <= START_SLACK_MS && s.t < b)) hit.push({ s, part })
  }
  let covered = 0, at = a
  for (const { s } of hit.slice().sort((x, y) => x.s.t - y.s.t)) { const from = Math.max(at, s.t), to = Math.min(b, s.end); if (to > from) { covered += to - from; at = to } }
  const parts = hit.map(({ s, part }) => { const p = pauseInfo(s.key); return { key: s.key, title: p.title, where: p.where, ms: s.ms, part: Math.round(part), set: s.set, how: s.how } })
  return { recorded: true, ms, parts, covered: Math.round(covered), rest: Math.max(0, Math.round(ms - covered)), restWhy: REST_WHY[span.kind] ?? REST_WHY.dead }
}

/** Разложение одной строкой: «зазор 2,4 с = настройка «Конец круга» 1,3 с + … + остальное 0,85 с (…)» */
export function gapKnobText(r) {
  if (!r.recorded) return 'в этой игре настройки не записаны (игра до v3.3.351) — сыграй заново'
  if (!r.parts.length) return `настройками не задана: ${dur(r.ms)} — ${r.restWhy}`
  const parts = r.parts.map(p => `настройка «${p.title}» ${dur(p.ms)}${p.set ? ' (изменена)' : ''}${p.part < p.ms - MIN_PART_MS ? ` — в этой тишине ${dur(p.part)}` : ''}`)
  return `зазор ${dur(r.ms)} = ${parts.join(' + ')}${r.rest >= MIN_PART_MS ? ` + остальное ${dur(r.rest)} (${r.restWhy})` : ''}`
}

/** Для отчёта: «настройки: Конец круга 1,3 с (по умолчанию) + …; остальное 0,9 с» */
export function gapKnobReport(r) {
  if (!r.recorded) return 'настройки: в этой игре не записаны (игра до v3.3.351)'
  if (!r.parts.length) return `настройки: нет — ${r.restWhy}`
  return `настройки: ${r.parts.map(p => `${p.title} ${dur(p.ms)} (${p.set ? 'изменена' : 'по умолчанию'}) [${p.key}]`).join(' + ')}${r.rest >= MIN_PART_MS ? `; остальное ${dur(r.rest)} — ${r.restWhy}` : ''}`
}

/** Сколько раз каждая настройка сработала в игре и сколько секунд дала: { ключ: { n, ms } } */
export function knobUsage(k) {
  const out = Object.fromEntries(SCENE_PAUSES.map(p => [p.key, { n: 0, ms: 0 }]))
  for (const s of k?.spans ?? []) { out[s.key].n += 1; out[s.key].ms += s.ms }
  return out
}

/** Оценка «эта игра стала бы короче на X мс», если настройка key станет to (отрицательное — длиннее): число срабатываний × разница с тем, что действовало в игре */
export function shorterBy(k, key, to) {
  let sum = 0
  for (const s of k?.spans ?? []) if (s.key === key) sum += s.ms - to
  return sum
}

/** Действовавшие в игре переопределения словами: «Конец круга 2,0 с (было 1,3 с), …» или '' */
export const overridesText = ov => Object.entries(ov ?? {}).map(([key, ms]) => { const p = pauseInfo(key); return p ? `${p.title} ${dur(ms)} (по умолчанию ${dur(p.def)})` : null }).filter(Boolean).join(', ')

/** Значок зазора на столе: 'set' — среди настроек зазора есть изменённая, 'def' — задан настройками по умолчанию, null — настройками не задан */
export const gapKnobMark = r => (!r.recorded || !r.parts.length ? null : r.parts.some(p => p.set) ? 'set' : 'def')

/**
 * Правка монтажа «зазор from → to» → изменение настройки, если зазор целиком (или почти: ≥ ONE_KNOB_SHARE сдвигаемой части flex) задан ОДНОЙ настройкой: { key, title, from (значение в игре), to, clamped }.
 * to — значение в игре минус то, что убрала правка, к шагу настройки и в её пределы (clamped: true — упёрлось в предел). null — настройка не одна, её доля мала или правки нет.
 */
export const ONE_KNOB_SHARE = 0.8
export function knobForEdit(r, flex, edit) {
  if (!r?.recorded || !edit) return null
  const keys = [...new Set(r.parts.map(p => p.key))]
  if (keys.length !== 1) return null
  const part = r.parts.reduce((m, p) => Math.max(m, p.part), 0), p = pauseInfo(keys[0]), ms = r.parts[0].ms
  if (!(flex > 0) || part < ONE_KNOB_SHARE * flex) return null
  const raw = Math.round((ms - (edit.from - edit.to)) / p.step) * p.step, to = Math.min(p.max, Math.max(p.min, raw))
  return to === ms ? null : { key: p.key, title: p.title, from: ms, to, clamped: to !== raw }
}
