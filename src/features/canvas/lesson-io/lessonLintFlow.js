// Проверки «ритма» урока (главная формула: каждая нода должна менять ученика — дать новое знание или потребовать нового действия).
// Чистые функции на формате обмена ({ ref, seq, type, data, triggers }), возвращают строки-замечания, как остальные lessonLint*.
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'

const MAX_TEXT_RUN = 2   // больше двух текстовых нод подряд — ученик просто листает, а не учится
const LOOKBACK = 2       // ответ задания не должен стоять дословно в стольких предыдущих нодах
const EXERCISES = new Set(['word_choice', 'phrase_assembly', 'type_word', 'say_phrase', 'fill_blanks'])

const textOf = n => {
  const d = n?.data ?? {}
  if (n?.type === 'audio' && d.showText === false) return '' // расшифровка скрыта: ученик слышит, а не читает — задание «на слух» не тавтология
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

/** Ноды, в которые попадают только через ветку ошибки/пропуска (подсказки «Бывает, смотри ещё раз»): основной поток их не читает */
function wrongOnlySet(nodes) {
  const incoming = new Map()
  for (const m of nodes) for (const t of m.triggers ?? []) if (t.then) incoming.set(t.then, [...(incoming.get(t.then) ?? []), { from: m.ref, wrong: WRONG.test(t.if) }])
  const set = new Set()
  let grew = true
  while (grew) {
    grew = false
    for (const [ref, ins] of incoming) if (!set.has(ref) && ins.every(e => e.wrong || set.has(e.from))) { set.add(ref); grew = true }
  }
  return set
}

const WRONG = /wrong|skip|variant/
const predecessors = (nodes, ref) => nodes.filter(m => (m.triggers ?? []).some(t => t.then === ref && !WRONG.test(t.if)))

/** Цепочки из подряд идущих text-нод длиннее MAX_TEXT_RUN (по основному потоку: триггер → следующая нода) */
function checkTextRuns(nodes) {
  const hint = wrongOnlySet(nodes) // подсказки ветки ошибки — исключение из правила «не больше двух текстов подряд»
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const out = []
  const seen = new Set()
  for (const n of nodes) {
    if (n.type !== 'text' || seen.has(n.ref) || hint.has(n.ref)) continue
    if (predecessors(nodes, n.ref).some(p => p.type === 'text')) continue // идём только от начала цепочки
    const run = []
    let cur = n
    while (cur && cur.type === 'text' && !seen.has(cur.ref) && !hint.has(cur.ref)) {
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
  const hint = wrongOnlySet(nodes)
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
      if (EXERCISES.has(p.type) || hint.has(p.ref)) continue // предыдущее задание и подсказки ветки ошибки — не «пояснение»
      const said = ` ${tokenize(textOf(p)).join(' ')} `
      const hit = answers.find(a => said.includes(` ${a} `))
      if (hit) { out.push(`[R-tautology] ${n.ref} (${n.type}): ответ «${hit}» уже написан в ${p.ref} — задание повторяет сказанное, а не развивает. Дай новую ситуацию/форму или убери ответ из пояснения`); break }
    }
  }
  return out
}

const BASE = h => h.mode === 'text' && String(h.color).toLowerCase() === '#ffffff' && h.opacity === 0.75

/** У каждой ноды с текстом базовый серый highlight (#ffffff, 0.75) покрывает весь текст (если нет — importLesson/редактор покажут текст без подложки) */
function checkBaseHighlight(nodes) {
  const out = []
  // Урок совсем без раскраски (черновик/тестовый набросок) не трогаем: правило про единообразие стиля там не к месту
  if (!nodes.some(n => n.data?.highlights?.length)) return out
  for (const n of nodes) {
    const d = n.data ?? {}
    const text = d.content ?? d.text ?? d.caption
    if (typeof text !== 'string' || !text.length || (n.type === 'audio' && d.showText === false)) continue
    const covered = new Array(text.length).fill(false)
    for (const h of (d.highlights ?? []).filter(BASE)) for (let i = Math.max(0, h.start); i < Math.min(text.length, h.end); i++) covered[i] = true
    if (covered.some(c => !c)) out.push(`[R-base] ${n.ref} (${n.type}): нет базового серого highlight на весь текст — используй разметку {g:..} (она добавит подложку) или добавь {mode:text,color:#ffffff,opacity:0.75}`)
  }
  return out
}

const MAX_SAME = 2 // три одинаковых задания подряд — монотонно
/** Три и больше одинаковых заданий подряд по основному потоку (между ними могут стоять реакции/тексты) */
function checkSameType(nodes) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const targets = new Set(nodes.flatMap(n => (n.triggers ?? []).map(t => t.then)))
  const start = nodes.find(n => !targets.has(n.ref)) ?? nodes[0] // старт — нода, в которую никто не ведёт
  const path = []
  const seen = new Set()
  for (let cur = start; cur && !seen.has(cur.ref); ) {
    seen.add(cur.ref); path.push(cur)
    const next = (cur.triggers ?? []).find(t => t.then && !WRONG.test(t.if))?.then
    cur = next ? byRef.get(next) : null
  }
  const ex = path.filter(n => EXERCISES.has(n.type))
  const out = []
  for (let i = 0; i < ex.length; ) {
    let j = i
    while (j + 1 < ex.length && ex[j + 1].type === ex[i].type) j++
    if (j - i + 1 > MAX_SAME) out.push(`[R-same-type] ${ex.slice(i, j + 1).map(n => n.ref).join(' → ')}: ${j - i + 1} задания «${ex[i].type}» подряд (максимум ${MAX_SAME}) — чередуй типы заданий`)
    i = j + 1
  }
  return out
}

export function checkFlow(nodes) {
  return [...checkTextRuns(nodes), ...checkTautology(nodes), ...checkBaseHighlight(nodes), ...checkSameType(nodes)]
}
