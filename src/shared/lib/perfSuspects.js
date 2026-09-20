// Скан DOM на то, что дорого композитору даже в покое: will-change (свой
// слой GPU на каждый элемент), backdrop-filter и filter (перерисовка того,
// что под/внутри, при любом изменении), 3D-трансформы, mix-blend-mode,
// <canvas> и <video>. Именно это, а не JS, обычно делает дёрганой системную
// анимацию сворачивания iPhone: композитор занят страницей.
//
// Дорого (getComputedStyle на каждый элемент), поэтому вызывается редко —
// раз в ~10с из appPerfProbe.js и только при включённом датчике. Результат —
// одна строка; датчик пишет её в лог только когда она изменилась.
const LIMIT = 5000

function tag(el) {
  const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : ''
  return cls || el.tagName.toLowerCase()
}

// «wc=12(playerAudioBar:8,feedHud:2)» — число и топ-3 классов
function bucket(name, list) {
  if (!list.length) return `${name}=0`
  const by = new Map()
  for (const t of list) by.set(t, (by.get(t) || 0) + 1)
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, n]) => `${k}:${n}`).join(',')
  return `${name}=${list.length}(${top})`
}

export function scanPerfSuspects() {
  const wc = [], bf = [], flt = [], t3d = [], blend = []
  const all = document.body.querySelectorAll('*')
  const n = Math.min(all.length, LIMIT)
  for (let i = 0; i < n; i++) {
    const el = all[i]
    const cs = getComputedStyle(el)
    if (cs.willChange && cs.willChange !== 'auto') wc.push(tag(el))
    const b = cs.backdropFilter || cs.webkitBackdropFilter
    if (b && b !== 'none') bf.push(tag(el))
    if (cs.filter && cs.filter !== 'none') flt.push(tag(el))
    if (cs.transform && cs.transform.startsWith('matrix3d')) t3d.push(tag(el))
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') blend.push(tag(el))
  }
  const canvases = [...document.querySelectorAll('canvas')].map(tag)
  const videos   = [...document.querySelectorAll('video')].map(v => `${tag(v.parentElement ?? v)}${v.paused ? '' : ':playing'}`)
  return [
    `elements=${all.length}${all.length > LIMIT ? '(scan ' + LIMIT + ')' : ''}`,
    bucket('willChange', wc), bucket('backdropFilter', bf), bucket('filter', flt),
    bucket('transform3d', t3d), bucket('blend', blend),
    bucket('canvas', canvases), bucket('video', videos),
  ].join(' ')
}
