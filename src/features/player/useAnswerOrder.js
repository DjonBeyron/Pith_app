import { useState } from 'react'
import { useAdmin } from '../../app/AdminContext.jsx'

// Порядок вариантов ответа в уроке — один на все модули с выбором («выбери
// слово», «собери фразу», слова вне таблицы и меню ячеек, «составь
// предложение», «выбери фото»). Ученик получает случайный порядок — один раз
// на монтирование панели (lazy useState), чтобы не подсматривать ответ по
// положению. Админ — детерминированный: верные варианты первыми в авторском
// порядке, следом остальные (ловушки) — так на прогоне сразу видно, что и
// где задано, без угадывания.

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// isCorrect(item) — какие элементы верные (для админа идут первыми);
// null — порядок автора и так «верные, потом ловушки» (собери фразу, extras)
export function orderAnswers(items, isAdmin, isCorrect = null) {
  if (!isAdmin) return shuffle(items)
  if (!isCorrect) return [...items]
  return [...items.filter(isCorrect), ...items.filter(x => !isCorrect(x))]
}

export function useAnswerOrder(items, isCorrect = null) {
  const { isAdmin } = useAdmin()
  const [ordered] = useState(() => orderAnswers(items, isAdmin, isCorrect))
  return ordered
}
