import { SkipBack, SkipForward } from 'lucide-react'

// Появляется в тулбаре, только пока открыт плеер урока — та же самая
// пошаговая логика, что у десктопной PlayerAdminPanel (usePlayerStepControl.js
// через мост debugPlayerStep.js), просто доступна и на телефоне. В отличие от
// верхнего ряда (тот двигает сырое время видео/CSS), здесь "назад"/"вперёд" —
// это ВЕСЬ сценарий как один шаг: следующее/предыдущее сообщение целиком,
// с откатом или проставлением ответа (см. usePlayerStepControl.js:back/forward).
// Своей кнопки паузы больше нет — DebugToolbar.jsx держит один общий тумблер
// на оба режима (раньше две независимые паузы легко расходились)
export default function PlayerStepRow({ step }) {
  if (!step) return null

  return (
    <div className="dbgToolbarRow" title="Шаг по всему сценарию урока (сообщения + ответы), не по времени видео">
      <button onClick={step.back} disabled={!step.canBack} title="Назад: откатить последнее сообщение">
        <SkipBack size={15} />
      </button>
      <button onClick={step.forward} title="Вперёд: показать следующее сообщение сейчас же">
        <SkipForward size={15} />
      </button>
      <button
        className={step.answerCorrect ? 'dbgToolbarAnswerBtn' : 'dbgToolbarAnswerBtn dbgToolbarAnswerBad'}
        onClick={() => step.setAnswerCorrect(v => !v)}
        title="Каким ответом шаг «вперёд» отвечает за ученика на вопросах"
      >
        {step.answerCorrect ? 'верно' : 'неверно'}
      </button>
    </div>
  )
}
