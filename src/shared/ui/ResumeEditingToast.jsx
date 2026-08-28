import { useState, useEffect } from 'react'
import { getLastEditedLesson } from '../lib/lastEditedLesson.js'

// Маленькое окно при запуске приложения (только админу): «продолжить с того
// урока, что правил в прошлый раз». Кнопка ведёт прямо в канвас этого урока,
// крестик закрывает. Само по себе окно НЕ уходит: раньше оно исчезало через
// 12 секунд, и стоило отвлечься — возвращаться к уроку приходилось руками
// через модули.
export default function ResumeEditingToast({ onOpen, onClose }) {
  // Читаем один раз при монтировании: всплывашка про то, что было ДО запуска,
  // и не должна меняться, пока пользователь работает
  const [lesson] = useState(getLastEditedLesson)
  const [closing, setClosing] = useState(false)
  const [gone, setGone] = useState(false)

  // Уход проигрывается анимацией, и только потом окно снимается совсем
  useEffect(() => {
    if (!closing) return
    const done = setTimeout(() => { setGone(true); onClose?.() }, 260)
    return () => clearTimeout(done)
  }, [closing, onClose])

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
