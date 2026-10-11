// Проверки «ритма» урока (главная формула: каждая нода должна менять ученика — дать новое знание или потребовать нового действия).
// Чистые функции на формате обмена ({ ref, seq, type, data, triggers }), возвращают строки-замечания, как остальные lessonLint*.
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'

const MAX_TEXT_RUN = 2   // больше двух текстовых нод подряд — ученик просто листает, а не учится
const LOOKBACK = 2       // ответ задания не должен стоять дословно в стольких предыдущих нодах
const EXERCISES = new Set(['word_choice', 'phrase_assembly', 'type_word', 'say_phrase', 'fill_blanks'])

const textOf = n => {
  const d = n?.data ?? {}
  return String(d.content ?? d.text ?? d.caption ?? '')
}

/** Правильные ответы задания в виде строк (нужны, чтобы понять, не лежит ли ответ уже в предыдущем сообщении) */
export function answersOf(n) {
  const d = n.data ?? {}
  if (n.type === 'word_choice') return (d.options ?? []).filter(o => o?.isCorrect).map(o => o.text)
  if (n.type === 'phrase_assembly') return [(d.words ?? []).join(' '), ...(d.answers ?? []).map(a => (Array.isArray(a) ? a.join(' ') : String(a)))]
  if (n.type === 'type_word') return [d.word]
  if (n.type === 'say_phrase') return [d.phrase]
  return []
}

const predecessors = (nodes, ref) => nodes.filter(m => (m.triggers ?? []).some(t => t.then === ref && !/wrong|skip|variant/.test(t.if)))

/** Цепочки из подряд идущих text-нод длиннее MAX_TEXT_RUN (по основному потоку: триггер → следующая нода) */
function checkTextRuns(nodes) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const out = []
  const seen = new Set()
  for (const n of nodes) {
    if (n.type !== 'text' || seen.has(n.ref)) continue
    if (predecessors(nodes, n.ref).some(p => p.type === 'text')) continue // идём только от начала цепочки
    const run = []
    let cur = n
    while (cur && cur.type === 'text' && !seen.has(cur.ref)) {
      run.push(cur); seen.add(cur.ref)
      const nextRef = (cur.triggers ?? []).find(t => t.then && !/wrong|skip|variant/.test(t.if))?.then
      cur = nextRef ? byRef.get(nextRef) : null
    }
    if (run.length > MAX_TEXT_RUN) out.push(`[R-text-run] ${run.map(r => r.ref).join(' → ')}: ${run.length} текстовых нод подряд (максимум ${MAX_TEXT_RUN}) — объедини или вставь действие ученика`)
  }
  return out
}

/** Тавтология: ответ задания дословно уже прозвучал в предыдущих нодах — ученик перепечатывает, а не думает */
function checkTautology(nodes) {
  const out = []
  for (const n of nodes) {
    if (!EXERCISES.has(n.type)) continue
    const answers = answersOf(n).map(a => tokenize(a ?? '').join(' ')).filter(Boolean)
    if (!answers.length) continue
    let layer = predecessors(nodes, n.ref)
    const near = []
    for (let step = 0; step < LOOKBACK && layer.length; step++) {
      near.push(...layer)
      layer = layer.flatMap(p => predecessors(nodes, p.ref))
    }
    for (const p of near) {
      if (EXERCISES.has(p.type)) continue // предыдущее задание — не «подсказка»
      const said = ` ${tokenize(textOf(p)).join(' ')} `
      const hit = answers.find(a => said.includes(` ${a} `))
      if (hit) { out.push(`[R-tautology] ${n.ref} (${n.type}): ответ «${hit}» уже написан в ${p.ref} — задание повторяет сказанное, а не развивает. Дай новую ситуацию/форму или убери ответ из пояснения`); break }
    }
  }
  return out
}

export function checkFlow(nodes) {
  return [...checkTextRuns(nodes), ...checkTautology(nodes)]
}
