// Добавка стенда для замеров производительности (?perf=1, _stand/race/perf-run.mjs): журнал игры зеркалится в window.__log (драйвер читает его без console.log — зеркало в консоль само стоит времени);
// ?probe=1 — датчик «[perf]» включён, как у владельца с отладочным интерфейсом; ?under=1 — под игрой лежит подобие приложения: лента на ~3500 элементов, 3 видео на паузе и нижняя панель
// с бесконечными анимациями «Памяти» (navDuePulse / navDueGlow, настоящие классы оболочки) — то, что у владельца живёт под оверлеем игры, когда она запущена из админки.
import { gameJournal } from '/src/shared/lib/gameJournal.js'
import { startPerfProbe } from '/src/shared/lib/appPerfProbe.js'

export function setupPerf(params) {
  window.__log = []; window.__logN = 0
  const add = gameJournal.add
  gameJournal.add = (...a) => { window.__logN++; if (typeof a[0] === 'string') window.__log.push([Math.round(performance.now() * 10) / 10, a.length === 1 ? a[0] : a.join(' ')]); return add(...a) }
  if (params.get('probe') === '1') startPerfProbe()
  if (params.get('under') === '1') {
    const shell = document.createElement('div'); shell.className = 'shellV2'; shell.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;z-index:1;background:#0e1013'
    const content = document.createElement('div'); content.className = 'shellV2Content'; content.style.cssText = 'flex:1;overflow:auto'
    let html = ''
    for (let i = 0; i < 500; i++) html += `<div class="row" style="padding:8px 12px;border-bottom:1px solid #222"><div><b>Урок ${i}</b> <span>слова</span> <i>фраза</i></div><p style="margin:2px 0"><span>повторить</span> <em>сегодня</em></p></div>` // 7 элементов на строку → 3500
    content.innerHTML = html
    for (let i = 0; i < 3; i++) { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'none'; v.style.cssText = 'width:120px;height:68px;background:#111'; content.prepend(v) }
    const nav = document.createElement('nav'); nav.className = 'shellV2Nav'; nav.style.cssText = 'display:flex;justify-content:space-around;padding:8px'
    nav.innerHTML = '<button class="shellV2NavBtn">Лента</button><button class="shellV2NavBtn shellV2NavBtnDue"><svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><button class="shellV2NavBtn">Профиль</button>'
    shell.append(content, nav); document.body.append(shell)
    document.getElementById('root').style.cssText = 'position:relative;z-index:2' // карточка запуска игры остаётся поверх подобия приложения
  }
}
