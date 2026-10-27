import { useState } from 'react'
import { subscribePush } from '../../shared/lib/push.js'
import InstallSlides from '../../shared/ui/InstallSlides.jsx'
import { confirmText } from './remindAsk.js'

// Вторая половина шторки «Когда удобно учиться?»: подтверждение с конкретикой и ветка уведомлений
// (PLAN_NEW_USER.md → решение 13). Разрешение просим только по тапу; на iPhone вне экрана «Домой»
// честно предлагаем добавить приложение (слайды «Как установить»); отказ не уговариваем.
// res: { sel, push, needsTz, guest } — результат сохранения (RemindAskSheet)
export default function RemindDone({ res, onClose }) {
  const { sel, needsTz, guest } = res
  const [branch, setBranch] = useState(res.push)
  const [install, setInstall] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function enable() {
    setBusy(true)
    setMsg('')
    try {
      await subscribePush()
      setBranch('granted')
      setMsg('Уведомления включены')
    } catch (e) {
      if (e.message === 'denied') { setBranch('denied'); setMsg('Хорошо, без уведомлений') }
      else if (e.message !== 'dismissed') setMsg('Не получилось включить уведомления')
    } finally {
      setBusy(false)
    }
  }

  const show = sel.enabled ? branch : 'none'
  return (
    <div className="raDone">
      <p className="raConfirm">{confirmText(sel, { needsTz, guest })}</p>
      {msg && <p className="lrSheetPhrase" role="status">{msg}</p>}
      {show === 'ask' && (
        <>
          <p className="lrSheetPhrase">Чтобы напоминание дошло, нужно разрешить уведомления</p>
          <button className="lrBtn lrBtnMain" onClick={enable} disabled={busy}>{busy ? '...' : 'Включить уведомления'}</button>
          <button className="lrBtn lrBtnGhost" onClick={onClose}>Не сейчас</button>
        </>
      )}
      {show === 'add_home' && (
        <>
          <p className="lrSheetPhrase">На iPhone уведомления приходят только приложению на экране «Домой»</p>
          <button className="lrBtn lrBtnMain" onClick={() => setInstall(true)}>Как добавить</button>
          <button className="lrBtn lrBtnGhost" onClick={onClose}>Не сейчас</button>
        </>
      )}
      {show !== 'ask' && show !== 'add_home' && (
        <button className="lrBtn lrBtnMain" onClick={onClose}>Готово</button>
      )}
      {install && <InstallSlides onClose={() => setInstall(false)} />}
    </div>
  )
}
