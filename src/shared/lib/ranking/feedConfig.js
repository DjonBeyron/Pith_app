import { SIGNALS, isLiveSignal } from './signalRegistry.js'

// Конфиг движка ленты — JSON в app_settings под ключом 'feed_signals'
// (история версий — 'feed_signals_history', см. shared/api/feedSignalsApi.js):
// {
//   version: 1,
//   engine: 'legacy' | 'weighted',   // legacy — прежний rankFeed, конфиг не влияет
//   signals: { [id]: { enabled, weight 0..100 } },
//   rules: { exploreEvery, maxSameTypeInRow },  // жёсткие правила поверх весов
//   updatedAt, updatedBy, note
// }
// Веса по умолчанию подобраны так, чтобы 'weighted' в обычных случаях давал
// порядок, близкий к legacy: шаг «зоны памяти» (60/3 = 20) равен штрафу за
// пролист (20), а сложность + порядок админа + жребий (8+6+3 = 17) вместе
// меньше одного шага — не могут перепрыгнуть ступень памяти. Отличие от legacy:
// сложность (проще — раньше) действует на всех ступенях, а не только среди
// «все слова временные»; порядок админа — следом за ней.

export const CONFIG_VERSION = 1
export const ENGINES = ['legacy', 'weighted']
export const WEIGHT_MIN = 0
export const WEIGHT_MAX = 100

export const DEFAULT_RULES = {
  exploreEvery: 6,        // каждая N-я позиция — случайная фраза из хвоста (0 — выкл)
  maxSameTypeInRow: 0,    // не больше N слайдов одного типа подряд (0 — выкл; нужен module.type)
}
const RULE_LIMITS = { exploreEvery: [0, 30], maxSameTypeInRow: [0, 10] }

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const toInt = (v, def) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : def)

export function defaultSignals() {
  return Object.fromEntries(SIGNALS.map(s => [s.id, { enabled: !!s.defaultEnabled && s.status === 'live', weight: s.defaultWeight }]))
}

export const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  engine: 'legacy',
  signals: defaultSignals(),
  rules: { ...DEFAULT_RULES },
  updatedAt: null,
  updatedBy: null,
  note: '',
})

// Устойчиво к мусору: не-объект → дефолт; неизвестные id отброшены; веса зажаты
// 0..100 и округлены; не-live сигнал не может быть включён (вес сохраняем — на
// день, когда он станет live); старые/чужие версии — поля, которые понимаем
export function normalizeConfig(raw) {
  const src = isObj(raw) ? raw : {}
  const engine = ENGINES.includes(src.engine) ? src.engine : 'legacy'
  const signals = defaultSignals()
  if (isObj(src.signals)) {
    for (const [id, v] of Object.entries(src.signals)) {
      if (!signals[id] || !isObj(v)) continue
      const w = Number(v.weight)
      signals[id] = {
        enabled: isLiveSignal(id) && (typeof v.enabled === 'boolean' ? v.enabled : signals[id].enabled),
        weight: Number.isFinite(w) ? clampNum(Math.round(w), WEIGHT_MIN, WEIGHT_MAX) : signals[id].weight,
      }
    }
  }
  const rules = { ...DEFAULT_RULES }
  if (isObj(src.rules)) {
    for (const k of Object.keys(DEFAULT_RULES)) {
      const [lo, hi] = RULE_LIMITS[k]
      rules[k] = clampNum(toInt(src.rules[k], DEFAULT_RULES[k]), lo, hi)
    }
  }
  return {
    version: CONFIG_VERSION,
    engine,
    signals,
    rules,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : null,
    updatedBy: typeof src.updatedBy === 'string' ? src.updatedBy : null,
    note: typeof src.note === 'string' ? src.note.slice(0, 500) : '',
  }
}

// Строгая проверка (ничего не чинит): { ok, errors: [строки по-русски] }
export function validateConfig(raw) {
  const errors = []
  if (!isObj(raw)) return { ok: false, errors: ['конфиг не объект'] }
  if (raw.version !== CONFIG_VERSION) errors.push(`version должна быть ${CONFIG_VERSION}`)
  if (!ENGINES.includes(raw.engine)) errors.push(`engine: ${ENGINES.join(' | ')}`)
  if (!isObj(raw.signals)) errors.push('signals не объект')
  else {
    for (const [id, v] of Object.entries(raw.signals)) {
      if (!SIGNALS.some(s => s.id === id)) { errors.push(`неизвестный сигнал ${id}`); continue }
      if (!isObj(v)) { errors.push(`${id}: не объект`); continue }
      if (typeof v.enabled !== 'boolean') errors.push(`${id}.enabled не boolean`)
      if (!Number.isFinite(v.weight) || v.weight < WEIGHT_MIN || v.weight > WEIGHT_MAX) errors.push(`${id}.weight вне 0..100`)
      if (v.enabled && !isLiveSignal(id)) errors.push(`${id}: сигнал ещё не считается, включать нельзя`)
    }
  }
  if (raw.rules !== undefined) {
    if (!isObj(raw.rules)) errors.push('rules не объект')
    else for (const [k, v] of Object.entries(raw.rules)) {
      if (!RULE_LIMITS[k]) { errors.push(`неизвестное правило ${k}`); continue }
      const [lo, hi] = RULE_LIMITS[k]
      if (!Number.isInteger(v) || v < lo || v > hi) errors.push(`rules.${k} вне ${lo}..${hi}`)
    }
  }
  return { ok: errors.length === 0, errors }
}

// Защита от резких скачков: вес за одно сохранение меняется не больше чем на maxStep
export function clampStep(prev, next, maxStep = 20) {
  const p = Number.isFinite(Number(prev)) ? Number(prev) : 0
  const n = Number.isFinite(Number(next)) ? Number(next) : p
  return clampNum(Math.round(clampNum(n, p - maxStep, p + maxStep)), WEIGHT_MIN, WEIGHT_MAX)
}

// То же для всего конфига: каждый вес next зажат относительно prev
export function clampConfigStep(prevCfg, nextCfg, maxStep = 20) {
  const prev = normalizeConfig(prevCfg)
  const next = normalizeConfig(nextCfg)
  for (const id of Object.keys(next.signals)) {
    next.signals[id].weight = clampStep(prev.signals[id].weight, next.signals[id].weight, maxStep)
  }
  return next
}

// Включённые live-сигналы с нормализованными весами (сумма = 1); пусто — если все 0
export function activeWeights(config) {
  const cfg = normalizeConfig(config)
  const on = Object.entries(cfg.signals).filter(([id, s]) => s.enabled && s.weight > 0 && isLiveSignal(id))
  const total = on.reduce((acc, [, s]) => acc + s.weight, 0)
  return total > 0 ? new Map(on.map(([id, s]) => [id, s.weight / total])) : new Map()
}
