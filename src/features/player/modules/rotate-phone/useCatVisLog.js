import { useEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

// Диагностика «Пит пропадает» (слабый Android, журнал 26.11): ОДНА строка «[cat-vis] …» на смену стадии — есть ли узел Пита, его opacity / visibility, transform и translate головы, где он на экране.
// Только при отладочном интерфейсе (on), через 450 мс после смены стадии (не в кадре ответа и не на входе стадии), getComputedStyle — один раз на стадию. Под коробкой Мии (visibility: hidden у .wlCat — так задумано)
// строка так и пишет «под коробкой», остальное «hidden / opacity 0 / вне экрана» — это и есть пропажа.
export const CAT_VIS_DELAY_MS = 450

/** root — корень игры (.wl) → строка журнала про Пита; getCS подменяется в тестах */
export function catVisLine(root, sid, getCS = el => globalThis.getComputedStyle(el)) {
  const cat = root?.querySelector?.('.wlCat')
  if (!cat) return `[cat-vis] стадия ${sid ?? '—'}: узла Пита нет`
  const svg = cat.querySelector('.wlCatSvg'), cs = getCS(cat), ss = svg ? getCS(svg) : null, r = (svg ?? cat).getBoundingClientRect()
  const view = globalThis.innerHeight || 800
  const where = r.width === 0 ? 'нулевой размер' : r.top >= view - 40 ? 'за нижним краем (нырнул)' : r.bottom <= 0 ? 'за верхним краем' : 'на экране'
  const box = cat.style.visibility === 'hidden' ? ', под коробкой Мии' : ''
  return `[cat-vis] стадия ${sid ?? '—'}: узел есть, opacity ${cs.opacity}/${ss?.opacity ?? '—'}, visibility ${cs.visibility}, transform ${ss?.transform ?? '—'}, translate ${ss?.translate ?? '—'}, ${where} (top ${Math.round(r.top)}, left ${Math.round(r.left)})${box}; dodge ${cat.dataset.dodge ?? '—'}, ${cat.classList.contains('wlCat--up') ? 'поднят' : 'опущен'}, пауза ${root.hasAttribute('data-paused') ? 'да' : 'нет'}`
}

export function useCatVisLog(rootRef, on, sid) {
  useEffect(() => {
    if (!on || !sid) return undefined
    const t = setTimeout(() => { try { pLog(catVisLine(rootRef.current, sid)) } catch { /* диагностика игре не мешает */ } }, CAT_VIS_DELAY_MS)
    return () => clearTimeout(t)
  }, [rootRef, on, sid])
}
