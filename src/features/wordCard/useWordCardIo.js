import { useEffect, useState } from 'react'
import { loadWordCardRaw, saveWordCard } from '../../shared/lib/lessonsApi.js'
import { normalizeWordCard } from './wordCardModel.js'

// Справка слова в окне «Импорт/экспорт» урока (canvas/lesson-io/LessonIoPanel.jsx).
// Канвас держит только ноды, справку — нет: для экспорта берём её с сервера, а
// справку из файла пишем на сервер сразу (с подтверждением) — «Сохранить» канваса
// её не трогает (lessonsApi.keepOwnKeys). Устроено как useDeckIo
export function useWordCardIo(lessonId) {
  const [card, setCard] = useState(null)
  // loaded — справка с сервера уже пришла (или ждать нечего): до этого экспорт был бы без неё
  const [loaded, setLoaded] = useState(!lessonId)

  useEffect(() => {
    if (!lessonId) return
    let alive = true
    loadWordCardRaw(lessonId)
      .then(raw => { if (alive) setCard(normalizeWordCard(raw)) })
      .catch(() => {}) // экспорт просто уйдёт без справки
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [lessonId])

  // Текст для отчёта окна; '' — в файле справки нет. ask:false — подтверждение уже
  // спросило окно (одно на все части файла)
  async function applyImported(imported, { ask = true } = {}) {
    if (!lessonId || !imported) return ''
    const question = `В файле есть справка слова (блоков: ${imported.nodes.length}). Заменить ею справку урока` +
      `${card ? ` (сейчас блоков: ${card.nodes.length})` : ' (сейчас её нет)'}? Справка сохранится сразу.`
    if (ask && !window.confirm(question)) return 'справку из файла не применил'
    await saveWordCard(lessonId, imported)
    setCard(imported)
    return `справка сохранена: блоков ${imported.nodes.length}`
  }

  return { card, loaded, applyImported }
}
