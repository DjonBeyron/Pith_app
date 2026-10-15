import spriteCheckSrc from '../../../scene/v2/spriteCheck.js?raw'
import catCss from '../../../scene/v2/scene-v2-cat.css?raw'
import fixHintsSrc from './fixHints.js?raw'
import { packConstants, PACK_FILES } from './packConsts.js'
import { checkerBody } from './checkerMarkup.js'
import { CHECKER_CSS } from './checkerStyles.js'
import { CHECKER_JS_REPORT } from './checkerScriptReport.js'
import { CHECKER_JS_PREVIEW } from './checkerScriptPreview.js'
import { catTemplateSvg } from '../designerTemplates.js'
import { banWords } from '../designerHowToTexts.js'

// Сборка автономного HTML-проверщика для дизайнера (один файл, без сети, ≤ ~60 КБ).
// Проверка — НЕ копия, а сам исходник spriteCheck.js (импорт ?raw, убраны export): вердикт
// в файле и в приложении совпадает по построению, buildCheckerHtml.test.js это сверяет,
// прогоняя одни и те же SVG через обе проверки. Анимации — scene-v2-cat.css как строка.

// ESM-исходник → обычный скрипт: `export const X` → `var X`, `export function` → `function`
export function stripExports(src) {
  return src.replace(/^export\s+(const|let|var)\s+/gm, 'var ').replace(/^export\s+function\s+/gm, 'function ')
}

// Безопасная вставка JSON в <script>: «</» не должно собрать закрывающий тег
const jsonForScript = obj => JSON.stringify(obj).replace(/</g, '\\u003c')

// Скрипт-ядро без DOM: константы + проверка + подсказки. Тест исполняет его в node
export function checkerCoreScript() {
  return `var C = ${jsonForScript(packConstants())};\n${stripExports(spriteCheckSrc)}\n${stripExports(fixHintsSrc)}`
}

function fill(markup, c) {
  const K = c.SPRITE_KINDS
  const vals = {
    version: c.version,
    catMax: K.cat.maxNodes, propMax: K.prop.maxNodes, bgMax: K.background.maxNodes, budget: c.NODE_BUDGET,
    catVb: c.CAT_VIEWBOX, bgVb: c.SCENE_VIEWBOX, propMaxW: K.prop.maxW, propMaxH: K.prop.maxH,
    catParts: K.cat.requiredParts.join(', '), visemes: K.cat.requiredVisemes.join(', '),
    mouthMs: c.MOUTH_STEP_MS, mouthCycle: c.MOUTH_CYCLE.join(' → '),
    // слова вроде «блоки <style>» и «клоны <use>» — экранируем, иначе <style> откроет настоящий тег
    banWords: banWords().join(', ').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    slotButtons: c.PREVIEW_SLOTS.map((s, i) => `<button type="button" data-slot="${s.id}"${i === 0 ? ' class="on"' : ''}>${s.label}</button>`).join(''),
  }
  return markup.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vals ? String(vals[k]) : `{{${k}}}`))
}

export function buildCheckerHtml() {
  const c = packConstants()
  // Пример-шаблон кота лежит в <script type="text/plain"> — браузер его не разбирает как разметку
  const demo = catTemplateSvg().replace(/<\/script/gi, '<\\/script')
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Проверка SVG для Pithy</title>
<style>${CHECKER_CSS}</style>
<style>/* анимации кота — scene-v2-cat.css приложения, как есть */
${catCss}</style>
</head>
<body>
${fill(checkerBody(), c)}
<script type="text/plain" id="demo-cat">${demo}</script>
<script>
${checkerCoreScript()}
${CHECKER_JS_REPORT}
${CHECKER_JS_PREVIEW}
</script>
</body>
</html>
`
}

export const CHECKER_FILE = PACK_FILES.checker
