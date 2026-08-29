import { useLayoutEffect, useState } from 'react'
import { pLog } from '../../../shared/lib/debug.js'

// Высота панели ответа: на неё лента приподнимает сообщения
// (usePlayerPanelNodes.offset), её же держит спейсер под лентой.
//
// Мерить один раз при монтировании нельзя. «Собери фразу» и таблица меняют
// высоту прямо по ходу ответа: слова уезжают из банка в собранную строку,
// банк схлопывается, длинная фраза переносится на вторую строку, появляется
// бокс с разбором. Спейсер при этом держал стартовую высоту — лента
// оставалась приподнята меньше, чем занимает панель, и собранный ответ
// вылетал в чат частично ПОД ней вместо того, чтобы встать над панелью.
//
// Наблюдаем за реальным размером: панель фиксирована (position: fixed), её
// высоту задаёт содержимое, поэтому обратной связи «спейсер → панель» нет и
// цикл невозможен.
export function usePanelHeight(ref, onHeightChange) {
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let last = null
    const apply = () => {
      const h = el.offsetHeight
      if (last !== null && last !== h) pLog(`[panel-h] высота ${last} → ${h} (Δ${h - last})`)
      last = h
      setHeight(prev => (prev === h ? prev : h))
      onHeightChange?.(h)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return height
}
