// Стили автономного HTML-проверщика (свои, без зависимостей). Анимации кота НЕ здесь —
// они берутся из scene-v2-cat.css приложения как строка (buildCheckerHtml.js), чтобы
// предпросмотр совпадал с приложением. Светлая страница, тёмный фон сцены — по чекбоксу.

export const CHECKER_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2430; background: #f3f5f8; }
.hd { padding: 20px 16px 8px; max-width: 980px; margin: 0 auto; }
.hd h1 { margin: 0 0 6px; font-size: 22px; }
.sub { margin: 0; color: #5b6472; }
.wrap { max-width: 980px; margin: 0 auto; padding: 8px 16px 32px; display: flex; flex-direction: column; gap: 12px; }
.card { background: #fff; border: 1px solid #dde3ea; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.card h2 { margin: 0; font-size: 16px; display: flex; align-items: center; gap: 6px; }
.card[hidden] { display: none; }
.row, .ctl { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.ctl[hidden] { display: none; }
.seg { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.seg[data-label]::before { content: attr(data-label) ":"; font-size: 12px; color: #5b6472; margin-right: 4px; font-weight: 600; }
.seg button { padding: 5px 10px; border: 1px solid #cfd6df; border-radius: 999px; background: #fff; color: #5b6472; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.seg button[aria-checked="true"], .seg button.on { background: #e0564e; border-color: #e0564e; color: #fff; }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1px solid #cfd6df; border-radius: 10px; background: #fff; color: #1f2430; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.btn:hover { border-color: #8a94a3; }
.file { position: relative; overflow: hidden; }
.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.muted { color: #5b6472; } .small { font-size: 12px; margin: 0; }
textarea { width: 100%; min-height: 120px; padding: 8px 10px; border: 1px solid #cfd6df; border-radius: 10px; font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; background: #fafbfc; }
textarea.over { border-color: #e0564e; background: #fff3f2; }
.q { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; border: 1px solid #cfd6df; color: #5b6472; font-size: 11px; font-weight: 700; cursor: help; position: relative; vertical-align: middle; }
.q:hover::after, .q:focus::after { content: attr(data-tip); position: absolute; left: 50%; top: 24px; transform: translateX(-50%); width: min(320px, 80vw); padding: 8px 10px; border-radius: 10px; background: #1f2430; color: #fff; font-size: 12px; font-weight: 400; line-height: 1.4; z-index: 10; white-space: normal; text-align: left; }
.verdict { margin: 0; font-size: 16px; font-weight: 700; }
.verdict.ok { color: #2e8b57; } .verdict.bad { color: #d6453d; }
.budget { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #5b6472; }
.bar { flex: 0 0 220px; height: 10px; border-radius: 999px; background: #e6eaf0; overflow: hidden; }
.fill { height: 100%; width: 0; background: #3aa56a; transition: width .2s; }
.fill.warn { background: #e0a526; } .fill.over { background: #d6453d; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; }
.chips:empty { display: none; }
.chips .lbl { color: #5b6472; margin-right: 4px; }
code, .chip { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 1px 6px; border-radius: 6px; background: #eef1f5; }
.chip.miss { background: #fde3e1; color: #b3261e; text-decoration: line-through; }
.chip.ok { background: #e3f5ea; color: #1f6b3a; }
.problems { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 8px; }
.problems:empty { display: none; }
.problems li b { color: #d6453d; }
.problems .fix { display: block; color: #3b4452; font-size: 13px; margin-top: 2px; }
.problems .fix::before { content: "Как исправить: "; font-weight: 700; color: #1f2430; }
.chk { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; cursor: pointer; }
.rng { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
.rng input { width: 110px; }
.stage-wrap { display: flex; justify-content: center; padding: 12px; background: #e8eef5; border-radius: 12px; overflow: auto; }
.stage { width: 200px; aspect-ratio: auto; background: transparent; overflow: visible; contain: none; }
.stage.dark { color-scheme: dark; }
.stage-wrap.dark { background: #1b2130; }
.stage svg { display: block; width: 100%; height: auto; }
.stage .prop-scene { border-radius: 10px; }
.tips ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.ft { text-align: center; color: #8a94a3; font-size: 12px; padding: 0 16px 24px; }
[data-emotion] { display: none; }
`
