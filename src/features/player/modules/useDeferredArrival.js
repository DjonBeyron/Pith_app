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

// indices — массив индексов строк, которые сейчас отложены (когда строк у
// сообщения несколько и часть пришла раньше обычным путём — как у таблицы с
// попытками); хук запоминает его, пока флаг стоит, — в рендере со снятым
// флагом этого уже не видно. Без indices въезжают все строки rowsRef
export function useDeferredArrival(arriving, rowsRef, { silent = false, indices = null } = {}) {
  const wasArriving = useRef(arriving)
  const idxRef = useRef(null)
  useLayoutEffect(() => {
    const was = wasArriving.current
    wasArriving.current = arriving
    if (arriving) { idxRef.current = indices; return }
    if (!was) return
    const all = rowsRef.current ?? []
    const rows = (idxRef.current ? idxRef.current.map(i => all[i]) : all).filter(Boolean)
    idxRef.current = null
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
