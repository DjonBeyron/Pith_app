import { useLayoutEffect, useRef } from 'react'
import { MSG_TRAVEL, MSG_SLIDE_MS, MSG_SOUND_AT } from '../PlayerFeed.jsx'
import { playSound } from '../../../shared/lib/sounds.js'
import { pLog } from '../../../shared/lib/debug.js'

// Отложенный приход пузырей ответа (PROJECT.md, «история знает высоту
// ответа заранее»).
//
// Обычно новая строка ленты въезжает снизу и толкает историю вверх (FLIP в
// PlayerFeed). Здесь иначе: строки вставлены в DOM ЗАРАНЕЕ — тем же тиком,
// что закрывается панель ответа, — с data-no-slide (PlayerFeed их не
// анимирует и историю не толкает) и невидимыми (.playerMsgRowArriving,
// visibility:hidden). Раскладка сразу конечная: панель уезжает, история
// опускается ровно до места, где и останется. Когда панель ушла, панель
// снимает флаг arriving — и этот хук проигрывает строкам въезд снизу на уже
// свободное место. Двигать историю больше нечему.
//
// rowsRef — массив DOM-строк (.playerMsgRow) этого сообщения; silent — не
// играть «message-in» (пузырь --pick молчит: звук уже дал сам тап)
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function useDeferredArrival(arriving, rowsRef, { silent = false } = {}) {
  const wasArriving = useRef(arriving)
  useLayoutEffect(() => {
    const was = wasArriving.current
    wasArriving.current = arriving
    if (!was || arriving) return
    const rows = (rowsRef.current ?? []).filter(Boolean)
    pLog(`[arrival] проявляем ${rows.length} отложенных пузырей`)
    rows.forEach(el => {
      el.animate(
        [{ transform: `translateY(${MSG_TRAVEL}px)` }, { transform: 'translateY(0)' }],
        { duration: MSG_SLIDE_MS, easing: EASE, fill: 'backwards' },
      )
    })
    if (rows.length && !silent) {
      setTimeout(() => playSound('message-in', 'лента: отложенный ответ'), MSG_SOUND_AT)
    }
  }, [arriving]) // eslint-disable-line react-hooks/exhaustive-deps
}
