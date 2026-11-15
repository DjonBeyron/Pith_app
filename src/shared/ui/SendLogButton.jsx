import { useEffect, useRef, useState } from 'react'
import '../../styles/send-log-button.css'
import { runSend, SHOW_OK_MS, SHOW_FAIL_MS } from '../lib/sendLogFlow.js'

// Кнопка «Отправить в GitHub» с откликом прямо на кнопке (владелец 2026-11-15: «чтобы было понятно, что лог отправился»): отправляю… (кнопка занята, пульсирует) → «✓ Отправлено» (зелёная, 5 с) или
// «✗ Не отправилось» (красная, 6 с) → обратно в исходную подпись. Одна кнопка на все места: шестерёнка игры (WordLaneHud), итог «Встряхни память» (RaceJournalLinks), админка (AdminTab). send() → строка-результат
// (shared/lib/logUpload.js: «Отправлено в GitHub (N ф.) — напиши мне «читай»» или «Не отправилось: …»); onResult(строка) отдаёт её наружу — в строку статуса под кнопкой, как раньше. stop — не пускать клик выше (итог игры).
export default function SendLogButton({ send, label = 'Отправить в GitHub', onResult = null, stop = false, className = '', ...rest }) {
  const [st, setSt] = useState('idle') // idle | busy | ok | fail
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const click = async e => {
    if (stop) e.stopPropagation()
    if (st === 'busy') return
    clearTimeout(timer.current); setSt('busy')
    const { msg, ok } = await runSend(send)
    onResult?.(msg); setSt(ok ? 'ok' : 'fail')
    timer.current = setTimeout(() => setSt('idle'), ok ? SHOW_OK_MS : SHOW_FAIL_MS)
  }
  const text = st === 'busy' ? 'Отправляю…' : st === 'ok' ? '✓ Отправлено' : st === 'fail' ? '✗ Не отправилось' : label
  return <button type="button" className={`sendLogBtn ${className}`.trim()} data-state={st} aria-busy={st === 'busy' || undefined} onClick={click} {...rest}>{text}</button>
}
