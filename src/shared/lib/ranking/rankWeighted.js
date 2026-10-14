import { SIGNALS, signalById } from './signalRegistry.js'
import { normalizeConfig, activeWeights } from './feedConfig.js'
import { applyExploreSlots, applyMaxSameTypeInRow } from './rankRules.js'

// Взвешенный движок порядка ленты (engine 'weighted'). Чистые функции, без React.
//
// rankModules(modules, ctx, config) → [{ module, score, parts, reasons }]
//   score  — Σ weight_i · value_i по включённым live-сигналам, веса нормализованы
//            (сумма 1) → 0..1; при равных — порядок админа (index).
//   parts  — [{ id, title, value, weight, contribution }] для окна «почему так».
//   reasons — до 3 коротких строк по самым весомым вкладам.
// Детерминированно: случайность только через ctx.seed (сид дня).
//
// ctx (собирает лента, см. features/feed/feedRankEngine.js):
//   { stepOf, skipped, seed, analyze(module) → { words, info }, minDifficultyVotes }
// Выполняется один раз при сборке списка (useMemo в useFeedModules), не при рендере слайда.

function buildItems(modules, ctx) {
  const analyze = ctx.analyze ?? (() => ({ words: [], info: { total: 0, newWords: [], shaky: [] } }))
  const items = modules.map((module, index) => ({ module, index, ...analyze(module) }))
  // Слова быстро пролистанных фраз — один проход, не на каждый сигнал
  const skippedWords = new Set()
  if (ctx.skipped?.size) for (const it of items) if (ctx.skipped.has(it.module.id)) it.words.forEach(w => skippedWords.add(w))
  return { items, full: { ...ctx, skippedWords, count: modules.length } }
}

function reasonsOf(parts) {
  return parts
    .filter(p => p.reason && p.weight > 0)
    .sort((a, b) => Math.abs(b.contribution - b.weight / 2) - Math.abs(a.contribution - a.weight / 2))
    .slice(0, 3)
    .map(p => `${p.title}: ${p.reason}`)
}

export function rankModules(modules, ctx = {}, config = null) {
  const cfg = normalizeConfig(config)
  const weights = activeWeights(cfg)
  const { items, full } = buildItems(modules ?? [], ctx)
  const ranked = items.map(item => {
    const parts = []
    let score = 0
    for (const [id, weight] of weights) {
      const sig = signalById(id)
      const r = sig.compute(full, item) ?? { value: 0.5 }
      const value = Math.min(1, Math.max(0, Number(r.value) || 0))
      const contribution = value * weight
      score += contribution
      parts.push({ id, title: sig.title, value, weight, contribution, reason: r.reason })
    }
    // Все веса нули — чистый порядок админа
    if (!weights.size) score = 1 - item.index / Math.max(1, items.length - 1)
    return { module: item.module, index: item.index, score, parts, reasons: reasonsOf(parts) }
  })
  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  const withTypes = applyMaxSameTypeInRow(ranked, cfg.rules.maxSameTypeInRow).ranked
  return applyExploreSlots(withTypes, cfg.rules.exploreEvery, ctx.seed ?? 1)
}

// Только модули по порядку — то, что нужно ленте
export const rankModulesOrder = (modules, ctx, config) => rankModules(modules, ctx, config).map(r => r.module)

// Объяснение для одного модуля (окно админа «почему эта фраза здесь»)
export function explainModule(ranked, moduleId) {
  const pos = ranked.findIndex(r => r.module.id === moduleId)
  return pos === -1 ? null : { position: pos + 1, ...ranked[pos] }
}

export const signalTitles = () => Object.fromEntries(SIGNALS.map(s => [s.id, s.title]))
