import { useEffect } from 'react'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Страховка scroll-snap при возврате приложения из фона (вынесено из
// useFeedVirtualizer.js). document.hidden — именно тот сигнал, из-за которого
// у iOS замирает очередь rAF: свайп у края круга случился прямо перед тем, как
// экран заблокировали или ушли из вкладки браузера на несколько минут, и
// восстановление snap после телепорта (feedSnapTeleport.js) так и не доехало.
// Возврат из фона — момент, когда пользователь и замечает залипший
// scroll-snap-type:none (лента листается «свободным» скроллом без фиксации на
// видео). Даже если обе восстановки в телепорте не сработали — чиним здесь.
// Замороженную ленту (не на экране) не трогаем: там snap выключен намеренно
export function useSnapForegroundRepair(scrollRef, tpRef) {
  useEffect(() => {
    function onVisible() {
      if (document.hidden) return
      const el = scrollRef.current
      if (!el || el.style.scrollSnapType !== 'none' || tpRef.current.isFrozen()) return
      fdbg('окно вернулось из фона: snap залип на none — восстанавливаю')
      el.style.scrollSnapType = ''
      tpRef.current.clearTeleporting()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
