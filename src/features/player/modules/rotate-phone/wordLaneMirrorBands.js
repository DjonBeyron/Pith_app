// Горизонтальные пилюли-подложки «Дубля и зеркала» (v3.3.87): тройку пилюль каждой ленты — Пита сверху, «твоя фраза» снизу — обнимает одна широкая пилюля во всю ширину дорожек, подпись зелёным по центру
// сверху внутри («Пит» / «Твоя фраза», один раз на ленту, а не над каждой пилюлей). Узлы лежат в поле дорожек готовыми, ПОД пилюлями (WordLanePills.jsx: <div class="wlBand" data-band="pit|you"><i class="wlBandFill"/></div>,
// порядок в DOM = порядок слоёв, z-index не нужен), скрыты; сцена «зеркало» включает их (data-on), ставит высоту (--by) и подпись (data-tag). Новых узлов сцена не создаёт.
// Заливка при прослушивании — серая полоса слева направо в слое подложки (под вертикальными пилюлями): одна WAAPI-анимация transform: scaleX(0 → 1), линейная, длиной в звук (Пит — по длинам плана диктора,
// «ты» — по длительности записи), с задержкой delayMs (у Пита — leadMs: голос молчит после включения файла). Только transform — на слабом устройстве тоже можно; нет WAAPI — полоса просто не едет.
const SIDES = ['pit', 'you']

/** field — поле дорожек (.wlField) или null; layout — compareLayout(): { pit: [...], you: [...] }. Нет ленты (записи нет — нет «ты») — подложка скрыта */
export function createBands(field, layout) {
  const bands = {}
  const anims = {}
  for (const side of SIDES) {
    const first = layout?.[side]?.[0]
    const el = first ? field?.querySelector?.(`[data-band="${side}"]`) : null
    if (!el) continue
    el.style?.setProperty?.('--by', String(first.y))
    el.setAttribute('data-tag', first.tag)
    el.setAttribute('data-on', '')
    bands[side] = { el, fill: el.firstElementChild }
  }
  const cancel = side => { try { anims[side]?.cancel() } catch { /* уже снята */ } delete anims[side] }
  const clear = () => SIDES.forEach(cancel)
  return {
    /** Лента side начинает наливаться через delayMs и заполняется за durationMs; прежняя заливка этой ленты снимается */
    fill(side, { delayMs = 0, durationMs = 0 } = {}) {
      const b = bands[side]
      cancel(side)
      if (!b?.fill || typeof b.fill.animate !== 'function' || !(durationMs > 0)) return
      anims[side] = b.fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: durationMs, delay: Math.max(0, delayMs), easing: 'linear', fill: 'both' })
    },
    /** Обе ленты пустые (новое прослушивание) */
    clear,
    stop() {
      clear()
      for (const { el } of Object.values(bands)) { el.removeAttribute('data-on'); el.removeAttribute('data-tag'); el.style?.removeProperty?.('--by') }
    },
  }
}
