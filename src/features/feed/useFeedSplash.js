import { useEffect, useRef } from 'react'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Отпускаем стартовый сплэш (index.html) не по приходу данных, а по ПЕРВОМУ
// РЕАЛЬНОМУ КАДРУ видео (сигнал __pithyVideoShown из SlideVideo) — иначе
// после улёта сплэша видна недогруженная лента. Если ждать нечего (пусто/
// ошибка/без видео) — сразу; при медленной сети — страховка (виден постер).
export function useFeedSplash(modules, len, feedModules) {
  const splashDone = useRef(false)
  useEffect(() => {
    if (modules === null || splashDone.current) return
    const fire = why => {
      if (splashDone.current) return
      splashDone.current = true
      fdbg('splash release:', why)
      window.__pithyReady?.(why)
    }
    if (len === 0) { fire(modules.length === 0 ? 'лента пуста' : 'все модули начаты'); return }
    if (!feedModules.some(m => m.videoUrl)) { fire('слайды без видео'); return }
    window.__pithyVideoShown = () => fire('первый кадр видео')
    const t = setTimeout(() => fire('страховка 3500мс — кадра нет'), 3500)
    return () => clearTimeout(t)
  }, [modules, len]) // eslint-disable-line react-hooks/exhaustive-deps
}
