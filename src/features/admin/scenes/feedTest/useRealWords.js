import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSceneWords, clearSceneWordsCache } from '../../../../shared/lib/memory/sceneVarsSource.js'

// Загрузка слов НАСТОЯЩЕЙ памяти текущего админа для режима «Моя настоящая память» (только чтение, кэш 5 минут).
// enabled — режим выбран хотя бы у одного слова сцены; пока нет, сеть не трогаем (status 'idle' до первого выбора).
// → { state: { status: 'idle'|'loading'|'ok'|'error', words, stats, source, error }, reload }
// init — готовое состояние (тесты и снимки); load — подмена загрузчика.
const apply = r => (r.error
  ? { status: 'error', words: [], stats: null, source: null, error: r.error }
  : { status: 'ok', words: r.words, stats: r.stats, source: r.source, error: null })

export default function useRealWords(enabled, { init = null, load = loadSceneWords } = {}) {
  const [state, setState] = useState(init ?? { status: 'idle', words: [], stats: null, source: null, error: null })
  const started = useRef(!!init)
  useEffect(() => {
    if (!enabled || started.current) return
    started.current = true
    load({ force: false }).then(r => setState(apply(r)))
  }, [enabled, load])
  const reload = useCallback(() => {
    clearSceneWordsCache()
    setState(s => ({ ...s, status: 'loading', error: null }))
    return load({ force: true }).then(r => setState(apply(r)))
  }, [load])
  return { state, reload }
}
