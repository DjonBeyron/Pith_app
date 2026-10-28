// Виртуализация ленты разбора — чистая логика (без React и DOM): какие слоты «рядом» с видимой областью и какие из них рисовать телом,
// а какие — пустой рамкой прежней высоты. Повод: 271 превью сообщений в DOM разом тормозили всё окно (закрытие окон, скролл, «Применить»).
export const GHOST_HEIGHT = 64 // высота рамки слота, который ещё ни разу не рисовался

/** Новое множество «рядом» по записям IntersectionObserver: [{ ref, near, height }]; без изменений возвращает прежнее (без перерисовки) */
export function nearUpdate(prev, entries, heights) {
  let next = null
  for (const e of entries) {
    if (e.near === prev.has(e.ref)) continue
    next ??= new Set(prev)
    if (e.near) next.add(e.ref)
    else { next.delete(e.ref); if (e.height > 0) heights.set(e.ref, e.height) }
  }
  return next ?? prev
}

/** Рисовать тело слота i: он рядом ИЛИ рядом следующий за ним — реакция (ReactionModule) ищет пузырь ПЕРЕД собой, он должен быть в DOM */
export const showSlot = (near, items, i) => near.has(items[i].ref) || (i + 1 < items.length && near.has(items[i + 1].ref))
