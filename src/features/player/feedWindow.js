// Окно ленты чата — чистые функции (хук: useFeedWindow.js).
//
// Проблема: за урок в ленте копится ~100+ сообщений, все остаются
// смонтированными до конца, и цена каждого нового сообщения (FLIP всех строк,
// пересканирование заморозкой, ResizeObserver и <audio> у каждого пузыря)
// растёт линейно — к 80 % урока анимации лагают (замер: «тихий кадр» после
// появления 30 мс на 10-й ноде → 125 мс на 110-й, с CPU×4 fps 33).
//
// Решение: в DOM живёт только «хвост» из FEED_WINDOW записей; всё, что старше,
// остаётся в visibleNodes/сигналах (граф, ответы, шаг назад — нетронуты), но
// не рендерится. Сверху ленты — кнопка «Показать более раннюю историю»: каждый
// клик открывает ещё FEED_PAGE записей (якорь), а когда дошли до начала живой
// сессии — зовёт страницу истории чекпойнта (useGraphPlayer.requestMoreHistory).

export const FEED_WINDOW = 16 // ~12 строк (сигналы и реакции — записи без строки)
export const FEED_PAGE   = 12
// Якорь «с самого начала»: все записи, включая подгружаемые страницы истории
// чекпойнта (они встают в начало массива, и ключевой якорь их бы прятал)
export const ANCHOR_ALL  = '__all__'

export function entryKey(entry) {
  return entry.kind === 'signal' ? entry.key : entry.node.id
}

// Индекс первой рендерящейся записи. anchorKey — ключ записи, до которой
// пользователь раскрыл ленту (null — только хвост; ANCHOR_ALL — всё).
export function windowStart(entries, anchorKey) {
  if (anchorKey === ANCHOR_ALL) return 0
  if (anchorKey != null) {
    const i = entries.findIndex(e => entryKey(e) === anchorKey)
    if (i >= 0) return Math.min(i, Math.max(0, entries.length - FEED_WINDOW))
  }
  return Math.max(0, entries.length - FEED_WINDOW)
}

// Якорь после клика «показать раньше» из текущего start: ещё FEED_PAGE записей
// вверх; дошли до начала — ANCHOR_ALL
export function olderAnchor(entries, start) {
  const i = start - FEED_PAGE
  if (i <= 0) return ANCHOR_ALL
  return entryKey(entries[i])
}
