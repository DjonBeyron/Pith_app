// «Колода урока сохранена» — редактор карточек (useReviewCards.save) сообщает,
// отчёт Админ → «Колоды» (AdminDecksTab) перечитывает число карточек: он
// остаётся смонтированным под редактором, и без этого после «Назад» показывал
// старое число (и «＋ В обучение» оставалась выключенной у слова без колоды)
const EVENT = 'pithy:deck-saved'

export function notifyDeckSaved(lessonId) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { lessonId } }))
}

export function onDeckSaved(fn) {
  const h = e => fn(e.detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
