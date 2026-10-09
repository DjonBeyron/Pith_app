import { fmtT, replaySamples } from './startLogEvents.js'

// Подозрения по полям семплера, которые следят за РАСКЛАДКОЙ: safe-area, окно, нижняя панель, лента, видео, слои под экраном.
// Вызывается из analyzeStartLog. «После первого кадра» = любой семпл, кроме самого первого. Прыжок под непрозрачным
// сплэшем не виден пользователю — но всё равно помечается (с пометкой «не видно»), чтобы увидеть, КОГДА iOS меняет значения.
const has = v => v !== undefined && v !== '-'
const num = v => (v === undefined || v === '-' ? null : parseFloat(v))
const RECTS = { nv: 'нижняя панель nav.shellV2Nav', fe: 'лента .feedV2', fw: 'лента .feedSwiper', r0: '#root > первый элемент', vr: 'видео ленты' }
const VIEWS = { iw: 'window.innerWidth×Height', ch: 'documentElement.clientHeight', fh: 'высота fixed-области', vv: 'visualViewport (w×h@offsetTop)' }
const COLORS = ['eo', 'k1', 'k2', 'k3', 'k4']
const rectOnly = v => String(v).split('/')[0]
const selOnly = v => String(v).split('/')[0]

// Что видел пользователь в этот момент: сплэш непрозрачен / растворяется / уже ушёл
function phase(state) {
  const so = num(state.so)
  if (so === null) return 'после ухода сплэша — ВИДНО'
  return so < 1 ? 'в растворении сплэша — ВИДНО' : 'под непрозрачным сплэшем — не видно'
}

export function layoutSuspects(ev, add) {
  const cnt = {}
  const once = code => (cnt[code] = (cnt[code] || 0) + 1) <= 8 // не больше 8 одинаковых подозрений на старт
  replaySamples(ev).forEach(({ t, state, changed, prev }, i) => {
    if (i === 0) return
    const ph = phase(state), seen = !/не видно/.test(ph), at = `t=${fmtT(t)}ms`
    if (has(prev.sa) && changed.sa !== undefined && once('safe-area')) add('warn', t, 'safe-area', `safe-area-inset (t/r/b/l) изменился ${at}: ${prev.sa} -> ${changed.sa}; ${ph}`)
    for (const [k, name] of Object.entries(RECTS)) {
      if (has(prev[k]) && has(changed[k]) && rectOnly(prev[k]) !== rectOnly(changed[k]) && once('rect-' + k)) add('warn', t, 'rect-' + k, `${name}: рамка x,y,w×h изменилась ${at}: ${rectOnly(prev[k])} -> ${rectOnly(changed[k])}; ${ph}`)
    }
    if (has(prev.nv) && has(changed.nv) && rectOnly(prev.nv) === rectOnly(changed.nv) && once('nav-pos')) add('warn', t, 'nav-pos', `нижняя панель: position ${prev.nv.split('/')[1]} -> ${changed.nv.split('/')[1]} ${at}`)
    for (const [k, name] of Object.entries(VIEWS)) {
      if (has(prev[k]) && has(changed[k]) && once('view-' + k)) add('warn', t, 'view-' + k, `${name} изменилось ${at}: ${prev[k]} -> ${changed[k]}; ${ph}`)
    }
    if (changed.sy !== undefined && changed.sy !== '0/0/0' && once('scroll')) add('warn', t, 'scroll', `страница прокручена ${at}: scrollY/body/html = ${changed.sy} (iOS иногда сдвигает окно)`)
    if (has(prev.eu) && has(changed.eu) && selOnly(prev.eu) !== selOnly(changed.eu) && once('layer')) add(seen ? 'warn' : 'info', t, 'layer', `под центром экрана (без сплэша) сменился элемент ${at}: ${selOnly(prev.eu)} -> ${selOnly(changed.eu)}; ${ph}`)
    if (has(prev.ep) && has(changed.ep) && prev.ep !== 'splash' && once('layer-top')) add('warn', t, 'layer-top', `верхний слой в центре сменился ${at} не из-за сплэша: ${prev.ep} -> ${changed.ep}`)
    if (!seen) return
    for (const k of COLORS) {
      if (has(prev[k]) && has(changed[k]) && once('under-' + k)) add('warn', t, 'under-color', `слой/цвет под сплэшем (${k}) изменился ${at}: ${prev[k]} -> ${changed[k]}; ${ph}`)
    }
    const a = num(prev.vo), b = num(changed.vo)
    if (a !== null && b !== null && Math.abs(b - a) > 0.5 && once('video-opacity')) add('warn', t, 'video-opacity', `прозрачность видео ленты скакнула ${a} -> ${b} ${at}; ${ph}`)
    if (has(prev.ps) && changed.ps !== undefined && once('poster')) add('warn', t, 'poster', `постер ленты (.feedPosterBg) ${prev.ps} -> ${changed.ps} ${at}; ${ph}`)
  })
}
