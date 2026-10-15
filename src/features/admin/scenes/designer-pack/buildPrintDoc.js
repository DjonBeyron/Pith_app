import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import DesignerSections from '../DesignerSections.jsx'
import { DesignerHowToBody } from '../DesignerHowTo.jsx'
import DesignerDevSection from './DesignerDevSection.jsx'
import { PRINT_CSS } from './printStyles.js'
import { packConstants, PACK_FILES } from './packConsts.js'
import { DOC_TITLE, titleBlock, templatesBlock, checkBlock, footer } from './printDocParts.js'

// Печатный документ пакета дизайнера — один самодостаточный HTML (всё inline: стили, схемы,
// шаблоны). Разделы админки («Инструкция», спецификация 1–8, «Для программиста») отдаются
// через renderToStaticMarkup тех же React-компонентов в режиме print (без «?») — текст в PDF
// и на экране один и тот же. Открывается в iframe → window.print() («Сохранить как PDF»)
// или скачивается как .html (DesignerPackButtons). Импортируется лениво: react-dom/server
// не нужен основному бандлу.

const r = (Comp, props = {}) => renderToStaticMarkup(createElement(Comp, props))

const dateText = d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

export function buildPrintDoc({ date = new Date() } = {}) {
  const c = packConstants()
  const body = [
    titleBlock(c, dateText(date)),
    `<section class="part" id="p-how"><h2 class="partH">Как работать</h2>${r(DesignerHowToBody, { id: 'howto' })}</section>`,
    `<section class="part" id="p-spec"><h2 class="partH">Спецификация</h2>${r(DesignerSections, { print: true })}</section>`,
    templatesBlock(),
    checkBlock(c),
    `<section class="part" id="p-dev"><h2 class="partH">Для программиста / админа</h2><p class="scHint">Этот раздел — для того, кто добавляет присланный файл в приложение. Дизайнеру читать не обязательно.</p>${r(DesignerDevSection, { print: true })}</section>`,
    footer(c),
  ].join('\n')
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${DOC_TITLE}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<p class="printHint">Чтобы получить PDF: Ctrl+P / ⌘P → принтер «Сохранить как PDF» (Save as PDF), формат A4, «Фоновая графика» включена для цветных образцов палитры.</p>
<table class="doc">
<thead><tr><td>Pithy · спецификация спрайтов для дизайнера · v${c.version}</td></tr></thead>
<tbody><tr><td><div class="pageWrap">
${body}
</div></td></tr></tbody>
</table>
</body>
</html>
`
}

export const DOC_FILE = PACK_FILES.doc
