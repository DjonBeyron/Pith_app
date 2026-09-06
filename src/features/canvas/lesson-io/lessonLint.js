// Детерминированная проверка урока по механически проверяемым пунктам
// PROJECT.md/легенды («Легенда: правила формирования урока — из кода в
// БД»). Это не совет модели — это код: он не читает подсказки, не устаёт к
// сотой ноде и не может «забыть» пункт. Промпт можно обойти, эту функцию —
// нет: она либо находит нарушение, либо нет.
//
// Работает НАПРЯМУЮ на формате обмена (exportLesson.js): { ref, seq, type,
// data, note?, triggers: [{ if, then }] }, где then — ref другой ноды. Это
// тот же JSON, что нейросеть отдаёт как готовый урок — можно проверить его
// СРАЗУ, не проходя импорт в редактор и не заходя в админку (см.
// scripts/lint-lesson.mjs — тот же код, запущенный из командной строки).

const WRONG_TRIGGERS = new Set(['word_wrong', 'phrase_wrong', 'photo_wrong', 'table_wrong'])
const PRAISE_RE = /три из трёх|ни одной ошибки|без единой ошибки|все верно|всё верно/i
const SCENE_HINT_RE = /сцен|фото|кадр|ракурс|свет|персонаж|стикер|горизонт|вертикал/i

