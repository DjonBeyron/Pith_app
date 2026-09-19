// Один замер «что сейчас жрёт ресурсы» — чистая функция над DOM, без React.
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
    if (iters !== Infinity) continue
    inf++
    const name = a.animationName || a.transitionProperty || '?'
    names.set(name, (names.get(name) || 0) + 1)
  }
  const top = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([n, c]) => `${n}:${c}`).join(',')
  return { inf, top }
}

export function samplePerf({ fps, worstMs, drops }) {
  const anims = typeof document.getAnimations === 'function' ? document.getAnimations() : []
  const { inf, top } = infiniteBreakdown(anims)
  const feed    = document.querySelector('.playerFeedInner')
  const dom     = feed ? feed.getElementsByTagName('*').length : -1
  const bubbles = feed ? feed.querySelectorAll('.playerMsgBubble').length : -1
  const waves   = document.querySelectorAll('.playerAudioWave').length
  const audios  = document.querySelectorAll('audio')
  const videos  = document.querySelectorAll('video')
  const playingA = [...audios].filter(a => !a.paused).length
  const playingV = [...videos].filter(v => !v.paused).length
  const mem     = performance.memory?.usedJSHeapSize
  const memStr  = mem ? ` heap=${Math.round(mem / 1048576)}MB` : ''
  return (
    `[perf] fps=${fps} worst=${worstMs}ms drops=${drops}` +
    ` anim=${anims.length} inf=${inf}${top ? `(${top})` : ''}` +
    ` waves=${waves} audio=${audios.length}/${playingA} video=${videos.length}/${playingV}` +
    ` bubbles=${bubbles} dom=${dom}${memStr}` +
    (document.hidden ? ' HIDDEN' : '')
  )
}
