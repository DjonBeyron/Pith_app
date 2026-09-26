import { useState } from 'react'
import { setDailyMinutes } from '../../shared/api/memoryApi.js'
import { CARDS_BY_MINUTES } from '../../shared/lib/memory/dailyPick.js'

// Шторка «Сколько минут в день?»: 5 / 10 / 15 → потолок карточек повторения
// в день (8 / 14 / 20). Гостю вторым шагом — подводка к входу: «сохрани
// прогресс, завтра напомним» (память гостя живёт только в браузере).
// onClose(changed) — changed: выбор сохранён
export default function MinutesSheet({ current = null, isGuest, onRequireAuth, onClose }) {
  const [step, setStep] = useState('minutes') // minutes | guest
  const [busy, setBusy] = useState(false)

  async function pick(m) {
    setBusy(true)
    await setDailyMinutes(m)
    setBusy(false)
    if (isGuest && onRequireAuth) setStep('guest')
    else onClose(true)
  }

  return (
    <div className="lrSheetBack" onClick={() => onClose(false)}>
      <div className="lrSheet" role="dialog" aria-label="Минуты в день" onClick={e => e.stopPropagation()}>
        {step === 'minutes' ? (
          <>
            <p className="lrSheetWord">Сколько минут в день?</p>
            <p className="lrSheetPhrase">
              Столько займёт повторение пройденных слов. Поменять можно в настройках профиля ⚙
            </p>
            <div className="lrMinutes">
              {[5, 10, 15].map(m => (
                <button key={m} className={m === current ? 'lrMinute lrMinuteOn' : 'lrMinute'} disabled={busy} onClick={() => pick(m)}>
                  <b>{m} мин</b>
                  <span>до {CARDS_BY_MINUTES[m]} карточек</span>
                </button>
              ))}
            </div>
            <button className="lrBtn lrBtnGhost" onClick={() => onClose(false)}>{current ? 'Закрыть' : 'Пропустить'}</button>
          </>
        ) : (
          <>
            <p className="lrSheetWord">Сохрани прогресс</p>
            <p className="lrSheetPhrase">Войди — и завтра напомним повторить. Сейчас память слов живёт только в этом браузере</p>
            <button className="lrBtn lrBtnMain" onClick={() => { onClose(true); onRequireAuth() }}>Войти</button>
            <button className="lrBtn lrBtnGhost" onClick={() => onClose(true)}>Позже</button>
          </>
        )}
      </div>
    </div>
  )
}
