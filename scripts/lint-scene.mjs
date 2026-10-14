// Проверка сцены v2 («два кота говорят») без входа в приложение — по образцу
// lint-lesson.mjs: читает JSON сцены и гоняет через sceneLint.js
// (детерминированный код, а не совет модели).
//
// Использование:
//   node scripts/lint-scene.mjs путь/к/сцене.json   — проверить файл
//   node scripts/lint-scene.mjs --demo               — проверить встроенные демо-сцены
//   node scripts/lint-scene.mjs --legend             — напечатать легенду для нейросети
//
// Выход 0 — ошибок нет (предупреждения допускаются), 1 — есть ошибки или
// файл не прочитан. Само-проверка нейросети: сгенерировала JSON → файл →
// этот скрипт → поправила по списку → снова, пока не станет чисто.
import { readFileSync } from 'node:fs'
import { lintScene } from '../src/features/scene/v2/sceneLint.js'
import { sceneNodeBudget, NODE_BUDGET } from '../src/features/scene/v2/sceneBudget.js'
import { DEMO_SCENES } from '../src/features/scene/v2/demoScenes.js'
import { sceneLegendText } from '../src/features/scene/v2/sceneLegend.js'

const arg = process.argv[2]
if (!arg) {
  console.error('Использование: node scripts/lint-scene.mjs путь/к/сцене.json | --demo | --legend')
  process.exit(1)
}

if (arg === '--legend') {
  console.log(sceneLegendText())
  process.exit(0)
}

function report(scene, label) {
  const items = lintScene(scene)
  const errors = items.filter(i => i.level === 'error')
  const warns = items.filter(i => i.level === 'warn')
  const nodes = sceneNodeBudget(scene)
  const head = `${label}: ${scene?.timeline?.length ?? 0} реплик, ${nodes}/${NODE_BUDGET} узлов`
  if (!items.length) { console.log(`✅ ${head} — чисто`); return 0 }
  console.log(`${errors.length ? '❌' : '⚠️'} ${head} — ошибок ${errors.length}, предупреждений ${warns.length}`)
  items.forEach((it, i) => console.log(`  ${i + 1}. [${it.level === 'error' ? 'ошибка' : 'внимание'}] ${it.text}`))
  return errors.length ? 1 : 0
}

if (arg === '--demo') {
  const code = DEMO_SCENES.map(s => report(s, s.title || s.id)).reduce((a, b) => Math.max(a, b), 0)
  process.exit(code)
}

let json
try {
  json = JSON.parse(readFileSync(arg, 'utf8'))
} catch (e) {
  console.error(`Не смог прочитать/разобрать файл: ${e.message}`)
  process.exit(1)
}
process.exit(report(json, json?.title || arg))
