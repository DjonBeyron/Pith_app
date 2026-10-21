import { useEffect, useRef, useState } from 'react'
import { onPlayerStepChange } from '../../debugTools/debugPlayerStep.js'
import { useDraggablePosition } from '../../debugTools/useDraggablePosition.js'

// «Скипер нод» — маленькое плавающее окно админа поверх урока (PlayerOverlays.jsx, настройка «Скипер нод» в шестерёнке):
// ▲ — вверх по ветке (снять последнее сообщение и пройти кусок заново), ▼ — вниз (следующая нода сейчас же: ответ за ученика
// по тумблеру ✓/✗, переход без ожидания печати и озвучки). Та же пошаговая логика, что у десктопной панели и дебаг-тулбара
// (usePlayerStepControl.js через мост debugPlayerStep.js) — своей логики шага здесь нет. Окно перетаскивается за ручку
// (useDraggablePosition, позиция запоминается), в вёрстку ленты не входит (position: fixed), ничего не перекрывает по умолчанию
export default function PlayerSkipper() {
  const [step, setStep] = useState(null)
  useEffect(() => onPlayerStepChange(setStep), [])
  const ref = useRef(null)
  const { style, dragHandleProps } = useDraggablePosition(ref, { storageKey: 'pithy_skipper_pos' })
  if (!step) return null
  return (
    <div ref={ref} className="playerSkipper" style={style} role="toolbar" aria-label="Скипер нод">
      <div className="playerSkipperGrip" {...dragHandleProps} title="Перетащить">⋮</div>
      <button
        type="button" className="playerSkipperBtn" disabled={!step.canBack} onClick={step.back}
        title="Вверх по ветке: снять последнее сообщение и пройти этот кусок заново"
      >▲</button>
      <button
        type="button" className="playerSkipperBtn" onClick={step.forward}
        title="Вниз по ветке: показать следующую ноду сейчас же (на вопросе — ответить за ученика)"
      >▼</button>
      {/* Три режима ответа по кругу: ✓ верно → ✗ неверно → ? случайно (монетка на каждом вопросе) */}
      <button
        type="button" className={`playerSkipperAns${step.answerCorrect === false ? ' playerSkipperAns--bad' : step.answerCorrect == null ? ' playerSkipperAns--rnd' : ''}`}
        onClick={() => step.setAnswerCorrect(v => (v === true ? false : v === false ? null : true))}
        title={step.answerCorrect === true ? 'Шаг ▼ отвечает ВЕРНО (нажми: неверно)' : step.answerCorrect === false ? 'Шаг ▼ отвечает НЕВЕРНО (нажми: случайно)' : 'Шаг ▼ отвечает СЛУЧАЙНО (нажми: верно)'}
      >{step.answerCorrect === true ? '✓' : step.answerCorrect === false ? '✗' : '?'}</button>
    </div>
  )
}
