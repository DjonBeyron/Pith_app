// Стили печатного документа пакета дизайнера (buildPrintDoc.js): экран — читаемая страница,
// печать — A4, разрывы страниц между разделами, шапка на каждой странице (thead повторяется
// браузером), номера страниц через @page-поля (Chromium ≥ 131; где не поддерживается —
// просто без номеров; шапка — в thead, чтобы была и там). Тёмных фонов нет, схемы — чёрные линии на белом: печатаются на ч/б.
// Классы scd*/scdh*/sc* — те же, что в админке (разметку даёт renderToStaticMarkup).

export const PRINT_CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: "стр. " counter(page); font: 9pt system-ui, sans-serif; color: #666; } }
*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0; color: #111; background: #fff; font: 11.5pt/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.doc { width: 100%; max-width: 820px; margin: 0 auto; border-collapse: collapse; }
.doc > thead td { padding: 0 0 6px; font-size: 9.5pt; color: #666; border-bottom: 1px solid #ccc; }
.doc > tbody td { padding: 0; }
.pageWrap { padding: 12px 16px 40px; }
h1 { font-size: 22pt; margin: 18px 0 6px; }
.lead { color: #444; margin: 0 0 10px; }
.meta { font-size: 10pt; color: #666; margin: 0 0 18px; }
.toc { margin: 0 0 14px; padding-left: 20px; columns: 2; font-size: 10.5pt; }
.toc li { break-inside: avoid; }
.part { break-before: page; page-break-before: always; }
.part:first-of-type { break-before: auto; page-break-before: auto; }
.partH { font-size: 16pt; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 2px solid #111; break-after: avoid; page-break-after: avoid; }
.scdSecs, .scd { display: flex; flex-direction: column; gap: 10px; }
.scdSec, .scdhBody, .block { break-inside: avoid; page-break-inside: avoid; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; }
/* длинные блоки (инструкция, раздел программиста) рвутся между страницами, иначе заголовок части остаётся один внизу */
.scdhBody, .scdDev { break-inside: auto; page-break-inside: auto; }
.scdhSteps li, .scdDevSteps li, .scdDevFiles tr, .scdhCard { break-inside: avoid; page-break-inside: avoid; }
h3, .scdH { break-after: avoid; page-break-after: avoid; }
.scdSec p, .block p { margin: 0 0 6px; }
.scdH, .blockH { margin: 0 0 6px; font-size: 13pt; font-weight: 700; }
.scdhH, .scdDevH { margin: 10px 0 4px; font-size: 12pt; }
.scList, .scdhSteps, .scdDevSteps { margin: 0; padding-left: 20px; }
.scList li, .scdhSteps li, .scdDevSteps li { margin: 0 0 4px; }
.scHint { color: #444; margin: 0 0 6px; font-size: 10.5pt; }
code { font: 10pt ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 0 4px; border: 1px solid #ddd; border-radius: 4px; background: #f6f6f6; }
.scdChips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px; }
.scdReq { font-weight: 700; text-decoration: underline; }
.scdBan { color: #b3261e; }
.scdFig, .scdhFig { display: block; max-width: 100%; height: auto; color: #111; --sc-accent: #b3261e; }
.scdFigs { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.scdFigs .scdFig { flex: 1 1 240px; max-width: 300px; }
.scdFigRow { max-width: 520px; }
.scdPalettes { display: flex; flex-direction: column; gap: 4px; }
.scdPal { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 10pt; }
.scdPalName { width: 60px; font-weight: 700; }
.scdSwatch { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px 1px 3px; border: 1px solid #ccc; border-radius: 999px; font-size: 9.5pt; }
.scdSwatch::before { content: ''; width: 10px; height: 10px; border-radius: 50%; border: 1px solid #999; background: var(--c); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.scdSwatch::after { content: ' ' attr(title); color: #666; font-size: 8.5pt; }
.scdhExport { margin: 4px 0 0; padding-left: 18px; }
.scdhApp { margin: 0; padding: 0; list-style: none; }
.scdhApp li { display: flex; gap: 6px; margin: 0 0 3px; }
.scdhIco { flex: 0 0 20px; text-align: center; }
.scdhPair { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.scdhCard { flex: 1 1 240px; margin: 0; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 10pt; }
.scdhGood { border-left: 3px solid #2e8b57; } .scdhBad { border-left: 3px solid #b3261e; }
.tpl { display: flex; flex-wrap: wrap; gap: 14px; }
.tpl figure { margin: 0; flex: 1 1 200px; max-width: 260px; break-inside: avoid; }
.tpl svg { display: block; width: 100%; height: auto; max-height: 230px; border: 1px dashed #bbb; }
.tpl figcaption { font-size: 10pt; margin-top: 4px; }
.scdDevFiles { border-collapse: collapse; font-size: 10pt; width: 100%; }
.scdDevFiles td { padding: 2px 6px; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
.scdCheckList { margin: 0; padding: 0; list-style: none; }
.scdCheckList li { margin: 0 0 4px; }
.ft { margin-top: 24px; font-size: 9.5pt; color: #666; text-align: center; }
@media screen { body { background: #eee; } .doc { background: #fff; margin: 20px auto; box-shadow: 0 2px 12px rgba(0,0,0,.12); } .printHint { display: block; max-width: 820px; margin: 12px auto 0; padding: 8px 14px; background: #fff8dc; border: 1px solid #e3cf7a; border-radius: 8px; font-size: 10.5pt; } }
@media print { .printHint { display: none; } .doc { max-width: none; } }
`
