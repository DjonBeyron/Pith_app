import { useEffect, useState } from 'react'
import { loadCurricula } from '../../../shared/lib/curriculaApi.js'
import { publishedFeedModules } from '../../feed/feedModuleShape.js'

// Модули для предпросмотра окна «Сигналы ленты»: тот же источник и та же форма,
// что у ленты (loadCurricula → publishedFeedModules). Один запрос на открытие окна.
export function useSignalsModules() {
  const [state, setState] = useState({ modules: [], loading: true, error: '' })
  useEffect(() => {
    let alive = true
    loadCurricula()
      .then(rows => { if (alive) setState({ modules: publishedFeedModules(rows), loading: false, error: '' }) })
      .catch(e => { if (alive) setState({ modules: [], loading: false, error: navigator.onLine === false ? 'Нет сети — список фраз не загрузился' : (e?.message || 'Не удалось загрузить фразы') }) })
    return () => { alive = false }
  }, [])
  return state
}
