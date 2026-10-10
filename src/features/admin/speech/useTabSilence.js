import { useEffect } from 'react'
import { holdSilence } from '../../../shared/lib/soundQuiet.js'
import { installMediaPlayLog } from '../../../shared/lib/soundLog.js'
import { isLessonOpen, onLessonOpenChange } from '../../../shared/lib/lessonOpen.js'
import { pLog } from '../../../shared/lib/debug.js'
import { tabShown, TAB_SELECTOR } from './tabShown.js'

// Пока вкладка «Голос» ВИДНА (админка остаётся смонтированной под скрытыми вкладками, поэтому следим за видимостью корня, а не за монтированием), приложение
// молчит полностью: звуки интерфейса, озвучка слов и беззвучный wav «разблокировки» не играют (soundQuiet.holdSilence). Любое воспроизведение страницей на iOS
// переключает аудиосессию, и следующее распознавание речи бывает «глухим». «Видна» = tabShown.js: не скрытая вкладка оболочки (visibility:hidden — IntersectionObserver её не видит,
// поэтому класс .shellV2TabHidden на родителе отслеживает MutationObserver) и не открыт плеер урока. Без IntersectionObserver — тишина, пока вкладка не скрыта.
export function useTabSilence(rootRef) {
  useEffect(() => {
    const uninstallLog = installMediaPlayLog() // чужие <audio>/<video> тоже попадают в журнал звуков (только пока открыта вкладка «Голос»)
    const el = rootRef.current
    let release = null
    let intersecting = null
    const apply = () => {
      const on = tabShown({ el, intersecting: intersecting ?? true, lessonOpen: isLessonOpen() })
      if (on && !release) { release = holdSilence('admin-voice'); pLog('[sound] вкладка «Голос» на экране — полная тишина приложения') }
      else if (!on && release) { release(); release = null; pLog('[sound] вкладка «Голос» скрыта — тишина снята') }
    }
    const io = el && typeof IntersectionObserver === 'function' ? new IntersectionObserver(list => { for (const e of list) intersecting = e.isIntersecting; apply() }) : null
    io?.observe(el)
    const tab = el?.closest?.(TAB_SELECTOR)
    const mo = tab && typeof MutationObserver === 'function' ? new MutationObserver(apply) : null
    mo?.observe(tab, { attributes: true, attributeFilter: ['class'] })
    const offLesson = onLessonOpenChange(apply)
    apply()
    return () => { io?.disconnect(); mo?.disconnect(); offLesson(); if (release) { release(); release = null }; uninstallLog?.() }
  }, [rootRef])
}
