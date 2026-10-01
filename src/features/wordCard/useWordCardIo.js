import { useEffect, useState } from 'react'
import { loadWordCardRaw, saveWordCard } from '../../shared/lib/lessonsApi.js'
import { normalizeWordCard } from './wordCardModel.js'

// Справка слова в окне «Импорт/экспорт» урока (canvas/lesson-io/LessonIoPanel.jsx).
// Канвас держит только ноды, справку — нет: для экспорта берём её с сервера, а
// справку из файла пишем на сервер сразу (с подтверждением) — «Сохранить» канваса
// её не трогает (lessonsApi.keepOwnKeys). Устроено как useDeckIo
export function useWordCardIo(lessonId) {
  const [card, setCard] = useState(null)

  useEffect(() => {
    if (!lessonId) return
    let alive = true
    loadWordCardRaw(lessonId)
      .then(raw => { if (alive) setCard(normalizeWordCard(raw)) })
      .catch(() => {}) // экспорт просто уйдёт без справки
    return () => { alive = false }
  }, [lessonId])

  // Текст для отчёта окна; '' — в файле справки нет
  async function applyImported(imported) {
    if (!lessonId || !imported) return ''
    const ask = `В файле есть справка слова (блоков: ${imported.nodes.length}). Заменить ею справку урока` +
      `${card ? ` (сейчас блоков: ${card.nodes.length})` : ' (сейчас её нет)'}? Справка сохранится сразу.`
    if (!window.confirm(ask)) return 'справку из файла не применил'
    await saveWordCard(lessonId, imported)
    setCard(imported)
    return `справка сохранена: блоков ${imported.nodes.length}`
  }

  return { card, applyImported }
}
