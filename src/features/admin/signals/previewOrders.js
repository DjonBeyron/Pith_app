import { rankModules } from '../../../shared/lib/ranking/rankWeighted.js'
import { normalizeConfig } from '../../../shared/lib/ranking/feedConfig.js'
import { signalById, liveSignals } from '../../../shared/lib/ranking/signalRegistry.js'
import { rankFeed } from '../../feed/feedKnowledge.js'
import { buildRankCtx } from '../../feed/feedRankEngine.js'

// Порядки ленты для предпросмотра (чистые функции, без React; хук — usePreviewOrders.js).
// Элемент результата — как у rankModules: { module, score, parts, reasons }; для
// legacy-порядка score/parts пустые (там нет весов — только tier'ы).

const asRanked = modules => modules.map(module => ({ module, score: null, parts: [], reasons: [] }))

// Как лента отрисует этот конфиг: legacy → прежний rankFeed, weighted → взвешенно
export function orderByConfig(modules, rank, config) {
  const cfg = normalizeConfig(config)
  if (cfg.engine !== 'weighted') return asRanked(rankFeed(modules, rank ?? undefined))
  if (!rank) return asRanked(modules)
  return rankModules(modules, buildRankCtx(rank), cfg)
}

// Взвешенный расчёт по черновику независимо от его engine — чтобы крутить веса
// и видеть эффект, не включая weighted на всех
export function weightedOrder(modules, rank, draft) {
  return rank ? rankModules(modules, buildRankCtx(rank), { ...normalizeConfig(draft), engine: 'weighted' }) : asRanked(modules)
}

export const legacyOrder = (modules, rank) => asRanked(rankFeed(modules, rank ?? undefined))

// Значения одного live-сигнала по всем модулям (для карточки сигнала): среднее,
// сколько фраз «высоко» (≥ 2/3) и «низко» (≤ 1/3). Не-live → null
export function signalStats(modules, rank, id) {
  const sig = signalById(id)
  if (!sig || sig.status !== 'live' || !rank || !modules.length) return null
  const only = Object.fromEntries(liveSignals().map(s => [s.id, { enabled: s.id === id, weight: s.id === id ? 100 : 0 }]))
  const ranked = rankModules(modules, buildRankCtx(rank), { engine: 'weighted', signals: only, rules: { exploreEvery: 0, maxSameTypeInRow: 0 } })
  const values = ranked.map(r => r.parts.find(p => p.id === id)?.value ?? 0.5)
  const mean = values.reduce((a, v) => a + v, 0) / values.length
  return {
    mean,
    high: values.filter(v => v >= 2 / 3).length,
    low: values.filter(v => v <= 1 / 3).length,
    total: values.length,
    reasons: topReasons(ranked, id),
  }
}

// Самые частые причины (reason) сигнала — «из чего он складывается на этой ленте»
function topReasons(ranked, id) {
  const count = new Map()
  for (const r of ranked) {
    const reason = r.parts.find(p => p.id === id)?.reason
    if (reason) count.set(reason, (count.get(reason) ?? 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([text, n]) => ({ text, n }))
}
