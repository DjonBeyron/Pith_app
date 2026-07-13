import { fpsSnapshot } from '../../shared/lib/feedDebug.js'
import { spoilerStats } from './spoilerStats.js'

// Снимок метрик ленты для дебаг-панели. Дампим ВСЕ элементы пула (и в ленте,
// и припаркованные) с их состоянием — по нему видно причины багов возврата
// на вкладку: чёрная лента (virtual ПУСТО / viewH=0), зависшая картинка при
// живом звуке (припаркованный элемент с paused=false, или активный paused=true
// при играющем другом). Жми «Обновить» дважды — если ct не растёт, видео стоит.
export function buildFeedInfo({
  view, len, cycles, viewH, activeIdx, startedIds, modules, visible,
  scrollEl, virtualizer, soundOn, soundGestureRef,
}) {
  const items = virtualizer.getVirtualItems()
  const all = [...document.querySelectorAll('.poolVideo')]
  const dump = all.map(v => {
    const inFeed = !!v.closest('.feedV2Scroll')
    const r = v.getBoundingClientRect()
    const where = inFeed ? `feed top=${r.top.toFixed(0)}` : 'PARKED'
    return `  ${(v.dataset.url || '—').slice(-8)} [${where}] paused=${v.paused} muted=${v.muted} ct=${v.currentTime.toFixed(2)}/${(v.duration || 0).toFixed(1)} rs=${v.readyState} op=${v.style.opacity || '1'}`
  })
  return [
    `fps: ${fpsSnapshot()}`,
    `spoiler: ${spoilerStats()}`,
    `view: ${view}, modules: ${len}, cycles: ${cycles}, viewH: ${viewH}, activeIdx: ${activeIdx}`,
    `started: ${startedIds.size} [${[...startedIds].map(s => String(s).slice(-4)).join(',')}] allModules=${modules?.length ?? 0}`,
    `tabVisible(feed): ${visible && view === 'feed'}  (app visible=${visible})`,
    `scroll: top=${scrollEl ? scrollEl.scrollTop.toFixed(0) : '—'} clientH=${scrollEl?.clientHeight ?? '—'} scrollH=${scrollEl?.scrollHeight ?? '—'}`,
    `virtual(${items.length}): ${items.map(i => `#${i.index}`).join(' ') || 'ПУСТО'}`,
    `sound: soundOn=${soundOn} gesture=${soundGestureRef.current}`,
    `pool videos (${all.length}):`,
    ...dump,
  ].join('\n')
}
