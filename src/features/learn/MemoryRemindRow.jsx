import { useEffect, useState } from 'react'
import { getRemindTime } from '../../shared/api/remindApi.js'
import RemindAskSheet from './RemindAskSheet.jsx'
import { remindRowText } from './remindAsk.js'

// Строка «Напоминание: 20:00 · изменить» в настройках «Повторения»: показывает текущий выбор
// и открывает ту же шторку «Когда тебе удобно учиться?», что после рассказа Пита.
export default function MemoryRemindRow() {
  const [cur, setCur] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) return undefined
    let live = true
    getRemindTime().then(r => { if (live) setCur(r) }).catch(() => {})
    return () => { live = false }
  }, [open])

  return (
    <>
      <button className="settingsInstallBtn" onClick={() => setOpen(true)}>{remindRowText(cur)} · изменить</button>
      {open && <RemindAskSheet current={cur} onClose={() => setOpen(false)} />}
    </>
  )
}
