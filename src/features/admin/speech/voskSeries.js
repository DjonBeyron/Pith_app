// Усложнённый тест Vosk («Тест 3»): состояние (настройки + накопленные прогоны), запись одного прогона и поиск последнего результата.
// Прогон = одна запись: что просили сказать, что услышали, слова с уверенностью, исход (как сказано / подменил / отвергнуто…), условие, тайминги.
// Хранится в localStorage этого устройства (до 150 последних прогонов). Чистые функции без React.
import { STYLES, PAIR_PRESETS } from './voskGrammar.js'
import { classifyKey, parseWords, confOfKey } from './voskClassify.js'
import { classifyTrap, cleanTrapWord, TRAP_PRESETS } from './voskTraps.js'
import { afterSpeechMs, clampAutoStop, AUTOSTOP_DEFAULT } from '../../../shared/lib/vosk/voskTiming.js'

export const VOSK_SERIES_KEY = 'pithy_admin_vosk_series_v1'
export const MAX_RUNS = 150
export const CONDS = [
  { id: 'normal', label: 'обычно' }, { id: 'whisper', label: 'шёпот' }, { id: 'fast', label: 'быстро' },
  { id: 'quiet', label: 'тихо/далеко' }, { id: 'noise', label: 'шум вокруг' },
]
export const condLabel = id => CONDS.find(c => c.id === id)?.label ?? id
export const TABS = [{ id: 'ctx', label: 'A. Контекст' }, { id: 'trap', label: 'B. Ловушки' }, { id: 'pair', label: 'C. Пары' }]
export const MODE_LABEL = { error: 'говорю С ОШИБКОЙ (try …)', control: 'говорю ПРАВИЛЬНО (контроль)' }

export const emptyState = () => ({
  style: 'phrases', cond: 'normal', autoStop: AUTOSTOP_DEFAULT, session: false, tab: 'ctx', mode: 'error', step: 0,
  pair: PAIR_PRESETS[0].id, pairs: {}, trap: TRAP_PRESETS[0], trapWords: [], runs: [],
})

const str = (v, n) => String(v ?? '').slice(0, n)
const cleanRuns = raw => (Array.isArray(raw) ? raw : []).filter(r => r && typeof r === 'object' && typeof r.kind === 'string' && typeof r.out === 'string').slice(-MAX_RUNS)

export function sanitizeState(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const d = emptyState()
  const pairs = {}
  for (const p of PAIR_PRESETS) { // правки пар: только известные id, только строки
    const e = o.pairs?.[p.id]
    if (e && typeof e.ok === 'string' && typeof e.bad === 'string' && e.ok.trim() && e.bad.trim()) pairs[p.id] = { ok: str(e.ok, 80), bad: str(e.bad, 80) }
  }
  return {
    style: STYLES.includes(o.style) ? o.style : d.style, cond: CONDS.some(c => c.id === o.cond) ? o.cond : d.cond,
    autoStop: o.autoStop == null ? d.autoStop : clampAutoStop(o.autoStop), session: o.session === true,
    tab: TABS.some(t => t.id === o.tab) ? o.tab : d.tab, mode: o.mode === 'control' ? 'control' : 'error',
    step: [0, 1, 2, 3].includes(o.step) ? o.step : 0, pair: PAIR_PRESETS.some(p => p.id === o.pair) ? o.pair : d.pair, pairs,
    trap: str(o.trap, 20) || d.trap, trapWords: (Array.isArray(o.trapWords) ? o.trapWords : []).map(cleanTrapWord).filter(Boolean).slice(0, 8),
    runs: cleanRuns(o.runs),
  }
}

export function readState(store = globalThis.localStorage) {
  try { return sanitizeState(JSON.parse(store.getItem(VOSK_SERIES_KEY))) } catch { return emptyState() }
}
export function writeState(state, store = globalThis.localStorage) {
  try { store.setItem(VOSK_SERIES_KEY, JSON.stringify(state)) } catch { /* приватный режим — серия живёт до перезагрузки */ }
}

/** Пара с учётом правок пользователя */
export const pairOf = (state, id) => {
  const p = PAIR_PRESETS.find(x => x.id === id) ?? PAIR_PRESETS[0]
  return { ...p, ...(state.pairs[p.id] ?? {}) }
}

/**
 * Прогон из спецификации (grammar.js: ctxSpec/pairSpec, traps.js: trapSpec/silenceSpec) и ответа движка.
 * ctx = { style, cond, ses } — настройки в момент нажатия; stats — { words, firstPartialMs, resultMs, readyMs, audioStartMs, stopBy }
 */
export function makeRun(spec, text, stats = {}, ctx = {}, now = Date.now()) {
  const heard = String(text ?? '').trim()
  const ws = parseWords(stats.words)
  const trap = spec.kind === 'trap' || spec.kind === 'silence'
  const c = trap ? classifyTrap(heard, spec.allowed) : classifyKey({ heard, keys: spec.keys })
  const decisive = trap ? c.sw : c.out === 'asis' ? spec.keys.say : c.sw
  return {
    t: now, kind: spec.kind, mode: spec.mode, step: spec.step, tag: spec.tag, style: ctx.style ?? 'phrases', cond: ctx.cond ?? 'normal', ses: ctx.ses ?? null,
    said: spec.said, correct: spec.correct, keys: spec.keys, heard, ws, out: c.out, sw: c.sw, kc: confOfKey(ws, decisive),
    tm: {
      fp: stats.firstPartialMs ?? null, res: stats.resultMs ?? null, tap: stats.readyMs ?? null, mic: stats.micMs ?? null,
      end: afterSpeechMs({ resultMs: stats.resultMs, audioStartMs: stats.audioStartMs, words: ws }), by: stats.stopBy ?? null,
    },
  }
}

export const addRun = (state, run) => ({ ...state, runs: [...state.runs, run].slice(-MAX_RUNS) })

/** Последний прогон, у которого совпали все поля фильтра: latestRun(runs, { kind: 'ctx', step: 1, mode: 'error', style: 'words' }) */
export function latestRun(runs, filter) {
  for (let i = (runs || []).length - 1; i >= 0; i--) {
    if (Object.entries(filter).every(([k, v]) => runs[i][k] === v)) return runs[i]
  }
  return null
}
