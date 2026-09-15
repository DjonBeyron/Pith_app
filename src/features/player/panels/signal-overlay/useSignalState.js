import { useState } from 'react'

// Состояние «сигнала ошибки» — общее для ручной таблицы и «Собери фразу»
// (см. PROJECT.md, «Сигналы ошибок»). Проверка нашла первый неверный слот, у
// него есть личный сигнал автора (ref на другую ноду урока) — вместо
// обычного «неверно» (попытка сгорает, панель может закрыться) сигнал
// уходит СООБЩЕНИЕМ В ЛЕНТУ (см. onSignalFired у панелей), а панель просто
// замирает (freeze), ничего не тратим.
//
// blinkIndex — индекс неверного слота в собранной последовательности: панель
// красит именно этот чип миганием. Слот НЕ выделяется отдельным id/ключом —
// снимается тем же самым тапом, которым ученик убирает любое собранное
// слово (никакой новой механики «удалить из середины» нет, см. правку
// пользователя в задаче). Поэтому блинк сбрасывается при ЛЮБОМ следующем
// удалении из бокса, а не только при удалении именно этого слова — как
// только ученик начал править ответ, подсказка своё отыграла.
//
// overlayNode — сама нода-сигнал, пока играет её сообщение в ленте (правка
// 2026-09-15: рендер переехал из своего оверлея в PlayerSignalMessages.jsx —
// сигнал показывается ТЕМ ЖЕ PlayerMessage/resolveModule, что и обычный чат,
// см. useSignalMessages.js). Пока overlayNode не null, taps по таблице/словам
// и удаление из бокса заморожены (freeze) — иначе можно убрать мигающее
// слово раньше, чем ученик успел увидеть/дослушать сигнал.
export function useSignalState() {
  const [blinkIndex, setBlinkIndex]   = useState(null)
  const [overlayNode, setOverlayNode] = useState(null)

  const freeze = overlayNode != null

  function fire(slotIndex, node) {
    setBlinkIndex(slotIndex)
    setOverlayNode(node)
  }

  // Сигнальное сообщение в ленте доиграло само (played/timer его Module'я —
  // см. PlayerSignalMessages.jsx) или сработала страховка по таймеру
  // (useSignalMessages.js) — freeze снят, мигающий чип остаётся ждать удаления
  function dismissOverlay() {
    setOverlayNode(null)
  }

  // Любое удаление слова из уже собранного — сигнал считается «принятым к
  // сведению», мигание снимаем целиком (см. комментарий у blinkIndex выше)
  function onRemoved() {
    setBlinkIndex(null)
  }

  function reset() {
    setBlinkIndex(null)
    setOverlayNode(null)
  }

  return { blinkIndex, overlayNode, freeze, fire, dismissOverlay, onRemoved, reset }
}
