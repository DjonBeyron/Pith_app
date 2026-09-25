import { useEffect, useState } from 'react'
import { loadScript, saveReviewCards } from '../../shared/lib/lessonsApi.js'
import { plural } from '../../shared/lib/plural.js'

const cardsWord = n => `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`

// Колода в окне «Импорт/экспорт» урока (canvas/lesson-io/LessonIoPanel.jsx).
// Канвас держит только ноды, колоду — нет: для экспорта берём её с сервера,
// а колоду из файла пишем на сервер сразу (с подтверждением) — «Сохранить»
// канваса её не трогает (lessonsApi.keepReviewCards)
export function useDeckIo(lessonId) {
  const [cards, setCards] = useState([])

  useEffect(() => {
    if (!lessonId) return
    let alive = true
    loadScript(lessonId)
      .then(d => { if (alive) setCards(d?.script?.reviewCards ?? []) })
      .catch(() => {}) // экспорт просто уйдёт без колоды
    return () => { alive = false }
  }, [lessonId])

  // Текст для отчёта окна; '' — в файле колоды нет
  async function applyImported(imported) {
    if (!lessonId || !imported?.length) return ''
    const ask = `В файле ${cardsWord(imported.length)} повтора. Заменить ими колоду урока ` +
      `(сейчас ${cardsWord(cards.length)})? Колода сохранится сразу.`
    if (!window.confirm(ask)) return 'колоду из файла не применил'
    await saveReviewCards(lessonId, imported)
    setCards(imported)
    return `колода сохранена: ${cardsWord(imported.length)}`
  }

  return { cards, applyImported }
}
