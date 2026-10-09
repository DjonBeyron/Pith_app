// «Серия из 6 нажатий подряд» по стратегиям перезапуска (проба «Голос», надёжность второго запуска). Пользователь говорит фразу 6 раз подряд, каждый
// раз нажимая «Сказать»; результат каждого нажатия (заход со всеми автоповторами) — ok (пришёл текст) / deaf («глухой» запуск, нет звука) / error.
// По стратегиям S1…S5 считаем: успешных из 6, глухих, среднее время до audiostart и result; выводим лучшую стратегию. Хранится в localStorage этого
// устройства, на сервер не уходит. Чистые функции без React.
import { STRATEGY_IDS } from '../../../shared/lib/speech/speechRestart.js'

export const SERIES_KEY = 'pithy_admin_voice_restart_series_v1'
export const SERIES_SIZE = 6

export const emptyState = () => ({ active: null, results: {} })

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Один заход (нажатие «Сказать») из записей журнала его попыток по порядку (retry 0, 1, 2) */
export function summarizeRun(attempts) {
  const list = [...attempts].sort((a, b) => (a.retry ?? 0) - (b.retry ?? 0))
  const first = list[0]
  const done = list.find(e => e.outcome === 'ok')
  const deafAttempts = list.filter(e => e.deaf).length
  const quiet = first.error === 'silence' || first.error === 'no-speech'
  return {
    no: first.run ?? null, strategy: first.strategy ?? null, at: list[list.length - 1].t,
    cls: done ? 'ok' : deafAttempts ? 'deaf' : 'error',
    first: first.outcome === 'ok' ? 'ok' : first.deaf ? 'deaf' : first.outcome === 'stopped' ? 'stopped' : quiet ? 'quiet' : 'error',
    deafAttempts, attempts: list.length, recovered: !!done && list.some(e => e.deaf_retry),
    audio: num(first.msAudio), result: done ? num(done.msResult) : null, gap: num(first.gapMs),
    heard: done?.tx?.top1?.text ?? null, err: done ? null : (first.error ?? null), // что услышали (для карточки попытки) и причина ошибки
  }
}

