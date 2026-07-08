import { useState, useEffect } from 'react'
import { needsHomeScreen, getPushState, subscribePush, unsubscribePush } from '../../shared/lib/push.js'

// Карточка «Уведомления» в профиле: включить/выключить пуши. iOS требует
// явный тап пользователя для запроса разрешения — поэтому только кнопка,
// никаких автозапросов.
export default function PushToggle() {
  const [state, setState] = useState('loading') // loading | unsupported | denied | on | off
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'))
  }, [])

  async function toggle() {
    setBusy(true)
    setMsg('')
    try {
      if (state === 'on') {
        await unsubscribePush()
        setState('off')
      } else {
        await subscribePush()
        setState('on')
        setMsg('Уведомления включены')
      }
    } catch (e) {
      if (e.message === 'denied') {
        setState('denied')
      } else if (e.message !== 'dismissed') {
        setMsg('Не получилось: ' + e.message)
      }
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return null
  if (state === 'unsupported') {
    // На iPhone в Safari пушей нет — подсказываем путь через экран Домой
    if (!needsHomeScreen()) return null
    return (
      <div className="pvCard pvPushRow">
        <span>Уведомления</span>
        <span className="pvPushHint">добавь приложение на экран Домой</span>
      </div>
    )
  }
  if (state === 'denied') {
    return (
      <div className="pvCard pvPushRow">
        <span>Уведомления</span>
        <span className="pvPushHint">запрещены в настройках устройства</span>
      </div>
    )
  }

  return (
    <div className="pvCard pvPushRow">
      <span>Уведомления</span>
      <div className="pvPushRight">
        {msg && <span className="pvPushHint">{msg}</span>}
        <button className={state === 'on' ? 'pvPushBtn pvPushBtnOn' : 'pvPushBtn'} onClick={toggle} disabled={busy}>
          {busy ? '...' : state === 'on' ? 'Включены' : 'Включить'}
        </button>
      </div>
    </div>
  )
}
