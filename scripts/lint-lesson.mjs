// Проверка урока по правилам легенды — без входа в приложение и без
// админки: читает готовый JSON-экспорт урока (тот же формат, что отдаёт
// LessonIoPanel.jsx / что нейросеть пишет как готовый урок) и гоняет его
// через lessonLint.js — детерминированный код, не совет модели. Пункт либо
// нарушен, либо нет; ни один не «забывается» от того, как урок писали.
//
// Использование:
//   node scripts/lint-lesson.mjs путь/к/уроку.json
//
// Выход 0 — замечаний нет, выход 1 — есть (или ошибка чтения/разбора файла).
// Само-проверка нейросети: сгенерировал урок → сохранил в файл → прогнал
// этот скрипт → поправил по списку → прогнал снова, пока не станет чисто.
import { readFileSync } from 'node:fs'
import { lintLesson } from '../src/features/canvas/lesson-io/lessonLint.js'

const path = process.argv[2]
if (!path) {
  console.error('Использование: node scripts/lint-lesson.mjs путь/к/уроку.json')
  process.exit(1)
}

let json
try {
  json = JSON.parse(readFileSync(path, 'utf8'))
} catch (e) {
  console.error(`Не смог прочитать/разобрать файл: ${e.message}`)
  process.exit(1)
}

const nodes = json.nodes
if (!Array.isArray(nodes) || !nodes.length) {
  console.error('В файле нет массива nodes — это не экспорт урока Pithy')
  process.exit(1)
}

const warnings = lintLesson(nodes)

if (!warnings.length) {
  console.log(`✅ Чисто — ${nodes.length} нод, нарушений не найдено`)
  process.exit(0)
}

console.log(`❌ Найдено ${warnings.length} нарушени${warnings.length === 1 ? 'е' : 'й'} (${nodes.length} нод):\n`)
warnings.forEach((w, i) => console.log(`${i + 1}. ${w}`))
process.exit(1)
