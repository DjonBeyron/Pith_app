import { TEMPLATE_FILES } from '../designerTemplates.js'
import { PACK_FILES } from './packConsts.js'
import { APP_VERSION } from '../../../../shared/lib/version.js'

// «Скачать все шаблоны» одним файлом: zip без библиотеки не собрать, поэтому — один
// автономный HTML с вкладками: у каждого шаблона превью, описание и кнопка «Скачать .svg»
// (Blob + <a download>, работает офлайн). SVG лежат в <script type="text/plain"> — браузер
// не разбирает их как разметку, скрипт берёт текст как есть.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const NOTES = {
  cat: 'Кот 200×240: все группы data-part и три формы рта. Кошка — тот же шаблон, файл cat-female.svg.',
  prop: 'Напольный / настольный предмет: точка (0,0) — нижняя середина, рисунок уходит вверх (в минус по y).',
  'prop-wall': 'Настенный предмет: точка (0,0) — центр, предмет висит на ней.',
}

export function buildTemplatesPack() {
  const tabs = TEMPLATE_FILES.map((t, i) => `<button type="button" class="tab${i === 0 ? ' on' : ''}" data-tab="${t.id}">${esc(t.title)}</button>`).join('')
  const panes = TEMPLATE_FILES.map((t, i) => `
<section class="pane" id="pane-${t.id}"${i === 0 ? '' : ' hidden'}>
  <p class="note">${esc(NOTES[t.id] ?? '')} Откройте файл в Figma / Illustrator / Inkscape, рисуйте внутри групп, пунктирный контур удалите, группы и viewBox не меняйте.</p>
  <div class="prev">${t.make()}</div>
  <p><button type="button" class="dl" data-id="${t.id}" data-file="${esc(t.file)}">Скачать ${esc(t.file)}</button></p>
  <script type="text/plain" id="svg-${t.id}">${t.make().replace(/<\/script/gi, '<\\/script')}</script>
</section>`).join('')
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Шаблоны SVG для Pithy</title>
<style>
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 20px 16px; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2430; background: #f3f5f8; }
.wrap { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
h1 { margin: 0; font-size: 22px; }
.sub { margin: 0; color: #5b6472; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.tab { padding: 7px 12px; border: 1px solid #cfd6df; border-radius: 10px; background: #fff; font: inherit; font-weight: 600; color: #5b6472; cursor: pointer; }
.tab.on { background: #e0564e; border-color: #e0564e; color: #fff; }
.pane { background: #fff; border: 1px solid #dde3ea; border-radius: 14px; padding: 14px 16px; }
.pane[hidden] { display: none; }
.note { margin: 0 0 10px; color: #5b6472; }
.prev { display: flex; justify-content: center; padding: 12px; background: #e8eef5; border-radius: 10px; }
.prev svg { max-width: 100%; height: auto; max-height: 300px; }
.dl { padding: 9px 14px; border: 0; border-radius: 10px; background: #1f2430; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.all { align-self: flex-start; }
.ft { color: #8a94a3; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Шаблоны SVG для Pithy</h1>
  <p class="sub">Три шаблона: кот, напольный предмет, настенный предмет. Выберите вкладку и нажмите «Скачать» — файл сохранится на диск. Кнопка «Скачать все» сохранит три файла подряд (браузер может спросить разрешение на несколько загрузок).</p>
  <div class="tabs">${tabs}</div>
  ${panes}
  <p><button type="button" class="dl all" id="all">Скачать все (${TEMPLATE_FILES.length} файла)</button></p>
  <p class="ft">Pithy · пакет для дизайнера · шаблоны · v${APP_VERSION}</p>
</div>
<script>
function save(id, file) {
  var text = document.getElementById('svg-' + id).textContent.trim()
  var url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }))
  var a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
}
document.querySelectorAll('.tab').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('on', x === b) })
    document.querySelectorAll('.pane').forEach(function (p) { p.hidden = p.id !== 'pane-' + b.getAttribute('data-tab') })
  })
})
document.querySelectorAll('.dl[data-id]').forEach(function (b) { b.addEventListener('click', function () { save(b.getAttribute('data-id'), b.getAttribute('data-file')) }) })
document.getElementById('all').addEventListener('click', function () {
  var bs = document.querySelectorAll('.dl[data-id]')
  bs.forEach(function (b, i) { setTimeout(function () { save(b.getAttribute('data-id'), b.getAttribute('data-file')) }, i * 400) })
})
</script>
</body>
</html>
`
}

export const TEMPLATES_FILE = PACK_FILES.templates
