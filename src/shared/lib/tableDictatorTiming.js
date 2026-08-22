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

// Ни одно слово не должно зажечься раньше, чем таблица физически уехала с
// экрана. Раньше «длинный» лид-ин доставался только последнему по времени
// слою — и два слова, поставленные почти на одно место, светились вразнобой:
// одно попадало в «последние», другое нет, разница выходила в 0.42с. Теперь
// правило одно для всех: не раньше конца отъезда.
export const EXTRA_AFTER_SLIDE_S = TABLE_SLIDE_S + EXTRA_BUFFER_S   // 0.72s

// Когда слово реально загорается зелёным. Лид-ин (анимация + буфер, у
// последних слов ещё и отъезд таблицы) не может вылезти за конец клипа: иначе
// окно «горит» пустое и слово не загорается ВООБЩЕ — ни в чат, ни в фразу.
// Так и ломалось: два слова на одном времени получали длинный лид-ин 1.32с
// при клипе в 1.0с. Гарантируем минимум MIN_GLOW_S свечения.
export const MIN_GLOW_S = 0.25

// extrasStart — начало самого раннего клипа слова: с него уезжает таблица и
// появляется список. Слово зажигается позже из двух: свой лид-ин и конец
// отъезда. Одинаковые по времени клипы дают одинаковый момент — слова
// светятся синхронно, даже если автор промахнулся мышью на пару кадров.
export function wordGreenAt(clip, extrasStart = null) {
  if (!clip) return 0
  const afterSlide = extrasStart != null ? extrasStart + EXTRA_AFTER_SLIDE_S : 0
  const wanted = Math.max(clip.start + EXTRA_LEAD_IN_S, afterSlide)
  const latest = Math.max(clip.start, clip.end - MIN_GLOW_S)
  return Math.min(wanted, latest)
}

// Начало самого раннего клипа слова вне таблицы (момент отъезда таблицы)
export function extrasStartSec(layers) {
  let start = null
  for (const l of layers ?? []) {
    if (l.visible === false || !l.word || !l.clips?.length) continue
    if (start == null || l.clips[0].start < start) start = l.clips[0].start
  }
  return start
}

// Сколько длится мерцание выбора: ровно столько, сколько слой светится —
// растянул клип, значит и мигает дольше. Одинаково для ячеек таблицы и для
// слов вне её.
//
// Нижняя граница совсем маленькая: раньше короткое свечение (0.25с) всё равно
// получало 0.45с мерцания, анимация обрывалась на середине снятием подсветки
// и выглядела рвано. Верхняя — чтобы длинный клип не мигал бесконечно.
export const FLASH_MIN_S = 0.12
export const FLASH_MAX_S = 3

export function flashDurationSec(from, to) {
  const dur = (to ?? 0) - (from ?? 0)
  return Math.min(FLASH_MAX_S, Math.max(FLASH_MIN_S, dur))
}

// Длительности мерцания для всех слоёв разом: ячейки по id, слова по чипу.
// Считает панель один раз на таймлайн и раздаёт в разметку.
export function buildFlashDurations(layers, chipWords) {
  const cells = new Map()
  const chips = new Map()
  const extrasStart = extrasStartSec(layers)
  const chipByLayer = mapWordLayersToChips(layers, chipWords)
  for (const l of layers ?? []) {
    const clip = l.clips?.[0]
    if (!clip || l.isCheck) continue
    if (l.word) {
      const key = chipByLayer.get(l.id)
      if (key) chips.set(key, flashDurationSec(wordGreenAt(clip, extrasStart), clip.end))
    } else if (l.cellId) {
      cells.set(l.cellId, flashDurationSec(clip.start, clip.end))
    }
  }
  return { cells, chips }
}

// Докуда тянутся клипы слов вне таблицы: после этого момента ждать сборку
// больше нечего, и проверку можно запускать даже если что-то не собралось
export function lastWordClipEnd(layers) {
  let end = 0
  for (const l of layers ?? []) {
    if (l.visible === false || !l.word || !l.clips?.length) continue
    if (l.clips[0].end > end) end = l.clips[0].end
  }
  return end
}

// Один word-слой = один чип в списке. Раньше чип искали по тексту слова
// (indexOf), и два одинаковых слова в ответе делили один и тот же чип —
// второе просто не отрабатывало. Раздаём чипы слоям по одному.
export function mapWordLayersToChips(layers, chipWords) {
  const used = new Set()
  const map = new Map()
  for (const l of layers ?? []) {
    if (!l.word) continue
    const idx = (chipWords ?? []).findIndex((w, i) => !used.has(i) && w === l.word)
    if (idx === -1) continue
    used.add(idx)
    map.set(l.id, `extra-${idx}`)
  }
  return map
}

// Порядок, в котором слова должны падать в бокс: как в ответе автора. Нужен,
// когда несколько слов загораются одновременно — очередь их прилёта иначе
// зависела бы от порядка слоёв в таймлайне, и фраза собиралась бы неверной.
export function answerOrderOf(word, extraFromAnswer) {
  const i = (extraFromAnswer ?? []).indexOf(word)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

// Проявление текста ячейки — независимый от подсветки clips[1] у cell-слоя
// (серый клип на таймлайне, по умолчанию во всю его длину). Возвращает id ячеек,
// чей текст виден в момент t. Слой без второго клипа (старые данные) или
// скрытый (visible:false) — текст всегда виден (без гейтинга, как раньше).
export function computeRevealedCellIds(layers, t) {
  const revealed = new Set()
  for (const l of layers ?? []) {
    if (!l.cellId || l.word || l.isCheck) continue
    const reveal = l.clips?.[1]
    if (l.visible === false || !reveal) { revealed.add(l.cellId); continue }
    if (t >= reveal.start && t < reveal.end) revealed.add(l.cellId)
  }
  return revealed
}

// Ячейки, подсвеченные (зелёные) в момент t — clips[0] cell-слоёв. Общая с
// плеером логика: её же использует предпросмотр в редакторе таймлайна, чтобы
// монтаж показывал ровно то, что увидит ученик.
export function computeHighlightedCellIds(layers, t) {
  const active = new Set()
  for (const l of layers ?? []) {
    if (!l.cellId || l.word || l.isCheck) continue
    if (l.visible === false || l.highlightOn === false) continue
    const hl = l.clips?.[0]
    if (hl && t >= hl.start && t < hl.end) active.add(l.cellId)
  }
  return active
}

// Сколько результат проверки висит на экране до обратной анимации: ровно
// длина клипа «Проверить» — растянул слой, значит момент держится дольше.
// Считаем от МОМЕНТА запуска проверки, а не по абсолютной метке конца клипа:
// проверка может сдвинуться (ждём досборку слов), и тогда абсолютный конец
// съел бы весь показ результата.
export const MIN_RESULT_S = 0.6

export function resultHoldSec(checkAt, checkOut) {
  if (checkOut == null || checkAt == null) return null
  return Math.max(MIN_RESULT_S, checkOut - checkAt)
}

// Докуда тянется самый поздний клип таймлайна. Нужна, когда длительность
// прогона взять больше неоткуда: у ноды нет ни длины композиции, ни аудио
// (или его не удалось смонтировать) — иначе таблица висела бы неподвижно.
export function timelineEndSec(layers) {
  let end = 0
  for (const l of layers ?? []) {
    for (const c of l.clips ?? []) {
      if (c?.end > end) end = c.end
    }
  }
  return end
}

// Сравнение двух Set — чтобы не дёргать setState, если состав не изменился.
export function sameIdSet(a, b) {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}
