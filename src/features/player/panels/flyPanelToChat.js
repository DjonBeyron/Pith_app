// Панель с таблицей не «гаснет, а потом заново появляется» пузырём в чате —
// она сама улетает на место своего сообщения. Летит КЛОН панели поверх всего
// (position:fixed): настоящая панель в этот момент уже гаснет и вот-вот
// размонтируется, и вешать на неё анимацию было бы гонкой с React.
const FLIGHT_MS = 320
// Пока панель уходит, лента разжимается на её высоту (tdSpacer/tmSpacer,
// 0.28s в CSS). Цель меряем ПОСЛЕ этого — иначе пузырь уедет из-под
// приземления, и клон сядет мимо
const SETTLE_MS = 300
// На этой доле полёта показываем настоящий пузырь: клон в это время уже
// почти на месте и гаснет поверх него — получается не подмена, а посадка
const HANDOVER = 0.65
// Бокс сборки сворачивается ещё до полёта — успевает внутри SETTLE_MS
const COLLAPSE_MS = 200

// Бокс сборки фразы в чат не уезжает, когда в нём была только подсказка
// («Смотри на таблицу…»): пузырь там ниже клона на всю его высоту, и посадка
// выглядела рывком. Сворачиваем его в клоне заранее — панель на глазах
// подбирается до того вида, в котором ляжет в переписку. Сворачиваем СВЕРХУ
// (top едет вниз вместе с высотой), чтобы таблица осталась на месте
function collapseAssembly(ghost) {
  const box = ghost.querySelector('.tdAssemblyBox')
  if (!box) return
  const h = box.getBoundingClientRect().height
  const gap = parseFloat(getComputedStyle(box).marginBottom) || 0
  const shrink = h + gap
  if (!shrink) return
  const ease = { duration: COLLAPSE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
  box.style.overflow = 'hidden'
  box.animate([
    { height: `${h}px`, marginBottom: `${gap}px`, opacity: 1 },
    { height: '0px', marginBottom: '0px', opacity: 0 },
  ], ease)
  const rect = ghost.getBoundingClientRect()
  ghost.animate([
    { height: `${rect.height}px`, top: `${rect.top}px` },
    { height: `${rect.height - shrink}px`, top: `${rect.top + shrink}px` },
  ], ease)
}

export function flyPanelToChat(panelEl, nodeId, { send, reveal, onLanded, dropAssembly = false }) {
  const finish = () => onLanded?.()
  // Без WAAPI (очень старый браузер) — обычное поведение: пузырь просто
  // появляется в чате, без полёта
  if (!panelEl || typeof panelEl.animate !== 'function') {
    send?.(false)
    finish()
    return
  }

  const from = panelEl.getBoundingClientRect()
  const ghost = panelEl.cloneNode(true)
  ghost.classList.add('panelFlyGhost')
  ghost.style.left   = `${from.left}px`
  ghost.style.top    = `${from.top}px`
  ghost.style.width  = `${from.width}px`
  ghost.style.height = `${from.height}px`
  document.body.appendChild(ghost)
  if (dropAssembly) collapseAssembly(ghost)

  // arriving=true: пузырь встаёт в ленту сразу (держит место под посадку и
  // даёт её замерить), но невидимым — до вызова reveal
  send?.(true)

  setTimeout(() => {
    const target = document.querySelector(`[data-table-bubble="${nodeId}"]`)
    if (!target) {
      ghost.remove()
      reveal?.()
      finish()
      return
    }
    const to = target.getBoundingClientRect()
    // Мерим клон заново: бокс сборки мог свернуться, и лететь надо уже от
    // подобравшейся геометрии, иначе посадка уедет на его высоту
    const at = ghost.getBoundingClientRect()
    const scale = at.width ? to.width / at.width : 1
    const anim = ghost.animate([
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1, borderRadius: '0px' },
      { opacity: 1, offset: HANDOVER },
      { transform: `translate(${to.left - at.left}px, ${to.top - at.top}px) scale(${scale})`,
        opacity: 0, borderRadius: '4px 18px 18px 18px' },
    ], { duration: FLIGHT_MS, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' })

    // Пузырь проявляется под конец полёта: клон в это время уже почти на
    // месте и гаснет поверх него — получается посадка, а не подмена
    setTimeout(() => reveal?.(), FLIGHT_MS * HANDOVER)
    const land = () => { reveal?.(); ghost.remove(); finish() }
    anim.onfinish = land
    anim.oncancel = land
  }, SETTLE_MS)
}
