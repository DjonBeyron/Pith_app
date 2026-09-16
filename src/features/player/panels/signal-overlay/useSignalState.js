import { useState } from 'react'
import { nextBlinkIndex } from '../../../../shared/lib/signalMismatch.js'

// Состояние «сигнала ошибки» — общее для ручной таблицы и «Собери фразу»
// (см. PROJECT.md, «Сигналы ошибок»). Проверка нашла первый неверный слот, у
// него есть личный сигнал автора (ref на другую ноду урока) — вместо
// обычного «неверно» (попытка сгорает, панель может закрыться) сигнал
// уходит СООБЩЕНИЕМ В ЛЕНТУ (см. onSignalFired у панелей), а панель просто
// замирает (freeze), ничего не тратим.
//
// blinkIndex — индекс неверного слота в собранной последовательности: панель
// красит именно этот чип миганием. Снимается ТОЛЬКО когда убирают именно
// этот, помеченный чип — снятие любого ДРУГОГО чипа мигание не гасит,
// только сдвигает индекс вслед за реальным словом (массив укорачивается
// splice'ом, см. nextBlinkIndex в shared/lib/signalMismatch.js). Механика
// удаления как таковая (тап по чипу — он убирается) не менялась, это
// существующий способ, см. правку пользователя в задаче.
//
// overlayNode — сама нода-сигнал, пока играет её сообщение в ленте (правка
// 2026-09-15: рендер переехал из своего оверлея в PlayerFeedNodes.jsx —
// сигнал показывается ТЕМ ЖЕ PlayerMessage/resolveModule, что и обычный чат,
// на своём хронологическом месте, см. useSignalMessages.js/shared/lib/feedOrder.js).
// Пока overlayNode не null, taps по таблице/словам и удаление из бокса
// заморожены (freeze) — иначе можно убрать мигающее слово раньше, чем
// ученик успел увидеть/дослушать сигнал.
export function useSignalState() {
  const [blinkIndex, setBlinkIndex]   = useState(null)
  const [overlayNode, setOverlayNode] = useState(null)

  const freeze = overlayNode != null

  function fire(slotIndex, node) {
    setBlinkIndex(slotIndex)
    setOverlayNode(node)
  }

  // Сигнальное сообщение в ленте доиграло само (played/timer его Module'я —
  // см. PlayerFeedNodes.jsx) или сработала страховка по таймеру
  // (useSignalMessages.js) — freeze снят, мигающий чип остаётся ждать удаления
  function dismissOverlay() {
    setOverlayNode(null)
  }

  // removedIndex — позиция убранного чипа. Гасим мигание, только если это
  // был именно помеченный чип; иначе просто сдвигаем индекс вслед за ним
  // (см. nextBlinkIndex)
  function onRemoved(removedIndex) {
    setBlinkIndex(prev => nextBlinkIndex(prev, removedIndex))
  }

  function reset() {
    setBlinkIndex(null)
    setOverlayNode(null)
  }

  return { blinkIndex, overlayNode, freeze, fire, dismissOverlay, onRemoved, reset }
}
