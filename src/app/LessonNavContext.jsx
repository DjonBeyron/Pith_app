import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getNavStack, pushNavStack, popNavStack } from '../shared/lib/lessonNavStackApi.js'

// Стек паузы/возврата для перехода по ноде lesson_ref (канвас): переход на
// другой урок/модуль ставит текущий урок «на паузу» (его id уходит в стек),
// выход из целевого экрана снимает верхний id и возвращает туда. Один
// провайдер на всё приложение (main.jsx) — оверлей рисует LessonNavOverlay.jsx
// поверх обычных вкладок, не размонтируя их.
const LessonNavCtx = createContext(null)

export function LessonNavProvider({ children }) {
  const [overlay, setOverlay] = useState(null)

  // На старте — если стек не пуст (переход был прерван перезагрузкой или
  // закрытием вкладки), сразу открываем верхний урок оверлеем; сам стек не
  // трогаем — обычный выход из оверлея его снимет как всегда
  useEffect(() => {
    getNavStack().then(stack => {
      const top = stack[stack.length - 1]
      if (top) setOverlay({ kind: 'lesson', lessonId: top })
    })
  }, [])

  // target — { isModule, targetId, targetTitle } с ноды lesson_ref.
  // fromLessonId — урок, который встаёт на паузу; null — ничего не пушим
  // (открытие отдельного урока по закладке из «Мои уроки», паузить нечего)
  const openRef = useCallback(async (target, fromLessonId) => {
    if (fromLessonId) await pushNavStack(fromLessonId)
    setOverlay(target.isModule
      ? { kind: 'module', moduleId: target.targetId, moduleTitle: target.targetTitle }
      : { kind: 'lesson', lessonId: target.targetId, lessonTitle: target.targetTitle ?? '' })
  }, [])

  // Закрытие оверлея (финиш урока / «Назад» в шапке модуля) — снимает верхний
  // элемент стека и возвращает туда, если он есть, иначе оверлей просто гаснет
  const handleExit = useCallback(async () => {
    const prevLessonId = await popNavStack()
    setOverlay(prevLessonId ? { kind: 'lesson', lessonId: prevLessonId } : null)
  }, [])

  return (
    <LessonNavCtx.Provider value={{ overlay, openRef, handleExit }}>
      {children}
    </LessonNavCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLessonNav() {
  return useContext(LessonNavCtx)
}
