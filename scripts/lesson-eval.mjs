// Калибровка ИИ-судьи по известным нарушениям (PROJECT.md «Разбор как цикл оценки», шаг D). Из примеров правил судьи («нельзя» = должен
// поймать, «можно» = не должен) собирается проверочный урок группы, судья прогоняется по нему (агент pithy-lesson-judge), ответ
// сверяется: поймал / пропустил / ложно сработал. Правило, которое судья стабильно не ловит, — кандидат на переформулировку или линтер.
//   node scripts/lesson-eval.mjs --build "Тон и общение"            → lesson-drafts/eval/<slug>.json + <slug>.expected.json (+ промпт судьи)
//   node scripts/lesson-eval.mjs --score "Тон и общение" answer.json → таблица по правилам, recall / precision
//   node scripts/lesson-eval.mjs --groups                            → группы судьи
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadRules } from './lesson-rules.mjs'
import { buildJudgePrompt, judgeGroups, rulesForGroup, parseVerdict } from '../src/features/canvas/lesson-io/judgePrompt.js'
import { exampleNodes } from '../src/features/canvas/lesson-io/exampleNodes.js'
import { ruleTitle } from '../src/features/canvas/lesson-io/ruleMeta.js'

const DIR = fileURLToPath(new URL('../lesson-drafts/eval/', import.meta.url))
const slug = g => g.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '')
const { rules } = loadRules()
const [mode, group, answerPath] = process.argv.slice(2)

/** Проверочный урок группы: на каждое правило Rk — ноды из «нельзя» (bk-…) и «можно» (gk-…), подряд одной цепочкой */
export function buildEval(rules, group) {
  const scoped = rulesForGroup(rules, group).filter(r => r.active)
  const nodes = [], expected = []
  let seq = 1
  scoped.forEach((r, i) => {
    const n = i + 1
    const bad = exampleNodes(r.bad, { prefix: `b${n}-`, seq0: seq }); seq += bad.length
    const good = exampleNodes(r.good, { prefix: `g${n}-`, seq0: seq }); seq += good.length
    nodes.push(...bad, ...good)
    expected.push({ rule: `R${n}`, title: ruleTitle(r), badRefs: bad.map(x => x.ref), goodRefs: good.map(x => x.ref) })
  })
  for (let i = 0; i + 1 < nodes.length; i++) if (!nodes[i].triggers.length) nodes[i].triggers = [{ if: 'timer', then: nodes[i + 1].ref }]
  return { lesson: { format: 'pithy-lesson', lesson: { title: `eval: ${group}` }, nodes }, expected: { group, rules: expected } }
}

/** Сверка ответа судьи с ожиданием → строки таблицы и итог */
export function score(expected, answer) {
  const { violations, ok, error } = parseVerdict(answer)
  if (!ok) return { error, rows: [], caught: 0, missed: 0, falseAlarms: 0 }
  const rows = expected.rules.map(e => {
    const mine = violations.filter(v => v.rule === e.rule)
    const nodes = mine.flatMap(v => v.nodes ?? [])
    const hitBad = nodes.some(n => e.badRefs.includes(n)) || (mine.length > 0 && nodes.length === 0)
    const hitGood = nodes.some(n => e.goodRefs.includes(n))
    const caught = e.badRefs.length ? hitBad : null
    return { rule: e.rule, title: e.title, caught, falseAlarm: hitGood, nodes }
  })
  return { rows, caught: rows.filter(r => r.caught === true).length, missed: rows.filter(r => r.caught === false).length, falseAlarms: rows.filter(r => r.falseAlarm).length }
}

if (mode === '--groups') {
  judgeGroups(rules).forEach(g => console.log(g))
} else if (mode === '--build') {
  if (!judgeGroups(rules).includes(group)) { console.error(`Нет такой группы. Есть: ${judgeGroups(rules).join(' | ')}`); process.exit(1) }
  mkdirSync(DIR, { recursive: true })
  const { lesson, expected } = buildEval(rules, group)
  const base = DIR + slug(group)
  writeFileSync(`${base}.json`, JSON.stringify(lesson, null, 2) + '\n')
  writeFileSync(`${base}.expected.json`, JSON.stringify(expected, null, 2) + '\n')
  writeFileSync(`${base}.prompt.txt`, buildJudgePrompt(rules, JSON.stringify(lesson), { group }))
  console.log(`Урок: ${base}.json (${lesson.nodes.length} нод, ${expected.rules.length} правил)\nОжидание: ${base}.expected.json\nПромпт судьи: ${base}.prompt.txt`)
} else if (mode === '--score') {
  const base = DIR + slug(group)
  if (!existsSync(`${base}.expected.json`)) { console.error(`Сначала --build "${group}"`); process.exit(1) }
  const res = score(JSON.parse(readFileSync(`${base}.expected.json`, 'utf8')), readFileSync(answerPath, 'utf8'))
  if (res.error) { console.error(`Ответ судьи не разобрался: ${res.error}`); process.exit(1) }
  for (const r of res.rows) console.log(`${r.caught === true ? '✅ поймал ' : r.caught === false ? '❌ пропустил' : '—  нет «нельзя»'}${r.falseAlarm ? ' ⚠️ ложно на «можно»' : ''}  ${r.rule} ${r.title}${r.nodes.length ? `  [${r.nodes.join(', ')}]` : ''}`)
  const total = res.caught + res.missed
  console.log(`\nПоймал ${res.caught} из ${total} (recall ${total ? Math.round(100 * res.caught / total) : 0}%), ложных срабатываний на «можно»: ${res.falseAlarms}`)
}
