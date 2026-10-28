import { useEffect, useRef, useState } from 'react'
import PitAvatar from '../../shared/ui/PitAvatar.jsx'
import {
  GUEST_HINT_MS, GUEST_HINT_TEXT, markGuestHintShown, readGuestHint, shouldShowGuestHint,
} from './guestSaveHint.js'

// Чистый вид строки (его же проверяет тест разметки)
export function GuestSaveHintLine({ onTap }) {
  return (
    <button type="button" className="guestSaveHint" onClick={onTap}>
      <span className="guestSaveHintPit"><PitAvatar size={28} /></span>
      <span className="guestSaveHintText">{GUEST_HINT_TEXT}</span>
    </button>
  )
}

// Строка Пита гостю: считает слайды после первого гостевого лайка/закладки и
// через два показывает «Сохраню лайки и закладки, если создашь аккаунт».
// Сама гаснет через 4 с; тап — форма входа. Один раз на устройстве
export default function GuestSaveHint({ activeIdx, user, onRequireAuth }) {
  const [shown, setShown] = useState(false)
  const prevIdx = useRef(activeIdx)
  const slides = useRef({ at: null, n: 0 })

  // Смена слайда после лайка: засчитываем; набралось два — показываем
  useEffect(() => {
    const moved = prevIdx.current >= 0 && prevIdx.current !== activeIdx
    prevIdx.current = activeIdx
    if (!moved || user) return
    const rec = readGuestHint()
    if (!rec.at || rec.shown) return
    if (slides.current.at !== rec.at) slides.current = { at: rec.at, n: 0 }
    slides.current.n += 1
    if (shouldShowGuestHint({ likedAt: rec.at, slidesSince: slides.current.n, shown: rec.shown })) {
      markGuestHintShown()
      setShown(true)
    }
  }, [activeIdx, user])

  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(false), GUEST_HINT_MS)
    return () => clearTimeout(t)
  }, [shown])

  if (!shown || user) return null
  return <GuestSaveHintLine onTap={() => { setShown(false); onRequireAuth?.() }} />
}
