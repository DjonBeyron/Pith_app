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
    .map(cell => ({ key: cell.id, soft: !!cell.isHeader, phrases: [cell.value, ...(cell.options ?? [])].flatMap(candidatePhrases) }))
    .filter(t => t.phrases.length)
}

// Одна цель — на слово ответа вне таблицы (те же дорожки, что уже
// автоматически заводит answerWordsOutsideTable, см. tableGridUtils.js)
export function buildWordTargets(words) {
  return (words ?? []).map(w => ({ key: w, phrases: candidatePhrases(w) }))
}

// Ищет первую фразу из phrases, начинающуюся ровно на позиции i и не задевающую занятые слова
function phraseAt(flat, used, i, phrases) {
  let len = 0
  for (const phrase of phrases) {
    const words = phrase.split(' ')
    if (words.length <= len || i + words.length > flat.length) continue
    let ok = true
    for (let k = 0; k < words.length && ok; k++) ok = !used[i + k] && flat[i + k].tok === words[k]
    if (ok) len = words.length
  }
  return len
}

// wordTimings — хронологический список { w, t } (секунда начала слова).
// Возвращает Map<key, {start, end}> только для целей, которые реально
// прозвучали — не найденную цель (обычно заголовок таблицы, не произносимый
// буквально) вызывающий код просто не трогает. end === null означает «это
// было последнее найденное слово в записи» — сколько длится клип дальше,
// решает вызывающий код (обычно до конца композиции).
//
// Два прохода. 1) По порядку целей (ячейки идут по строкам — так же их и
// диктуют): каждая цель ищет своё слово СТРОГО после предыдущей найденной,
// ненайденная ничего не сдвигает (заголовки столбцов — soft — в этом проходе не участвуют). Иначе одинаковые ячейки («to» в каждой
// строке) разбирались бы по порядку любых упоминаний в речи, включая «to
// нужен» из пояснения, и подсветка уезжала бы на чужие слова. 2) Что не
// нашлось по порядку (диктор говорит не в порядке ячеек) — прежний поиск
// «кто первым прозвучал» по ещё свободным словам.
export function matchWordTimingsToTargets(wordTimings, targets) {
  const flat = (wordTimings ?? [])
    .map(wt => ({ tok: stripPunct(normalizeAnswerText(wt.w)), t: wt.t }))
    .filter(f => f.tok)

  const results = new Map()
  const used = new Array(flat.length).fill(false)
  const take = (key, i, len) => {
    results.set(key, { start: flat[i].t, end: i + len < flat.length ? flat[i + len].t : null })
    for (let k = 0; k < len; k++) used[i + k] = true
  }

  let pos = 0
  for (const { key, phrases, soft } of targets) {
    if (soft) continue // заголовок («Мостик») мог прозвучать где угодно далеко впереди и сдвинул бы весь порядок — ему только запасной проход
    for (let i = pos; i < flat.length; i++) {
      const len = phraseAt(flat, used, i, phrases)
      if (len) { take(key, i, len); pos = i + len; break }
    }
  }

  const remaining = new Map(targets.filter(t => !results.has(t.key)).map(t => [t.key, t.phrases]))
  for (let i = 0; i < flat.length && remaining.size; i++) {
    let best = null // { key, len }
    for (const [key, phrases] of remaining) {
      const len = phraseAt(flat, used, i, phrases)
      if (len && (!best || len > best.len)) best = { key, len }
    }
    if (best) { take(best.key, i, best.len); remaining.delete(best.key); i += best.len - 1 }
  }
  return results
}
