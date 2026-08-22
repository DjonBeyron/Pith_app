import { useState, useEffect } from 'react'
import { getLastEditedLesson } from '../lib/lastEditedLesson.js'

// Сколько всплывашка висит, если её не трогать
const HIDE_AFTER_MS = 12000

// Маленькое окно при запуске приложения (только админу): «продолжить с того
// урока, что правил в прошлый раз». Кнопка ведёт прямо в канвас этого урока,
// крестик закрывает; если не трогать — уходит само.
export default function ResumeEditingToast({ onOpen }) {
  // Читаем один раз при монтировании: всплывашка про то, что было ДО запуска,
  // и не должна меняться, пока пользователь работает
  const [lesson] = useState(getLastEditedLesson)
  const [closing, setClosing] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!lesson) return
    const hide = setTimeout(() => setClosing(true), HIDE_AFTER_MS)
    return () => clearTimeout(hide)
  }, [lesson])

  useEffect(() => {
    if (!closing) return
    const done = setTimeout(() => setGone(true), 260)  // дать доиграть уходу
    return () => clearTimeout(done)
  }, [closing])

  if (!lesson || gone) return null

  return (
    <div className={`resumeToast${closing ? ' resumeToastOut' : ''}`}>
      <div className="resumeToastText">
        <span className="resumeToastLabel">Продолжить редактирование</span>
        <span className="resumeToastTitle">{lesson.title || 'Урок без названия'}</span>
      </div>
      <button className="resumeToastGo" onClick={() => { setClosing(true); onOpen(lesson) }}>
        Перейти
      </button>
      <button className="resumeToastClose" title="Закрыть" onClick={() => setClosing(true)}>✕</button>
    </div>
  )
}
