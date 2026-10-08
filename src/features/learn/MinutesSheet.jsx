import { useEffect, useRef, useState } from 'react'
import { setDailyMinutes } from '../../shared/api/memoryApi.js'
import { CARDS_BY_MINUTES } from '../../shared/lib/memory/dailyPick.js'
import MinutesThanks from './MinutesThanks.jsx'
import { MINUTE_CHOICES, minutesCopy, pickTimeline, afterPickStep } from './minutesFlow.js'

// Шторка «Сколько минут в день?»: 5 / 10 / 15 → потолок карточек повторения
// в день (8 / 14 / 20). Ответ сохраняется СРАЗУ по тапу (не после анимации),
// повторный тап блокируется. Первый раз (current = null, онбординг): галочка на
// варианте → вопрос гаснет → «Спасибо» (~1,8 с) → дальше. В настройках —
// без «Спасибо». Дальше гостю — подводка к входу («сохрани прогресс»), иначе
// закрытие. Тайминги и тексты — minutesFlow.js.
// onClose(changed) — changed: выбор сохранён
export default function MinutesSheet({ current = null, isGuest, onRequireAuth, onClose }) {
  const onboarding = current == null
  const [step, setStep] = useState('minutes') // minutes | thanks | guest
  const [picked, setPicked] = useState(null)
  const [leaving, setLeaving] = useState(false)
  const [holdH, setHoldH] = useState(null)
  const askRef = useRef(null)
  const timers = useRef([])
  const copy = minutesCopy(onboarding)
  const locked = step === 'thanks' || (step === 'minutes' && picked != null)

  useEffect(() => {
    const list = timers.current
    return () => list.forEach(clearTimeout)
  }, [])

  function finish() {
    if (afterPickStep(isGuest, !!onRequireAuth) === 'guest') setStep('guest')
    else onClose(true)
  }

  function pick(m) {
    if (picked != null) return // защита от двойного тапа
    setPicked(m)
    const saved = setDailyMinutes(m).catch(() => null)
    if (!onboarding) { saved.then(finish); return }
    const t = pickTimeline()
    timers.current.push(
      setTimeout(() => setLeaving(true), t.fadeAt),
      setTimeout(() => { setHoldH(askRef.current?.offsetHeight ?? null); setStep('thanks') }, t.thanksAt),
      setTimeout(() => { saved.then(finish) }, t.doneAt),
    )
  }

  return (
    <div className="lrSheetBack" onClick={() => { if (!locked) onClose(false) }}>
      <div className="lrSheet" role="dialog" aria-label="Минуты в день" onClick={e => e.stopPropagation()}>
        {step === 'minutes' && (
          <div ref={askRef} className={leaving ? 'lrMinAsk lrMinAskOut' : 'lrMinAsk'}>
            <p className="lrSheetWord">{copy.title}</p>
            <p className="lrSheetPhrase">{copy.lead}</p>
            <div className={locked ? 'lrMinutes lrMinutesLocked' : 'lrMinutes'}>
              {MINUTE_CHOICES.map(m => {
                const cls = ['lrMinute', (m === current || m === picked) && 'lrMinuteOn', m === picked && 'lrMinutePicked']
                return (
                  <button key={m} className={cls.filter(Boolean).join(' ')} aria-pressed={m === picked} onClick={() => pick(m)}>
                    <svg className="lrMinuteTick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 7.5" /></svg>
                    <b>{m} мин</b>
                    <span>до {CARDS_BY_MINUTES[m]} карточек</span>
                  </button>
                )
              })}
            </div>
            <button className="lrBtn lrBtnGhost" disabled={locked} onClick={() => onClose(false)}>{current ? 'Закрыть' : 'Пропустить'}</button>
          </div>
        )}
        {step === 'thanks' && <MinutesThanks minHeight={holdH} />}
        {step === 'guest' && (
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
