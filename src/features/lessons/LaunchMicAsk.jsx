import { useState, useEffect } from 'react'
import { Mic, Check } from 'lucide-react'
import { ensureMicAccess, micAccessState } from '../../shared/lib/micAccess.js'

// Блок в карточке запуска — только для уроков с нодой «Переверни телефон» (игра «Повтори за диктором»), пока доступа к микрофону ещё нет.
//
// Зачем свой шаг перед системным: диалог «Разрешить доступ к микрофону?» без объяснения выглядит подозрительно, и на него жмут «Не разрешать» — а отказ ОС запоминает.
// Здесь человек сначала читает, зачем это, и сам нажимает «Разрешить» — системный диалог приходит по его собственному действию и в контексте. Микрофон нужен посреди
// урока, когда он повторяет слово вслух; если доступ не дан, игра работает вручную (тап по микрофону), урок не ломается.
export default function LaunchMicAsk() {
  const [state, setState] = useState('checking') // checking | idle | asking | granted | denied

  // Доступ уже есть (Android, повторный запуск) — блок не нужен; iPhone Safari не отвечает на запрос состояния — тогда спрашиваем по кнопке
  useEffect(() => {
    let alive = true
    micAccessState().then(r => { if (alive) setState(r === 'granted' ? 'skip' : r === 'denied' ? 'denied' : 'idle') })
    return () => { alive = false }
  }, [])

  async function ask(e) {
    e.stopPropagation()
    setState('asking')
    const r = await ensureMicAccess()
    setState(r === 'granted' ? 'granted' : 'denied')
  }

  if (state === 'checking' || state === 'skip') return null
  if (state === 'granted') {
    return (
      <div className="launchMic launchMic--ok">
        <span className="launchMicIcon"><Check size={16} /></span>
        <span className="launchMicText">Микрофон включён — можно повторять слова вслух</span>
      </div>
    )
  }

  return (
    <div className="launchMic">
      <span className="launchMicIcon"><Mic size={16} /></span>
      <span className="launchMicText">
        В этом уроке нужно будет повторять слова вслух.
        {state === 'denied'
          ? ' Без микрофона слова придётся отмечать нажатием — доступ можно выдать в настройках браузера.'
          : ' Разреши микрофон заранее, чтобы урок не прерывался.'}
      </span>
      {state !== 'denied' && (
        <button type="button" className="launchMicBtn" onClick={ask} disabled={state === 'asking'}>
          {state === 'asking' ? '…' : 'Разрешить'}
        </button>
      )}
    </div>
  )
}
