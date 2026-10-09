import { useCallback, useEffect, useState } from 'react'
import { CATCH_HINT_KEY, CATCH_HINT_DELAY_MS, canShowCatchHint, nextShows, parseShows, retiredShows } from './catchSlowHint.js'

const readShows = () => {
  try { return parseShows(localStorage.getItem(CATCH_HINT_KEY)) } catch { return 0 }
}
const writeShows = n => {
  try { localStorage.setItem(CATCH_HINT_KEY, String(n)) } catch { /* нет localStorage — переживём */ }
}

// Подсказка «можно замедлить» в режиме «Ловли слов» (правила и ключ — catchSlowHint.js). open — накрытие слайда открыто
// (и слайд активен), soundOn — звук ленты включён. Подсказка появляется через CATCH_HINT_DELAY_MS после открытия (накрытие
// уже выехало) и гаснет при закрытии накрытия; счётчик растёт только в момент реального появления.
// → { showHint, retire } — retire зовут, когда замедлением в полосе реально воспользовались: подсказка гаснет насовсем
export function useCatchSlowHint(open, soundOn) {
  const [visible, setVisible] = useState(false)
  const ready = !!open && !!soundOn
  useEffect(() => {
    if (!ready || !canShowCatchHint({ shows: readShows(), open: ready, soundOn: ready })) return
    const t = setTimeout(() => {
      writeShows(nextShows(readShows()))
      setVisible(true)
    }, CATCH_HINT_DELAY_MS)
    return () => { clearTimeout(t); setVisible(false) }
  }, [ready])
  const retire = useCallback(() => {
    writeShows(retiredShows())
    setVisible(false)
  }, [])
  return { showHint: visible && ready, retire }
}
