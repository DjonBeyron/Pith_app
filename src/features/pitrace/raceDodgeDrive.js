// Привод «Пит уворачивается» (DOM): шагает модель raceDodge.js по пилюлям ученика (зовёт движок пилюль useWordLanePills на каждом кадре режима «Говорю» гонки) и двигает голову Пита.
//  • Голова (.wlCat) получает класс wlCat--track: её left встаёт на 50 %, а x ведёт ОДНА обёртка — <svg class="wlCatSvg"> (вся голова), transform: translateX(--wl-dx) — композитор, без layout.
//    Подъём головы (transform самого .wlCat, wordLaneCatPeek) от x не зависит: говорящая голова уворачивается вместе со всем.
//  • data-dodge на .wlCat выбирает переход (word-lane-cat-dodge.css): set — без перехода (первая установка), track — переезд 0,3 с, out — рывок-пружина 0,16 с с наклоном и сжатием (keyframes), back — мягкий возврат 0,5 с.
//    data-dir — l / r (в какую сторону наклон). Слабое устройство (scn--lite) и reduced-motion — рывок и возврат мгновенные (CSS).
//  • x головы между ступенями хранится в data-dodge-x: новая ступень начинает с того места, где Пит стоял; первая — с места, где голова торчит сейчас (--cat-x), чтобы класс не дёрнул её.
//  • Журнал: одна строка «[dodge] …» на уворот (pLog).
import { createDodge, HEAD_W, HEAD_TOP } from './raceDodge.js'
import { pLog } from '../../shared/lib/debug.js'

export const PEEK_MS = 700        // пилюля подходит или Пит отскочил — голова торчит ещё столько (продлевается, пока нужно)
const PEEK_EVERY_MS = 250

/** Размер головы в долях сцены: ширина (% ширины) и макушка поднятой головы (% высоты: торчит на 96 %, word-lane.css). Нет размеров (тесты, скрытая сцена) — средние */
export function measureHead(cat) {
  const stage = cat?.parentElement
  const sw = stage?.offsetWidth ?? 0, sh = stage?.offsetHeight ?? 0
  if (!sw || !sh || !cat.offsetWidth) return { headW: HEAD_W, headTop: HEAD_TOP }
  return { headW: (cat.offsetWidth / sw) * 100, headTop: 100 - ((cat.offsetHeight * 0.96) / sh) * 100 }
}

export function createDodgeDrive({ cat, peek = () => {}, log = pLog, now = () => performance.now() }) {
  const svg = cat?.querySelector('.wlCatSvg')
  if (!svg) return null
  const { headW, headTop } = measureHead(cat)
  const x0 = Number(cat.dataset.dodgeX ?? cat.style.getPropertyValue('--cat-x')) || 50
  const model = createDodge({ headTop, headW, x0 })
  const put = (x, mode, dir = 0) => {
    cat.dataset.dodge = mode
    if (dir) cat.dataset.dir = dir > 0 ? 'r' : 'l'
    svg.style.setProperty('--wl-dx', `${(((x - 50) / headW) * 100).toFixed(2)}%`)
  }
  if (!cat.classList.contains('wlCat--track')) { put(x0, 'set'); cat.classList.add('wlCat--track'); globalThis.getComputedStyle?.(svg).transform } // стиль «без перехода» применить сразу (одно чтение стиля за игру), иначе первый переезд поехал бы от нуля
  let peekAt = -Infinity
  return {
    step(pills, t) {
      const s = model.step(pills, t)
      for (const e of s.events) {
        if (e.type === 'dodge') log(`[dodge] дорожка ${e.lane + 1}, низ пилюли ${(e.y + 10).toFixed(1)} % (центр ${e.y.toFixed(1)}), скорость ×${Number(e.speed).toFixed(2)}, ${e.dir > 0 ? 'вправо' : 'влево'} → x ${e.x.toFixed(1)} %`)
      }
      const ev = type => s.events.find(e => e.type === type)
      const out = ev('dodge')
      if (out) put(out.x, 'out', out.dir)
      else if (ev('back')) put(s.x, 'back') // возврат мягкий, даже если база сменилась (следующая пилюля в другой дорожке)
      else if (ev('track')) put(s.x, 'track')
      if (s.events.length) cat.dataset.dodgeX = String(s.x)
      const n = now()
      if (s.need && n - peekAt >= PEEK_EVERY_MS) { peekAt = n; peek(PEEK_MS) }
      return s
    },
    stop() { const x = model.stop(); if (x != null) put(x, 'back') },
  }
}
