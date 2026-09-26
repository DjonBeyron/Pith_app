import { useEffect, useState } from 'react'
import { onMinutesAsk, markMinutesAsked } from './minutesAsk.js'
import MinutesSheet from './MinutesSheet.jsx'

// Онбординг повторения в оболочке: по просьбе схемы модуля после первого
// пройденного урока (minutesAsk.js) — шторка «Сколько минут в день?», один
// раз на устройстве. onChanged — перечитать «Мою память» (бюджет сменился)
export default function MinutesAsk({ isLoggedIn, onRequireAuth, onChanged }) {
  const [open, setOpen] = useState(false)
  useEffect(() => onMinutesAsk(() => { markMinutesAsked(); setOpen(true) }), [])
  if (!open) return null
  return (
    <MinutesSheet
      isGuest={!isLoggedIn}
      onRequireAuth={onRequireAuth}
      onClose={changed => { setOpen(false); if (changed) onChanged?.() }}
    />
  )
}
