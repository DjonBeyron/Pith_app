import { useState, useMemo, useCallback } from 'react'
import { fillSceneVars } from '../../scene/v2/sceneVars.js'
import { pendingWordTexts } from '../../scene/v2/sceneWordSegments.js'
import { useWordAudioReady } from '../../../shared/lib/wordAudio/useWordAudioReady.js'

// Сцена для предпросмотра сборщика: шаблон (vars) показывается со словами-запасными либо с «пробными словами»
// (включены переключателем — { имя: { text, translation } }). Пробные слова живут только в предпросмотре и в сцену
// не пишутся. Сцена без vars — та же ссылка (предпросмотр не пересоздаётся).
// Слова подставляются сегментами с озвучкой из библиотеки word_audio (шаг 4б): нужные слова прогреваются одним запросом
// (набор пробного слова ждёт паузу 400 мс), когда озвучка пришла — сцена пересобирается и слово звучит готовым голосом.
const NO_VALUES = {}

export function usePreviewScene(scene) {
  const [on, setOn] = useState(false)
  const [values, setValues] = useState({})
  const vals = on ? values : NO_VALUES
  const words = useMemo(() => pendingWordTexts(fillSceneVars(scene, vals, { wordAudio: null })), [scene, vals])
  const ready = useWordAudioReady(words, 400)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ready: новая озвучка слов в кэше → пересобрать сегменты
  const shown = useMemo(() => fillSceneVars(scene, vals), [scene, vals, ready])
  const setWord = useCallback((name, field, v) => setValues(cur => ({ ...cur, [name]: { ...cur[name], [field]: v } })), [])
  return { shown, trial: { on, setOn, values, setWord } }
}