const mean = list => { const v = list.filter(x => x != null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null }

export function statsOf(runs) {
  return {
    n: runs.length, ok: runs.filter(r => r.cls === 'ok').length, deaf: runs.filter(r => r.cls === 'deaf').length, err: runs.filter(r => r.cls === 'error').length,
    deafRuns: runs.filter(r => r.deafAttempts > 0).length, deafAttempts: runs.reduce((s, r) => s + r.deafAttempts, 0),
    recovered: runs.filter(r => r.recovered).length, audio: mean(runs.map(r => r.audio)), result: mean(runs.map(r => r.result)),
  }
}

// ---- состояние серии ----
export const startSeries = (state, strategy, lang = '') => ({ ...state, active: { strategy, lang, runs: [] } })
export const cancelSeries = state => ({ ...state, active: null })
export function clearResults(state) { return { ...state, results: {} } }

/** Заход (записи попыток) → состояние: учитывается только в активной серии той же стратегии; на SERIES_SIZE нажатиях серия завершается и заменяет прежний итог стратегии */
export function addRun(state, attempts) {
  if (!state.active || !attempts.length) return state
  const run = summarizeRun(attempts)
  if (run.strategy !== state.active.strategy) return state
  const runs = [...state.active.runs, run]
  if (runs.length < SERIES_SIZE) return { ...state, active: { ...state.active, runs } }
  const { strategy, lang } = state.active
  return { active: null, results: { ...state.results, [strategy]: { at: run.at, lang, runs } } }
}

export function sanitizeState(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const okRun = r => r && typeof r === 'object' && ['ok', 'deaf', 'error'].includes(r.cls)
  const results = {}
  for (const id of STRATEGY_IDS) {
    const x = o.results?.[id]
    if (x && Array.isArray(x.runs)) results[id] = { at: num(x.at), lang: String(x.lang ?? ''), runs: x.runs.filter(okRun).slice(0, SERIES_SIZE) }
  }
  const a = o.active
  const active = a && STRATEGY_IDS.includes(a.strategy) && Array.isArray(a.runs) ? { strategy: a.strategy, lang: String(a.lang ?? ''), runs: a.runs.filter(okRun).slice(0, SERIES_SIZE - 1) } : null
  return { active, results }
}

export function readState(store = globalThis.localStorage) {
  try { return sanitizeState(JSON.parse(store.getItem(SERIES_KEY))) } catch { return emptyState() }
}

export function writeState(state, store = globalThis.localStorage) {
  try { store.setItem(SERIES_KEY, JSON.stringify(state)) } catch { /* приватный режим — серия живёт до перезагрузки */ }
}

// ---- таблица и выводы ----
/** Строки по S1…S5: завершённая серия или идущая (partial); нет данных → data: null */
export function tableRows(state) {
  return STRATEGY_IDS.map(id => {
    const act = state.active?.strategy === id ? state.active : null
    const src = act ?? state.results[id]
    return { id, partial: !!act, lang: src?.lang ?? '', stats: src ? statsOf(src.runs) : null, runs: src?.runs ?? [] }
  })
}

/** Лучшая: больше успешных, затем меньше глухих, затем быстрее результат; в расчёте только завершённые серии */
export function rankStrategies(state) {
  const done = STRATEGY_IDS.filter(id => state.results[id]?.runs.length).map(id => ({ id, ...statsOf(state.results[id].runs) }))
  return done.sort((a, b) => b.ok - a.ok || a.deafRuns - b.deafRuns || (a.result ?? 1e9) - (b.result ?? 1e9))
}

const sec = ms => (ms == null ? '?' : `${(ms / 1000).toFixed(1)} с`)

export function conclusions(state) {
  const ranked = rankStrategies(state)
  if (!ranked.length) return ['Данных нет: выберите стратегию и пройдите серию из 6 нажатий.']
  const out = []
  const best = ranked[0]
  const tied = ranked.filter(r => r.ok === best.ok && r.deafRuns === best.deafRuns).map(r => r.id)
  out.push(`Лучшая: ${tied.join(' = ')} — ${best.ok} из ${best.n} успешных, глухих запусков ${best.deafRuns}${best.result != null ? `, до result ≈ ${sec(best.result)}` : ''}${tied.length > 1 ? ' (результаты равны, выбирайте проще/быстрее)' : ''}.`)
  const base = ranked.find(r => r.id === 'S1')
  if (base) {
    if (base.deafRuns > 0) out.push(`S1 (как сейчас): ${base.ok} из ${base.n}, глухих ${base.deafRuns} — проблема воспроизводится.${best.id !== 'S1' && best.ok > base.ok ? ` ${best.id} лучше на ${best.ok - base.ok} успешных.` : ''}`)
    else out.push(`S1 (как сейчас): глухих запусков не было (${base.ok} из ${base.n}) — проблема не воспроизвелась, различие стратегий оценить нельзя; повторите на iPhone.`)
  } else out.push('Нет серии для S1 (как сейчас) — не с чем сравнить.')
  const worse = ranked.filter(r => r.deafRuns > 0 && r.id !== 'S1').map(r => `${r.id} (${r.deafRuns})`)
  if (worse.length) out.push(`Глухие запуски остались у: ${worse.join(', ')}.`)
  const rec = ranked.filter(r => r.recovered > 0).map(r => `${r.id}: ${r.recovered}`)
  if (rec.length) out.push(`Авто-восстановление (deaf_retry) спасло заходов: ${rec.join(', ')}.`)
  const missing = STRATEGY_IDS.filter(id => !state.results[id])
  if (missing.length) out.push(`Серии нет для: ${missing.join(', ')}.`)
  return out
}

const CLS = { ok: 'ок', deaf: 'ГЛУХОЙ', error: 'ошибка' }

/** Текст «Скопировать итог серии стратегий» — компактно: строка на стратегию, заходы по порядку, выводы */
export function seriesLines(state, label = '') {
  const out = [`СЕРИЯ СТРАТЕГИЙ ПЕРЕЗАПУСКА (по ${SERIES_SIZE} нажатий)${label ? ` · ${label}` : ''}`]
  for (const row of tableRows(state)) {
    if (!row.stats) { out.push(`${row.id} | нет данных`); continue }
    const s = row.stats
    out.push(`${row.id}${row.partial ? ' (идёт)' : ''} | ${s.ok}/${s.n} ок | глухих ${s.deafRuns} (попыток ${s.deafAttempts}) | ошибок ${s.err} | audiostart ≈ ${s.audio ?? '?'} мс | result ≈ ${s.result ?? '?'} мс | ${row.lang || '?'} | ${row.runs.map(r => CLS[r.cls] + (r.recovered ? '*' : '')).join(' ')}`)
  }
  out.push('(* — заход спасён авто-повтором deaf_retry)')
  out.push(...conclusions(state).map(c => `> ${c}`))
  return out
}
