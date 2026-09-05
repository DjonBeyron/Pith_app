import { normalizeAnswerText } from '../../../shared/lib/tableCellMatch.js'

// «Смонтировать» — черновая авто-расстановка подсветки таймлайна диктанта по
// реальной озвучке: строго по времени слов (ElevenLabs-генерация или Groq
// Whisper-транскрипция готовой записи — формат тайминга одинаковый, алгоритму
// всё равно, откуда голос), не по структуре таблицы. Результат — обычные
// клипы существующих слоёв (updateClip/toggleHighlight в
// useTableAutoMontage.js) — ничем не отличаются от выставленных руками,
// поэтому подвинуть их дальше на таймлайне можно точно так же.

// Убирает знаки препинания по краям слова — ElevenLabs отдаёт слова «как в
// тексте» (может быть «try.», «she,»), Groq транскрипцию уже чистит сам, но
// полагаться на это не стоит: чистим всегда сами.
function stripPunct(w) {
  return w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
}

// Кандидаты для поиска в озвучке для одного текста ячейки/варианта: сам
// текст целиком (вдруг прозвучал слово в слово) плюс, если внутри запятая
// или слэш («he, she, it», «he/she/it») — каждый элемент группы отдельно.
// В реальной русской озвучке между элементами группы обычно союз «и»/«или»,
// а не запятая — искать группу одной фразой почти всегда бесполезно.
// Длинные кандидаты идут первыми — совпадение длиннее выигрывает у короче.
function candidatePhrases(text) {
  const whole = normalizeAnswerText(text)
  if (!whole) return []
  const parts = (text ?? '').split(/[,/]/).map(s => normalizeAnswerText(s)).filter(Boolean)
  return [...new Set([whole, ...parts])].sort((a, b) => b.split(' ').length - a.split(' ').length)
}

// Одна цель — на ячейку таблицы (текст + варианты особой ячейки)
export function buildCellTargets(cells) {
  return (cells ?? [])
    .map(cell => ({ key: cell.id, phrases: [cell.value, ...(cell.options ?? [])].flatMap(candidatePhrases) }))
    .filter(t => t.phrases.length)
}

// Одна цель — на слово ответа вне таблицы (те же дорожки, что уже
// автоматически заводит answerWordsOutsideTable, см. tableGridUtils.js)
export function buildWordTargets(words) {
  return (words ?? []).map(w => ({ key: w, phrases: candidatePhrases(w) }))
}

// wordTimings — хронологический список { w, t } (секунда начала слова).
// Возвращает Map<key, {start, end}> только для целей, которые реально
// прозвучали — не найденную цель (обычно заголовок таблицы, не произносимый
// буквально) вызывающий код просто не трогает. end === null означает «это
// было последнее найденное слово в записи» — сколько длится клип дальше,
// решает вызывающий код (обычно до конца композиции).
export function matchWordTimingsToTargets(wordTimings, targets) {
  const flat = (wordTimings ?? [])
    .map(wt => ({ tok: stripPunct(normalizeAnswerText(wt.w)), t: wt.t }))
    .filter(f => f.tok)

  const remaining = new Map(targets.map(t => [t.key, t.phrases]))
  const results = new Map()

  let i = 0
  while (i < flat.length && remaining.size) {
    let best = null // { key, len }
    for (const [key, phrases] of remaining) {
      for (const phrase of phrases) {
        const words = phrase.split(' ')
        if (i + words.length > flat.length) continue
        if (best && words.length <= best.len) continue // короче уже найденного смысла проверять нет
        const slice = flat.slice(i, i + words.length).map(f => f.tok).join(' ')
        if (slice === phrase) best = { key, len: words.length }
      }
    }
    if (best) {
      const start = flat[i].t
      const end = i + best.len < flat.length ? flat[i + best.len].t : null
      results.set(best.key, { start, end })
      remaining.delete(best.key)
      i += best.len
    } else {
      i += 1
    }
  }
  return results
}
