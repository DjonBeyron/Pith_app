import { useEffect, useState } from 'react'
import { loadScript, saveReviewCards } from '../../shared/lib/lessonsApi.js'
import { plural } from '../../shared/lib/plural.js'

const cardsWord = n => `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`

// Колода в окне «Импорт/экспорт» урока (canvas/lesson-io/LessonIoPanel.jsx).
// Канвас держит только ноды, колоду — нет: для экспорта берём её с сервера,
// а колоду из файла пишем на сервер сразу (с подтверждением) — «Сохранить»
// канваса её не трогает (lessonsApi.keepOwnKeys)
export function useDeckIo(lessonId) {
  const [cards, setCards] = useState([])
  // loaded — колода с сервера уже пришла (или ждать нечего): до этого экспорт был бы без неё
  const [loaded, setLoaded] = useState(!lessonId)

  useEffect(() => {
    if (!lessonId) return
    let alive = true
    loadScript(lessonId)
      .then(d => { if (alive) setCards(d?.script?.reviewCards ?? []) })
      .catch(() => {}) // экспорт просто уйдёт без колоды
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [lessonId])

  // Текст для отчёта окна; '' — в файле колоды нет. ask:false — подтверждение уже
  // спросило окно (одно на все части файла)
  async function applyImported(imported, { ask = true } = {}) {
    if (!lessonId || !imported?.length) return ''
    const question = `В файле ${cardsWord(imported.length)} повтора. Заменить ими колоду урока ` +
      `(сейчас ${cardsWord(cards.length)})? Колода сохранится сразу.`
    if (ask && !window.confirm(question)) return 'колоду из файла не применил'
    await saveReviewCards(lessonId, imported)
    setCards(imported)
    return `колода сохранена: ${cardsWord(imported.length)}`
  }

  return { cards, loaded, applyImported }
}
