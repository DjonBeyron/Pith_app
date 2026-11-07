// Вид демо перед кругом «Скажи» (racePhraseDemo.js) на плашке круга phrases2-ann (WordLaneTurnPlate, .wlTurn): подпись реплики Пита (видна и без озвучки — подписи реплик в игре нет, v3.3.84)
// и статичная широкая пилюля-образец (не из пула): data-wide data-mode='say', маска слов «кирпичиками» (mountMask, racePhraseMaskView.js) и свой слой заливки слева направо (translateX, fillTransform пула).
// Узел кладётся в последнюю живую плашку гонки (.wl[data-race] .wlTurn без --leave) и снимается вместе с ней; плашки ещё нет или её перемонтировали — узел ставится заново на следующем шаге с тем же состоянием.
// Стиль — race-phrase-demo.css (без filter, переходы только transform / opacity).
import { mountMask } from './racePhraseMaskView.js'
import { fillTransform } from '../player/modules/rotate-phone/wordLanePool.js'

export const PLATE_SEL = '.wl[data-race] .wlTurn:not(.wlTurn--leave)'

/** Последняя живая плашка гонки в документе (или null) */
export function findPlate(doc = globalThis.document) {
  const all = doc?.querySelectorAll?.(PLATE_SEL)
  return all?.length ? all[all.length - 1] : null
}

/** → { show, step(heard, v), all(), hide(), remove(), node() } */
export function mountDemo({ text, caption = '', find = findPlate }) {
  let box = null, fill = null, mask = null
  let heard = new Map(), v = 0, full = false, out = false
  const paint = () => {
    if (!box) return
    mask?.set(heard, full)
    if (fill) fill.style.transform = fillTransform(v, true)
    box.toggleAttribute('data-out', out)
  }
  const ensure = () => {
    if (box?.isConnected) return
    const plate = find()
    if (!plate) return
    const doc = plate.ownerDocument
    box = doc.createElement('div'); box.className = 'racePhraseDemo'; box.setAttribute('data-testid', 'race-phrase-demo')
    const cap = doc.createElement('div'); cap.className = 'racePhraseDemoCap'; cap.textContent = caption
    const pill = doc.createElement('div'); pill.className = 'racePhraseDemoPill'; pill.setAttribute('data-wide', ''); pill.setAttribute('data-mode', 'say'); pill.setAttribute('data-testid', 'race-phrase-demo-pill')
    fill = doc.createElement('span'); fill.className = 'racePhraseDemoFill'; fill.setAttribute('aria-hidden', 'true')
    pill.appendChild(fill)
    mask = mountMask(pill, text)
    if (caption) box.appendChild(cap)
    box.appendChild(pill)
    plate.appendChild(box)
    paint()
  }
  return {
    show() { ensure() },
    step(h, value) { heard = h; v = value; ensure(); paint() },
    all() { full = true; v = 1; ensure(); paint() },
    hide() { out = true; paint() },
    remove() { box?.remove(); box = null },
    node: () => box,
  }
}