function lastWord(text) {
  const m = String(text ?? '').trim().match(/[a-zA-Zа-яёА-ЯЁ']+$/)
  return m ? m[0].toLowerCase() : null
}

function answerTextOf(n) {
  const d = n.data ?? {}
  if (n.type === 'phrase_assembly' && d.words?.length) return d.words.join(' ')
  if (n.type === 'table' && d.answer) return d.answer
  if (n.type === 'word_choice') return d.options?.find(o => o.isCorrect)?.text ?? null
  if (n.type === 'photo_choice') {
    const idx = d.correctIndexes?.[0]
    return idx != null ? d.photos?.[idx]?.label ?? null : null
  }
  return null
}

// Целостность графа: дубли ref, переходы на несуществующий ref. То же, что
// canvasIntegrity.js считает для холста (дубли id/связи в никуда), но по
// ref — без похода через importLesson().
function checkGraph(nodes) {
  const warnings = []
  const refCount = new Map()
  for (const n of nodes) refCount.set(n.ref, (refCount.get(n.ref) ?? 0) + 1)
  const dupRefs = [...refCount.entries()].filter(([, c]) => c > 1).map(([r]) => r)
  if (dupRefs.length) warnings.push(`Дубли ref: ${dupRefs.join(', ')}`)

  const refs = new Set(nodes.map(n => n.ref))
  const dangling = []
  for (const n of nodes) {
    for (const t of n.triggers ?? []) {
      if (t.then && !refs.has(t.then)) dangling.push(`${n.ref}:${t.if}→${t.then}`)
    }
  }
  if (dangling.length) warnings.push(`Связи в никуда: ${dangling.slice(0, 5).join(', ')}`)
  return warnings
}

// Порядок нод «как их пронумерует редактор» — точный порт computeSeqMap()
// (canvas/nodeGraph.js), только по ref вместо id. Нужен один в один, а не
// «похожий» BFS: seq в файле — просто позиция в массиве на момент
// экспорта, а importLesson() при открытии в редакторе зовёт ИМЕННО эту
// функцию и перенумеровывает ноды по графу заново (сперва целиком корневая
// ветка до конца, потом следующая). Если тут считать порядок иначе —
// проверка на голом экспорте (CLI, без редактора) и предупреждения внутри
// редактора будут расходиться: ровно это и поймал пользователь, сравнив
// вывод lint-lesson.mjs с тем, что показала панель после импорта.
function computeVisitOrder(nodes) {
  const incoming = new Set()
  nodes.forEach(n => (n.triggers ?? []).forEach(t => { if (t.then) incoming.add(t.then) }))
  const byRef = Object.fromEntries(nodes.map(n => [n.ref, n]))
  const bySeq = nodes.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const order = []
  const seen = new Set()
  function visit(n) {
    if (!n || seen.has(n.ref)) return
    seen.add(n.ref)
    order.push(n.ref)
    ;(n.triggers ?? []).forEach(t => visit(byRef[t.then]))
  }
  bySeq.filter(n => !incoming.has(n.ref)).forEach(visit) // корни графа
  bySeq.forEach(visit)                                   // циклы и осколки
  return new Map(order.map((ref, i) => [ref, i]))
}

// Reachability с отметкой «путь включал хотя бы один *_wrong переход» —
// нужно, чтобы поймать счётную похвалу, до которой можно дойти после ошибки
// (см. принцип: похвала — утверждение о ПУТИ, а не о ноде).
function reachability(nodes, startRef) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const reached = new Set()
  const reachedViaWrong = new Set()
  const seenStates = new Set()
  const queue = startRef ? [[startRef, false]] : []
  while (queue.length) {
    const [ref, wrong] = queue.pop()
    const key = ref + '|' + wrong
    if (seenStates.has(key) || !byRef.has(ref)) continue
    seenStates.add(key)
    reached.add(ref)
    if (wrong) reachedViaWrong.add(ref)
    for (const t of byRef.get(ref).triggers ?? []) {
      if (!t.then) continue
      queue.push([t.then, wrong || WRONG_TRIGGERS.has(t.if)])
    }
  }
  return { reached, reachedViaWrong }
}

export function lintLesson(nodes) {
  const warnings = []
  if (!nodes?.length) return warnings

  warnings.push(...checkGraph(nodes))

  const start = nodes.reduce((a, b) => (a.seq < b.seq ? a : b), nodes[0])
  const { reached, reachedViaWrong } = reachability(nodes, start.ref)

  const unreached = nodes.filter(n => !reached.has(n.ref))
  if (unreached.length) {
    warnings.push(`Недостижимо от старта (${start.ref}): ${unreached.map(n => n.ref).join(', ')}`)
  }

  // После audio следующая нода не должна быть text — смена формата после
  // голоса идёт через фото, не через текст (см. PROJECT.md/легенду).
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  for (const n of nodes) {
    if (n.type !== 'audio') continue
    for (const t of n.triggers ?? []) {
      const target = t.then ? byRef.get(t.then) : null
      if (target?.type === 'text') {
        warnings.push(`${n.ref} (audio) → ${target.ref} (text): после голоса не текст, а фото`)
      }
    }
  }

  for (const n of nodes) {
    const text = n.data?.content ?? ''
    if (PRAISE_RE.test(text) && reachedViaWrong.has(n.ref)) {
      warnings.push(`${n.ref} ${n.type}: счётная похвала («${text.slice(0, 40)}…») достижима после ошибки`)
    }
  }

  const order = computeVisitOrder(nodes)
  const answers = nodes
    .map(n => ({ n, text: answerTextOf(n), o: order.get(n.ref) }))
    .filter(a => a.text && a.o != null)
    .sort((a, b) => a.o - b.o)
  // Эвристика, не факт: если в ответе нет дополнения (голое «I am trying»),
  // последним словом окажется сам целевой глагол — совпадение здесь
  // ожидаемо и не баг. Так же осознанным может быть повтор ради контраста
  // времён (he tried coffee / he tries coffee) или дублирование в парной
  // ветке ошибки, которую тот же ученик не увидит дважды. Помечаем как
  // «проверь», а не как утверждение об ошибке — решает тот, кто читает.
  for (let i = 1; i < answers.length; i++) {
    const a = answers[i - 1], b = answers[i]
    const wa = lastWord(a.text), wb = lastWord(b.text)
    if (wa && wa === wb) {
      warnings.push(`${a.n.ref} и ${b.n.ref}: проверь — одинаковое последнее слово ответа «${wb}» — «${a.text}» / «${b.text}» (может быть намеренным контрастом времён или парной веткой ошибки)`)
    }
  }

  for (const n of nodes) {
    if (n.type !== 'table') continue
    const d = n.data ?? {}
    if ((d.mode ?? 'dictator') === 'dictator' && !(d.script ?? '').trim()) {
      warnings.push(`${n.ref} table (dictator): нет script — таблица останется немой`)
    }
  }

  for (const n of nodes) {
    const d = n.data ?? {}
    const note = n.note ?? ''
    if (['photo', 'sticker'].includes(n.type) && !(d.imagePrompt ?? '').trim() && SCENE_HINT_RE.test(note)) {
      warnings.push(`${n.ref} ${n.type}: imagePrompt пуст, а note похож на описание сцены — генерация note не прочитает`)
    }
    if (n.type === 'photo_choice') {
      (d.photos ?? []).forEach((p, i) => {
        if (!(p.imagePrompt ?? '').trim()) warnings.push(`${n.ref} photo_choice: у варианта ${i + 1} («${p.label ?? '?'}») пуст imagePrompt`)
      })
    }
  }

  for (const n of nodes) {
    const d = n.data ?? {}
    const text = d.content ?? d.text ?? d.caption ?? null
    if (text == null || !Array.isArray(d.highlights)) continue
    for (const h of d.highlights) {
      if (h.start < 0 || h.end > text.length || h.start > h.end) {
        warnings.push(`${n.ref} ${n.type}: подсветка [${h.start},${h.end}] выходит за длину текста (${text.length})`)
      }
    }
  }

  // replyToSeq вперёд по сценарию — тот же принцип, что уже ловит
  // importLesson.js внутри редактора, здесь по ref-формату напрямую
  for (const n of nodes) {
    const replyToSeq = n.data?.replyToSeq
    if (!replyToSeq) continue
    if (replyToSeq >= n.seq) {
      warnings.push(`${n.ref} ${n.type}: replyToSeq ${replyToSeq} указывает вперёд или на себя — цитата должна быть на уже прозвучавшее`)
    }
  }

  return warnings
}

// Адаптер для нод ПОСЛЕ importLesson() (id + typeData[type], then = внутренний
// id) — тот же формат, в котором ноды лежат на холсте редактора. Нужен
// только внутри приложения (LessonIoPanel.jsx); внешний/CLI-путь получает
// формат обмена напрямую и в адаптере не нуждается.
export function fromCanvasNodes(nodes) {
  return (nodes ?? []).map(n => ({
    ref: n.id,
    seq: n.seq,
    type: n.type,
    data: n.typeData?.[n.type] ?? {},
    note: n.note,
    triggers: (n.triggers ?? []).map(t => ({ if: t.if, then: t.then })),
  }))
}
