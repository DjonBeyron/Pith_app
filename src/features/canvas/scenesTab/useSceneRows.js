import { useMemo } from 'react'
import { buildSceneRows } from './sceneRows.js'

// Список сцен урока и сводка — пересчитываются только при смене нод/заголовка (см. sceneRows.js: тяжёлое кэшируется по сцене)
export function useSceneRows(nodes, title) {
  return useMemo(() => buildSceneRows(nodes, { title }), [nodes, title])
}

// Бейдж кнопки «Сцены» в шапке: число сцен и тон линтера (красный — ошибки, жёлтый — предупреждения)
export function sceneTabBadge(s) {
  const tone = s.withErr || s.ruleErrors ? 'err' : s.withWarn || s.ruleWarns ? 'warn' : null
  return { count: s.total, tone }
}
