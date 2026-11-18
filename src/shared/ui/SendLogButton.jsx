import { useEffect, useRef, useState } from 'react'
import { shutGameMic, peekGameMic } from '../lib/gameMic.js'
import { pLog } from '../lib/debug.js'
import '../../styles/send-log-button.css'
import { runSend, SHOW_OK_MS, SHOW_FAIL_MS, readLogOpts, writeLogOpts } from '../lib/sendLogFlow.js'
import SendLogPopup from './SendLogPopup.jsx'

// Кнопка «Отправить в GitHub» с откликом прямо на кнопке (владелец 2026-11-15: «чтобы было понятно, что лог отправился»): отправляю… (кнопка занята, пульсирует) → «✓ Отправлено» (зелёная, 5 с) или
// «✗ Не отправилось» (красная, 6 с) → обратно в исходную подпись. Одна кнопка на все места: шестерёнка игры (WordLaneHud), итог «Встряхни память» (RaceJournalLinks), админка (AdminTab). send() → строка-результат
// (shared/lib/logUpload.js: «Отправлено в GitHub (N ф.) — напиши мне «читай»» или «Не отправилось: …»); onResult(строка) отдаёт её наружу — в строку статуса под кнопкой, как раньше. stop — не пускать клик выше (итог игры).
// Клик по кнопке открывает попап «Комментарий к логам» (SendLogPopup): текст уходит в send(comment) и в GitHub отдельным файлом. Черновик живёт, пока отправка не удалась (закрыл попап — не пропал).
export default function SendLogButton({ send, label = 'Отправить в GitHub', onResult = null, onOpen = null, onSend = null, icon = null, stop = false, className = '', ...rest }) { // icon — значок вместо подписи (состояния — «…» / «✓» / «✗»); onOpen — попап открыт (игра ставит паузу); onSend — нажато «Отправить» (окно настроек закрывается)
  const [st, setSt] = useState('idle') // idle | busy | ok | fail
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [opts, setOpts] = useState(readLogOpts) // галочки «Отправить логи» и «Дополнить» (копить в GitHub, не заменять): запоминаются между открытиями
  const { withLogs, append } = opts
  const setOpt = patch => setOpts(o => { const n = { ...o, ...patch }; writeLogOpts(n); return n })
  const timer = useRef(0)
  const prevAs = useRef(null) // тип аудиосессии до диктовки: после закрытия окна возвращаем (иначе игра остаётся в 'auto')
  const restoreAs = () => { try { const as = globalThis.navigator?.audioSession; if (as && prevAs.current) as.type = prevAs.current } catch { /* нет API */ } prevAs.current = null }
  useEffect(() => () => clearTimeout(timer.current), [])
  const click = e => {
    if (stop) e.stopPropagation()
    if (st === 'busy') return
    const had = !!peekGameMic() // журнал (владелец, v3.3.275: «почему при входе в комментарий игра отпускает микрофон»): зачем и был ли поток
    pLog(`[mic] комментарий к логам: попап открыт — игра отпускает микрофон по-настоящему, чтобы iPhone дал диктовку голосом в поле (поток был ${had ? 'открыт' : 'уже закрыт'}); следующая игра спросит разрешение заново`)
    shutGameMic('комментарий к логам: диктовка') // микрофон игры отпущен по-настоящему (треки остановлены): иначе iOS не даёт клавиатуре диктовать голосом; «Продолжить» откроет его заново
    try { const as = globalThis.navigator?.audioSession; if (as && as.type !== 'auto') { prevAs.current = as.type; pLog(`[mic] audioSession ${as.type} → auto: для диктовки iPhone игровая категория звука не нужна`); as.type = 'auto' } } catch { /* нет API — диктовка пойдёт как раньше */ }
    for (const ms of [500, 1500, 3000]) setTimeout(() => { try { pLog(`[mic] через ${ms} мс после отпускания: поток ${peekGameMic() ? 'ОТКРЫТ (не должен)' : 'закрыт'}, audioSession=${globalThis.navigator?.audioSession?.type ?? '—'}`) } catch { /* журнал не мешает */ } }, ms) // диагностика (владелец v3.3.276: «долго отпускает микрофон»): что видно из приложения после закрытия потока
    setOpen(true); onOpen?.()
  }
  const go = async () => {
    setOpen(false); restoreAs(); onSend?.(); clearTimeout(timer.current); setSt('busy')
    const { msg, ok } = await runSend(send, draft.trim(), { withLogs, append })
    if (ok) setDraft('')
    onResult?.(msg); setSt(ok ? 'ok' : 'fail')
    timer.current = setTimeout(() => setSt('idle'), ok ? SHOW_OK_MS : SHOW_FAIL_MS)
  }
  const text = icon ? (st === 'busy' ? '…' : st === 'ok' ? '✓' : st === 'fail' ? '✗' : icon) : st === 'busy' ? 'Отправляю…' : st === 'ok' ? '✓ Отправлено' : st === 'fail' ? '✗ Не отправилось' : label
  return (
    <>
      <button type="button" className={`sendLogBtn ${className}`.trim()} data-state={st} aria-busy={st === 'busy' || undefined} onClick={click} {...rest}>{text}</button>
      {open && <SendLogPopup value={draft} onChange={setDraft} withLogs={withLogs} onWithLogs={v => setOpt({ withLogs: v })} append={append} onAppend={v => setOpt({ append: v })} onSend={go} onCancel={() => { setOpen(false); restoreAs() }} />}
    </>
  )
}
