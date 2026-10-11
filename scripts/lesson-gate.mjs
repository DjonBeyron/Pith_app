// Шлюз качества урока: ОДНА команда перед тем, как отдавать урок пользователю.
//   node scripts/lesson-gate.mjs урок.json [--fix-seq]
// Проверяет: JSON читается; импорт редактора без предупреждений; seq совпадает с тем, что посчитает редактор (--fix-seq
// исправляет в файле); линтер правил (lessonLint: формат, ритм R-text-run / R-tautology, say_phrase, ответы…);
// перечисляет, что нужно озвучить/загрузить руками. Выход 0 — чисто, 1 — есть что исправить.
import { readFileSync, writeFileSync } from 'node:fs'
const store = new Map()
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
const { importLesson } = await import('../src/features/canvas/lesson-io/importLesson.js')
const { lintLesson } = await import('../src/features/canvas/lesson-io/lessonLint.js')

const [path, flag] = process.argv.slice(2)
if (!path) { console.error('Использование: node scripts/lesson-gate.mjs урок.json [--fix-seq]'); process.exit(1) }
let json
try { json = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { console.error('❌ JSON не читается:', e.message); process.exit(1) }

const problems = []
const r = importLesson(json)
r.warnings.forEach(w => problems.push(`импорт: ${w}`))
const seqAt = new Map(r.nodes.map(n => [`${n.x},${n.y}`, n.seq]))
let seqDiff = 0
for (const n of json.nodes) { const s = seqAt.get(`${n.pos?.[0]},${n.pos?.[1]}`); if (s != null && s !== n.seq) { seqDiff++; n.seq = s } }
if (seqDiff && flag === '--fix-seq') { writeFileSync(path, JSON.stringify(json, null, 2) + '\n'); console.log(`seq исправлен у ${seqDiff} нод`) }
else if (seqDiff) problems.push(`seq у ${seqDiff} нод не совпадает с редактором — запусти с --fix-seq`)
lintLesson(json.nodes).forEach(w => problems.push(w))

const needs = json.nodes.filter(n => n.needsVoice || n.needs?.length)
console.log(`Нод: ${json.nodes.length}, зон: ${json.zones?.length ?? 0}. Нужно озвучить/загрузить руками: ${needs.length}${needs.length ? ' — ' + needs.map(n => n.ref).join(', ') : ''}`)
if (!problems.length) { console.log('✅ Шлюз пройден: замечаний нет'); process.exit(0) }
console.log(`❌ Замечаний: ${problems.length}\n`)
problems.forEach((p, i) => console.log(`${i + 1}. ${p}`))
process.exit(1)
