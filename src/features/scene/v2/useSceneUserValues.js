import { useEffect, useMemo, useReducer, useState } from 'react'
import { usesVars } from './sceneVars.js'
import { NO_VALUES, fillUserScene } from './sceneUserFill.js'
import { peekUserValues, resolveUserValues, startUserWait } from './sceneUserResolve.js'
import { isSceneVarsEnabled, SCENE_VARS_WAIT_MS } from '../../../shared/lib/memory/sceneVarsConfig.js'

// Слова пользователя в сцене-шаблоне (шаг 5) → { scene, ready }.
//  · У сцены нет vars — вернётся ТА ЖЕ ссылка и ready=true: ни эффектов с работой, ни подписок, ни таймеров.
//  · Есть vars: слова грузит общий стор (один запрос на сессию), выбор по зерну «день + id сцены», озвучка слов прогревается
//    (sceneUserResolve.js). Пока значения не готовы — ready=false, scene = запасной вариант (для размеров/линтера; показывать его
//    как финальный нельзя: потребитель не запускает режиссёра до ready). Ждём не дольше waitMs, потом запасное слово.
//  · После готовности (или таймаута) сцена этого экземпляра больше НЕ меняется: поздние слова не «перескакивают» — их увидят
//    следующие открытия. Таймаут ложится на конкретную сцену этого экземпляра (lost).
//  · enabled=false (слайд вне окна ленты, замороженная нода): ничего не грузим; если решение уже есть — отдаём его.
//  · Аварийный выключатель (sceneVarsConfig): везде запасные слова, память не читается.
// key — стабильный id сцены для зерна (feed: id сцены; урок: sceneId или id ноды).
export function useSceneUserValues(scene, { key = null, enabled = true, waitMs = SCENE_VARS_WAIT_MS, resolve = resolveUserValues } = {}) {
  const used = usesVars(scene)
  const flag = isSceneVarsEnabled()
  const [lost, setLost] = useState(null) // сцена, для которой вышло время ожидания
  const [, rerender] = useReducer(n => n + 1, 0)
  const [now] = useState(Date.now) // «сегодня» фиксируется на маунте: переход через полночь не меняет слово у открытой сцены
  const cached = used && flag ? peekUserValues(scene, key, now) : null
  const work = used && flag && enabled && !cached

  useEffect(() => {
    if (!work) return undefined
    return startUserWait(scene, { key, now, waitMs, resolve, onReady: rerender, onLost: () => setLost(scene) })
  }, [work, scene, key, now, waitMs, resolve])

  const timedOut = used && lost === scene
  const values = !used ? NO_VALUES : (!flag || timedOut) ? NO_VALUES : cached
  const filled = useMemo(() => (used ? fillUserScene(scene, values) : scene), [used, scene, values])
  if (!used) return { scene, ready: true }
  return { scene: filled, ready: values !== null }
}
