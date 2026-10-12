// «Лента урока» для окна «Разбор урока»: вся история чата сразу, без таймеров и ожиданий. Идём по графу от старта; на заданиях выбираем
// ветку «верно» или «неверно» (choices[ref] = 'wrong' — по умолчанию верно) — лента перестраивается по выбранным веткам. Чистые функции.
// Формат нод — обмена (lessonLint): { ref, seq, type, data, triggers: [{ if, then }] }.
const CORRECT = new Set(['word_correct', 'phrase_correct', 'fill_correct', 'type_correct', 'say_done', 'photo_correct', 'table_correct'])
const WRONG = new Set(['word_wrong', 'phrase_wrong', 'fill_wrong', 'type_wrong', 'say_wrong', 'say_skip', 'photo_wrong', 'table_wrong'])
const MAX_ITEMS = 600

export const isExercise = n => (n.triggers ?? []).some(t => CORRECT.has(t.if) || WRONG.has(t.if))

/** Вариант ответа в «Выбери слово»: choices[ref] = 'opt:<id варианта>' — ученик выбрал именно его (ветка берётся по варианту, а не по «верно/неверно») */
export const optChoice = id => `opt:${id}`
const pickedOption = (n, choice) => (typeof choice === 'string' && choice.startsWith('opt:') ? (n.data?.options ?? []).find(o => o.id === choice.slice(4)) ?? null : null)

/** Правильный ответ задания словами — для пузыря ученика */
export function answerText(n) {
  const d = n.data ?? {}
  if (n.type === 'word_choice') return (d.options ?? []).filter(o => o?.isCorrect).map(o => o.text).join(' / ')
  if (n.type === 'phrase_assembly') return (d.words ?? []).join(' ')
  if (n.type === 'type_word') return d.word ?? ''
  if (n.type === 'say_phrase') return d.phrase ?? ''
  return ''
}

/** Старт урока: нода, в которую никто не ведёт (среди них — с минимальным seq); без таких — первая по seq */
export function findStart(nodes) {
  const targets = new Set(nodes.flatMap(n => (n.triggers ?? []).map(t => t.then)))
  const roots = nodes.filter(n => !targets.has(n.ref))
  const pool = roots.length ? roots : nodes
  return pool.reduce((a, b) => ((a.seq ?? 0) <= (b.seq ?? 0) ? a : b), pool[0])
}

/**
 * Лента: [{ kind: 'node'|'student', ref, node, side, wrongBranch, hasWrong, choice }].
 * kind 'student' — пузырь ответа ученика после задания (верный или ошибочный); wrongBranch — нода лежит в ветке после ошибки.
 */
export function buildTranscript(nodes, choices = {}) {
  if (!nodes?.length) return []
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const out = []
  const seen = new Set()
  let wrongBranch = false
  let rejoin = null // нода, где ветка после ошибки сливается с основным потоком (куда вёл бы верный ответ)
  for (let cur = findStart(nodes); cur && !seen.has(cur.ref) && out.length < MAX_ITEMS; ) {
    seen.add(cur.ref)
    if (wrongBranch && cur.ref === rejoin) wrongBranch = false
    const trig = cur.triggers ?? []
    const wrongT = trig.find(t => WRONG.has(t.if) && t.then)
    const rightT = trig.find(t => CORRECT.has(t.if) && t.then)
    const exercise = isExercise(cur)
    const raw = exercise ? choices[cur.ref] : null
    const picked = pickedOption(cur, raw)
    // Выбран конкретный вариант: верный/неверный — по его isCorrect, а переход — по особому триггеру этого варианта (если он есть)
    const choice = picked ? (picked.isCorrect ? 'right' : 'wrong') : raw === 'wrong' ? 'wrong' : 'right'
    const variantT = picked ? trig.find(t => t.if === picked.id && t.then) : null
    out.push({ kind: 'node', ref: cur.ref, node: cur, wrongBranch, hasWrong: !!wrongT, choice: exercise ? choice : null, picked: picked?.id ?? null })
    let next
    if (exercise) {
      out.push({ kind: 'student', ref: cur.ref, node: cur, ok: choice === 'right', wrongBranch, pickedText: picked?.text ?? null })
      if (variantT) { next = variantT.then; wrongBranch = choice === 'wrong'; rejoin = rightT?.then ?? null }
      else if (choice === 'wrong' && wrongT) { next = wrongT.then; wrongBranch = true; rejoin = rightT?.then ?? null }
      else { next = (rightT ?? trig.find(t => t.then))?.then; wrongBranch = false }
    } else {
      next = trig.find(t => t.then && !WRONG.has(t.if))?.then
    }
    cur = next ? byRef.get(next) : null
  }
  return out
}

/** Замечания линтера, разложенные по нодам: ref → [строки] (ref ищется в тексте замечания целым словом) */
export function warningsByRef(warnings, nodes) {
  const map = new Map()
  for (const n of nodes) {
    const re = new RegExp(`(^|[^\\w-])${n.ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`)
    const hits = warnings.filter(w => re.test(w))
    if (hits.length) map.set(n.ref, hits)
  }
  return map
}
