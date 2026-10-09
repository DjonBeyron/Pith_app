import { useEffect } from 'react'
import { holdSilence } from '../../../shared/lib/soundQuiet.js'
import { installMediaPlayLog } from '../../../shared/lib/soundLog.js'

// Пока вкладка «Голос» ВИДНА (админка остаётся смонтированной под скрытыми вкладками, поэтому следим за видимостью корня, а не за монтированием), приложение
// молчит полностью: звуки интерфейса, озвучка слов и беззвучный wav «разблокировки» не играют (soundQuiet.holdSilence). Любое воспроизведение страницей на iOS
// переключает аудиосессию, и следующее распознавание речи бывает «глухим». Без IntersectionObserver — тишина на всё время, пока компонент смонтирован.
export function useTabSilence(rootRef) {
  useEffect(() => {
    const uninstallLog = installMediaPlayLog() // чужие <audio>/<video> тоже попадают в журнал звуков (только пока открыта вкладка «Голос»)
    const el = rootRef.current
    let release = null
    const set = on => {
      if (on && !release) release = holdSilence('admin-voice')
      else if (!on && release) { release(); release = null }
    }
    if (!el || typeof IntersectionObserver !== 'function') { set(true); return () => { set(false); uninstallLog?.() } }
    const io = new IntersectionObserver(list => { for (const e of list) set(e.isIntersecting) })
    io.observe(el)
    return () => { io.disconnect(); set(false); uninstallLog?.() }
  }, [rootRef])
}
