import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { getLastEditedLesson } from '../lib/lastEditedLesson.js'

const OUT_MS = 260 // = длительность resumeToastOut в resume-toast.css

// Маленькое окно при запуске приложения (только админу): «продолжить с того
// урока, что правил в прошлый раз». Кнопка ведёт прямо в канвас этого урока,
// крестик закрывает. Само по себе окно НЕ уходит: раньше оно исчезало через
// 12 секунд, и стоило отвлечься — возвращаться к уроку приходилось руками
// через модули.
//
// Закрытие срабатывает с первого тапа: цель крестика 44×44 (рисуется кружок 28),
// касание обрабатывается по pointerup (на iOS click после тапа по «залипшему»
// hover/анимации мог не прийти), click остаётся для мыши и клавиатуры.
// Повторные срабатывания гасит closingRef.
export default function ResumeEditingToast({ onOpen, onClose }) {
  // Читаем один раз при монтировании: всплывашка про то, что было ДО запуска,
  // и не должна меняться, пока пользователь работает
  const [lesson] = useState(getLastEditedLesson)
  const [closing, setClosing] = useState(false)
  const [gone, setGone] = useState(false)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Уход проигрывается анимацией, и только потом окно снимается совсем. Таймер
  // зависит только от closing: onClose приходит новой функцией на каждый
  // рендер оболочки и раньше перезапускал отсчёт
  useEffect(() => {
    if (!closing) return
    const finish = () => { setGone(true); onCloseRef.current?.() }
    const done = setTimeout(finish, OUT_MS)
    // Таймеры в фоне замирают — по возврату доводим закрытие сразу
    const onVisible = () => { if (document.visibilityState === 'visible') { clearTimeout(done); finish() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(done); document.removeEventListener('visibilitychange', onVisible) }
  }, [closing])

  if (!lesson || gone) return null

  const dismiss = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
  }
  // Касание — по отпусканию пальца; мышь и клавиатура — через click
  const go = () => {
    if (closingRef.current) return
    dismiss()
    onOpen(lesson)
  }
  return (
    <div className={`resumeToast${closing ? ' resumeToastOut' : ''}`}>
      <div className="resumeToastText">
        <span className="resumeToastLabel">Продолжить редактирование</span>
        <span className="resumeToastTitle">{lesson.title || 'Урок без названия'}</span>
      </div>
      <button className="resumeToastGo" onPointerUp={e => { if (e.pointerType === 'touch') go() }} onClick={go}>
        Перейти
      </button>
      <button className="resumeToastClose" type="button" aria-label="Закрыть" onPointerUp={e => { if (e.pointerType === 'touch') dismiss() }} onClick={dismiss}>
        <span className="resumeToastX"><X size={14} strokeWidth={2.4} aria-hidden="true" /></span>
      </button>
    </div>
  )
}
