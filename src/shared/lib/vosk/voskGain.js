// Программное усиление микрофона перед распознаванием (вынесено из voskEngine.js — тот у границы 250 строк). Цепочка Web Audio: источник потока → GainNode (×gain) → DynamicsCompressor (мягкий ограничитель, чтобы громкий
// голос не клиппил после усиления) → ScriptProcessor Vosk. gain ≤ 1 (или не число) — цепочки нет: источник подключается к узлу напрямую, как всегда. Второго захвата микрофона нет — это тот же поток.
// Ограничитель: порог −10 дБ, мягкое колено, жёсткое сжатие выше порога (ratio 20): тихая и обычная речь проходит без изменений, пики после усиления не выше ≈ −6 дБ полной шкалы.
export const LIMITER = { threshold: -10, knee: 6, ratio: 20, attack: 0.003, release: 0.15 }

const setParam = (node, name, value) => { try { node[name].value = value } catch { /* параметр только для чтения в старом WebKit — остаётся по умолчанию */ } }

/** Подключить src к node (ScriptProcessor) через усиление gain. → список созданных узлов (для отключения при освобождении) */
export function wireInput(ctx, src, node, gain = 1) {
  if (!(gain > 1) || typeof ctx?.createGain !== 'function') { src.connect(node); return [] }
  const g = ctx.createGain()
  setParam(g, 'gain', gain)
  src.connect(g)
  const nodes = [g]
  let last = g
  if (typeof ctx.createDynamicsCompressor === 'function') {
    const c = ctx.createDynamicsCompressor()
    for (const [k, v] of Object.entries(LIMITER)) setParam(c, k, v)
    g.connect(c)
    nodes.push(c)
    last = c
  }
  last.connect(node)
  return nodes
}
