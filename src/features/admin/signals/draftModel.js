import { normalizeConfig, validateConfig, clampConfigStep, DEFAULT_CONFIG, WEIGHT_MIN, WEIGHT_MAX } from '../../../shared/lib/ranking/feedConfig.js'
import { isLiveSignal, signalById } from '../../../shared/lib/ranking/signalRegistry.js'

// Черновик конфига движка ленты в окне «Сигналы ленты» (этап 2). Чистые функции
// без React: правки черновика, проверка «есть ли несохранённое», доли весов,
// предупреждения, подготовка к сохранению (зажим шага ≤ MAX_STEP), сравнение
// версий, экспорт/импорт JSON. Состояние держит useSignalsDraft.js.

export const MAX_STEP = 20
export const DOMINANT_SHARE = 0.6 // один сигнал больше 60% суммы весов — предупреждение

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Чистая копия без штампов версии: черновик — это ещё не версия
export function createDraft(config) {
  const cfg = normalizeConfig(config)
  return { ...cfg, signals: Object.fromEntries(Object.entries(cfg.signals).map(([id, s]) => [id, { ...s }])), rules: { ...cfg.rules } }
}

export function setWeight(draft, id, weight) {
  if (!draft.signals[id] || !isLiveSignal(id)) return draft
  const w = clamp(Math.round(Number(weight) || 0), WEIGHT_MIN, WEIGHT_MAX)
  if (w === draft.signals[id].weight) return draft
  return { ...draft, signals: { ...draft.signals, [id]: { ...draft.signals[id], weight: w } } }
}

export function setEnabled(draft, id, enabled) {
  if (!draft.signals[id] || !isLiveSignal(id)) return draft
  const on = !!enabled
  if (on === draft.signals[id].enabled) return draft
  return { ...draft, signals: { ...draft.signals, [id]: { ...draft.signals[id], enabled: on } } }
}

export const setEngine = (draft, engine) => (engine === draft.engine ? draft : { ...draft, engine: engine === 'weighted' ? 'weighted' : 'legacy' })

export function setRule(draft, key, value) {
  if (!(key in draft.rules)) return draft
  const next = normalizeConfig({ ...draft, rules: { ...draft.rules, [key]: value } })
  return { ...draft, rules: next.rules }
}

export const defaultsDraft = () => createDraft(DEFAULT_CONFIG)

// Сравнение по смыслу: штампы (updatedAt/updatedBy/note) не считаются правкой
const essence = cfg => JSON.stringify({ engine: cfg.engine, signals: cfg.signals, rules: cfg.rules })
export const isDirty = (draft, base) => essence(normalizeConfig(draft)) !== essence(normalizeConfig(base))

// Доля каждого включённого live-сигнала в сумме весов (0..1); выключенные — 0
export function weightShares(draft) {
  const on = Object.entries(draft.signals).filter(([id, s]) => s.enabled && isLiveSignal(id))
  const total = on.reduce((acc, [, s]) => acc + s.weight, 0)
  const shares = Object.fromEntries(Object.keys(draft.signals).map(id => [id, 0]))
  if (total > 0) for (const [id, s] of on) shares[id] = s.weight / total
  return { shares, total }
}

// Предупреждения валидатора (не блокируют сохранение): [{ code, text }]
export function draftWarnings(draft) {
  const out = []
  const { shares, total } = weightShares(draft)
  const liveOn = Object.entries(draft.signals).filter(([id, s]) => s.enabled && isLiveSignal(id))
  if (draft.engine === 'weighted' && !liveOn.length) {
    out.push({ code: 'no_live', text: 'Движок weighted включён, но ни один живой сигнал не включён — лента пойдёт чистым порядком админа.' })
  }
  if (liveOn.length && total === 0) {
    out.push({ code: 'all_zero', text: 'Все включённые сигналы с нулевым весом — порядок ленты определит только порядок админа.' })
  }
  for (const [id, share] of Object.entries(shares)) {
    if (share > DOMINANT_SHARE) {
      out.push({ code: 'dominant', id, text: `«${signalById(id)?.title ?? id}» занимает ${Math.round(share * 100)}% суммы весов — остальные сигналы почти не влияют.` })
    }
  }
  return out
}

// К сохранению: зажим шага веса (≤ MAX_STEP за одно сохранение относительно base).
// clamped — что именно зажато, для предупреждения админу
export function prepareSave(base, draft, maxStep = MAX_STEP) {
  const next = clampConfigStep(base, draft, maxStep)
  const want = normalizeConfig(draft)
  const clamped = []
  for (const id of Object.keys(next.signals)) {
    if (next.signals[id].weight !== want.signals[id].weight) {
      clamped.push({ id, title: signalById(id)?.title ?? id, wanted: want.signals[id].weight, got: next.signals[id].weight })
    }
  }
  return { config: next, clamped }
}

// Что изменилось между двумя конфигами: [{ kind, id?, from, to, text }]
export function configDiff(a, b) {
  const x = normalizeConfig(a), y = normalizeConfig(b)
  const out = []
  if (x.engine !== y.engine) out.push({ kind: 'engine', from: x.engine, to: y.engine, text: `движок ${x.engine} → ${y.engine}` })
  for (const id of Object.keys(y.signals)) {
    const p = x.signals[id], n = y.signals[id]
    const title = signalById(id)?.title ?? id
    if (p.enabled !== n.enabled) out.push({ kind: 'enabled', id, from: p.enabled, to: n.enabled, text: `${title}: ${n.enabled ? 'включён' : 'выключен'}` })
    if (p.weight !== n.weight) out.push({ kind: 'weight', id, from: p.weight, to: n.weight, text: `${title}: ${p.weight} → ${n.weight}` })
  }
  for (const k of Object.keys(y.rules)) {
    if (x.rules[k] !== y.rules[k]) out.push({ kind: 'rule', id: k, from: x.rules[k], to: y.rules[k], text: `правило ${k}: ${x.rules[k]} → ${y.rules[k]}` })
  }
  return out
}

// Экспорт: только смысловые поля (штампы ставит сервер при сохранении)
export function exportJson(draft) {
  const cfg = normalizeConfig(draft)
  return JSON.stringify({ version: cfg.version, engine: cfg.engine, signals: cfg.signals, rules: cfg.rules, note: cfg.note }, null, 2)
}

// Импорт: { ok, config?, errors: [строки по-русски] }. Разрешён частичный
// signals (остальное — из дефолта); штампы игнорируются
export function importJson(text) {
  let raw
  try { raw = JSON.parse(String(text ?? '')) } catch { return { ok: false, errors: ['Это не JSON: проверь кавычки и запятые'] } }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Ожидается объект { version, engine, signals, rules }'] }
  const probe = { ...raw, version: raw.version ?? 1 }
  delete probe.updatedAt; delete probe.updatedBy; delete probe.note
  const v = validateConfig(probe)
  if (!v.ok) return { ok: false, errors: v.errors }
  return { ok: true, config: createDraft({ ...normalizeConfig(probe), note: typeof raw.note === 'string' ? raw.note : '' }), errors: [] }
}
