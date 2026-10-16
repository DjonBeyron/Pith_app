import { useState, useMemo, useCallback } from 'react'
import { fillSceneVars } from '../../scene/v2/sceneVars.js'

// Сцена для предпросмотра сборщика: шаблон (vars) показывается со словами-запасными либо с «пробными словами»
// (включены переключателем — { имя: { text, translation } }). Пробные слова живут только в предпросмотре и в сцену
// не пишутся. Сцена без vars — та же ссылка (предпросмотр не пересоздаётся).
export function usePreviewScene(scene) {
  const [on, setOn] = useState(false)
  const [values, setValues] = useState({})
  const shown = useMemo(() => fillSceneVars(scene, on ? values : {}), [scene, on, values])
  const setWord = useCallback((name, field, v) => setValues(cur => ({ ...cur, [name]: { ...cur[name], [field]: v } })), [])
  return { shown, trial: { on, setOn, values, setWord } }
}
