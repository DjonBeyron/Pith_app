import { useEffect, useRef } from 'react'
import { autoPopupDelay } from '../../../../shared/lib/speech/sayAutoPopup.js'

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// Автопоказ попапа разрешения (решение — sayAutoPopup.autoPopupWanted): когда панель показана и кнопка locked, через секунду после появления модуля вызываем open().
// Только ПОКАЗЫВАЕМ попап — микрофон и запись стартуют по кнопке внутри него (жест пользователя). Один раз за монтирование панели: после показа (любого — и по тапу на круг, phase 'explain'),
// после нажатия на круг (phase уходит из idle) повторного автопоказа нет, «Не сейчас» его не возвращает. Таймер чистится при размонтировании и при потере условий (wanted → false).
export function useSayAutoPopup({ visible, wanted, phase, open }) {
  const doneRef = useRef(false)   // автопоказ уже был или стал не нужен
  const sinceRef = useRef(0)      // когда модуль появился (для «через секунду после появления», даже если условия сложились позже: ответ Permissions API асинхронный)
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open })
  useEffect(() => { if (visible && !sinceRef.current) sinceRef.current = nowMs() }, [visible])
  useEffect(() => { if (phase !== 'idle') doneRef.current = true }, [phase])
  useEffect(() => {
    if (!wanted || doneRef.current) return undefined
    const t = setTimeout(() => { if (doneRef.current) return; doneRef.current = true; openRef.current?.() }, autoPopupDelay(nowMs() - sinceRef.current))
    return () => clearTimeout(t)
  }, [wanted])
}
