import { riseFrames, RISE_MS, RISE_EASING } from '../player/modules/rotate-phone/wordLaneRise.js'

// «Улетает вверх» пойманной пилюли «Ловлю» (CONCEPT_GAME2.md): пилюля живёт в дорожке, которая сама едет вниз, поэтому взлёт по кривой игры (wordLaneRise.riseFrames: синусоида, сжатие в искру, затухание)
// идёт на КОПИИ: копия встаёт в неподвижный слой на то же место экрана и улетает, оригинал прячется (data-state=gone). lite — слабое устройство или reduced-motion: без полёта, оригинал просто гаснет.
/** Запустить взлёт копии el в слое layer; → Animation или null (нет WAAPI / lite) */
export function flyUp(el, layer, h, lite = false) {
  const r = el.getBoundingClientRect()
  const lr = layer.getBoundingClientRect()
  if (lite || typeof el.animate !== 'function' || !(r.height > 0)) return null
  const copy = el.cloneNode(true)
  copy.removeAttribute('data-i'); copy.setAttribute('data-state', 'fly')
  Object.assign(copy.style, { top: `${r.top - lr.top}px`, left: `${r.left - lr.left}px`, width: `${r.width}px`, height: `${r.height}px` })
  layer.appendChild(copy)
  const y0 = ((r.top - lr.top + r.height / 2) / h) * 100
  const shift = (y, dx) => `${dx.toFixed(2)}px ${(((y - y0) / 100) * h).toFixed(2)}px` // сдвиг от места, где копия стоит (как у плашек, wordLanePlateExit)
  const anim = copy.animate(riseFrames(y0, h, shift), { duration: RISE_MS, easing: RISE_EASING, fill: 'both' })
  anim.finished.then(() => copy.remove(), () => copy.remove())
  return anim
}
