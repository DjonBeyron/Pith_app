// Тайминг реакции на word-слой (слово вне таблицы) в режиме диктора:
// с начала клипа сперва идёт анимация (слайд таблицы + появление списка слов),
// затем ещё небольшая пауза — и только после этого слово реально становится
// «выбираемым» (загорается зелёным). Одни и те же числа использует и плеер
// (useTableDictatorRaf/dictatorPostAudio — что реально происходит), и редактор
// таймлайна (TableTimelineTrack — превью этого куска на слое другим цветом),
// чтобы монтаж соответствовал плееру.
export const EXTRA_ANIM_S    = 0.6   // слайд таблицы + появление чипов
export const EXTRA_BUFFER_S  = 0.3   // пауза после анимации перед стартом выбора
export const EXTRA_LEAD_IN_S = EXTRA_ANIM_S + EXTRA_BUFFER_S   // 0.9s суммарно

// Длительность CSS-анимации отъезда таблицы влево (см. .tdTableSection/.tmTableSection
// transition в table-dictator.css/table-manual.css) — держим числом здесь же, чтобы
// таймлайн и плеер не разъехались, если анимацию поменяют только в CSS.
export const TABLE_SLIDE_S = 0.42

// У ПОСЛЕДНЕГО по времени word-слоя (после него сборка фразы завершена и начинается
// проверка) лид-ин должен ещё и гарантированно дождаться конца отъезда таблицы —
// иначе слово может «зазеленеть» раньше, чем таблица физически уехала с экрана.
export const EXTRA_LEAD_IN_LAST_S = EXTRA_LEAD_IN_S + TABLE_SLIDE_S   // 1.32s

// Находит id word-слоя с самым поздним стартом клипа среди слоёв таймлайна —
// именно у него лид-ин увеличивается на TABLE_SLIDE_S (см. EXTRA_LEAD_IN_LAST_S).
export function findLastWordLayerId(layers) {
  let lastId = null
  let lastStart = -Infinity
  for (const l of layers ?? []) {
    if (!l.word || !l.clips?.length) continue
    const s = l.clips[0].start
    if (s > lastStart) { lastStart = s; lastId = l.id }
  }
  return lastId
}
