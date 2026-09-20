// Один замер «что сейчас жрёт ресурсы» — чистая функция над DOM, без React.
// Общий для всего приложения (appPerfProbe.js): в уроке заполнены поля ленты
// чата (bubbles/frozen/dom/waves), вне урока они -1/0.
// Считает то, что на телефоне нельзя увидеть без DevTools: сколько CSS-анимаций
// реально крутится (в т.ч. бесконечных и за экраном), сколько волн голосовых
// (canvas) живёт в ленте, сколько <audio>/<video> держат медиа в памяти,
// размер DOM. Формат строки нарочно компактный — она пишется в pLog раз в
// секунду и читается по столбикам.

// Сколько анимаций из списка бесконечные и как они распределены по именам —
// именно бесконечные не дают GPU уснуть, даже если пузырь давно уехал вверх
function infiniteBreakdown(anims) {
  const names = new Map()
  let inf = 0
  for (const a of anims) {
    let iters
    try { iters = a.effect?.getTiming?.().iterations } catch { iters = undefined }
    // На паузе (animation-play-state: paused) композитор не крутит — не считаем
    if (iters !== Infinity || a.playState !== 'running') continue
    inf++
    const name = a.animationName || a.transitionProperty || '?'
    names.set(name, (names.get(name) || 0) + 1)
  }
  const top = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([n, c]) => `${n}:${c}`).join(',')
  return { inf, top }
}

export function samplePerf({ fps, worstMs, drops, raf }) {
  const anims = typeof document.getAnimations === 'function' ? document.getAnimations() : []
  const { inf, top } = infiniteBreakdown(anims)
  const feed    = document.querySelector('.playerFeedInner')
  const dom     = feed ? feed.getElementsByTagName('*').length : -1
  const bubbles = feed ? feed.querySelectorAll('.playerMsgBubble').length : -1
  const frozen  = feed ? feed.querySelectorAll('.playerMsgRow[data-frozen]').length : 0
  const waves   = document.querySelectorAll('.playerAudioWave').length
  const audios  = document.querySelectorAll('audio')
  const videos  = document.querySelectorAll('video')
  const playingA = [...audios].filter(a => !a.paused).length
  const playingV = [...videos].filter(v => !v.paused).length
  // Кто именно играет и где живёт скелетон с бликом — класс родителя
  // (circleFrame / slideVideoRoot / poolHolder …): в логе отличить кружок
  // урока от видео ленты под ним и от заглушки кружка без видео
  const who  = [...videos].filter(v => !v.paused).map(describeMedia).join(',')
  const skel = [...document.querySelectorAll('.feedSkeleton')].map(parentTag).join(',')
  const canvases = document.querySelectorAll('canvas').length
  const mem     = performance.memory?.usedJSHeapSize
  const memStr  = mem ? ` heap=${Math.round(mem / 1048576)}MB` : ''
  return (
    `[perf] fps=${fps} worst=${worstMs}ms drops=${drops}` +
    ` anim=${anims.length} inf=${inf}${top ? `(${top})` : ''}` +
    ` waves=${waves} audio=${audios.length}/${playingA} video=${videos.length}/${playingV}` +
    ` bubbles=${bubbles} frozen=${frozen} dom=${dom}${memStr}` +
    (who ? ` vplay=${who}` : '') + (skel ? ` skel=${skel}` : '') +
    // rAF-колбэков за секунду (60 = один цикл на 60fps) и кто они (rafProbe.js)
    (raf ? ` raf=${raf.total}${raf.top ? '(' + raf.top + ')' : ''}` : '') +
    ` canvas=${canvases}` +
    (document.hidden ? ' HIDDEN' : '')
  )
}

// Класс ближайшего родителя; парковка пула видео ленты (за экраном) — poolHolder
function parentTag(el) {
  const p = el.parentElement
  if (!p) return 'detached'
  if (p.style?.left === '-9999px') return 'poolHolder'
  return String(p.className || p.tagName || '?').split(' ')[0]
}

function describeMedia(v) {
  return `${parentTag(v)}${v.muted ? ':muted' : ''}${v.loop ? ':loop' : ''}`
}
