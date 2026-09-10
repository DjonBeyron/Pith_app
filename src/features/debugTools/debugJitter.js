import { pLog } from '../../shared/lib/debug.js'

// Зонд дрожания ленты: «сообщения слегка трясутся по оси».
//
// Обычная запись (rrweb) такое не ловит вовсе — она пишет мутации DOM, а
// дрожание живёт в отрисовке: координаты меняются на доли пикселя, разметка
// при этом не трогается. Поэтому меряем сами, каждый кадр, и не «есть ли
// движение» (движение как раз штатное — прилёт сообщения), а РАЗВОРОТЫ:
// сместилось вниз, тут же вверх, снова вниз. Плавный проезд разворотов не
// даёт; дрожь состоит из них одних.
//
// Заодно на каждом кадре записываем, что в этот момент вообще анимируется —
// без этого «дрожит» остаётся наблюдением, а не диагнозом.

const REVERSAL_MIN = 0.05   // меньше — это шум округления rect, не движение
const SUBPIXEL     = 1.0    // амплитуда дрожи: доли пикселя, а не переезд

let running = null

function rowsNow() {
  const inner = document.querySelector('.playerFeedInner')
  if (!inner) return []
  return [...inner.querySelectorAll('.playerMsgRow')]
}

function label(el, i) {
  const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22)
  return `#${i}${txt ? ` «${txt}»` : ''}`
}

// Что сейчас движется. Отдельно считаем анимации ВЫСОТЫ: их запускает
// PlayerBubble по ResizeObserver, и они двигают всю ленту разметкой — это
// принципиально другая причина, чем трансформ-анимации прилёта (PlayerFeed).
function animSnapshot() {
  if (!document.getAnimations) return { всего: 0, высота: 0, трансформ: 0 }
  let height = 0, transform = 0
  const all = document.getAnimations()
  for (const a of all) {
    const props = a.effect?.getKeyframes?.() ?? []
    const keys = new Set(props.flatMap(k => Object.keys(k)))
    if (keys.has('height')) height += 1
    if (keys.has('transform')) transform += 1
  }
  return { всего: all.length, высота: height, трансформ: transform }
}

// ty из matrix(a,b,c,d,tx,ty) — по вертикали ездит именно он
function translateY(el) {
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return null
  const m = t.match(/matrix\(([^)]+)\)/)
  if (!m) return null
  const parts = m[1].split(',').map(s => parseFloat(s))
  return parts.length >= 6 ? parts[5] : null
}

function feedTransform() {
  const inner = document.querySelector('.playerFeedInner')
  if (!inner) return null
  const ty = translateY(inner)
  return ty == null ? null : +ty.toFixed(3)
}

// Дрожь бывает и без движения КОРОБКИ: если строка едет дробным translateY и
// у неё нет своего слоя, браузер каждый кадр заново раскладывает текст по
// субпиксельной сетке — буквы «плывут», хотя rect стоит на месте. Такое
// getBoundingClientRect не покажет вовсе, поэтому смотрим на само значение.
const FRACT_MIN = 0.02
function isFractional(ty) {
  if (ty == null) return false
  const f = Math.abs(ty % 1)
  return f > FRACT_MIN && f < 1 - FRACT_MIN
}

export function isJitterProbeRunning() { return !!running }

// seconds — сколько наблюдать. Возвращает промис со сводкой.
export function startJitterProbe(seconds = 5) {
  if (running) return running.promise
  const tracks = new Map()   // el → { label, prev, dir, reversals, min, max, samples }
  const frames = []
  let raf = 0
  let stop = null
  const t0 = performance.now()
  pLog(`[jitter] зонд запущен на ${seconds}с — не трогай экран, просто дай сообщениям накопиться`)

  const promise = new Promise(resolve => { stop = resolve })

  const tick = () => {
    const now = performance.now()
    const rows = rowsNow()
    const anims = animSnapshot()
    frames.push({ t: Math.round(now - t0), строк: rows.length, анимаций: anims.всего,
      высота: anims.высота, трансформ: anims.трансформ, лента: feedTransform() })

    rows.forEach((el, i) => {
      const top = el.getBoundingClientRect().top
      let tr = tracks.get(el)
      if (!tr) { tr = { label: label(el, i), prev: top, dir: 0, reversals: 0, min: top, max: top, moves: 0, fract: 0, ownLayer: null }; tracks.set(el, tr) }
      // Дробный translateY = перерисовка текста каждый кадр. Считаем такие
      // кадры отдельно: коробка при этом может стоять как вкопанная
      const ty = translateY(el)
      if (isFractional(ty)) tr.fract += 1
      if (tr.ownLayer === null) {
        const cs = getComputedStyle(el)
        tr.ownLayer = cs.willChange !== 'auto' || cs.backfaceVisibility === 'hidden'
      }
      const d = top - tr.prev
      if (Math.abs(d) >= REVERSAL_MIN) {
        const dir = d > 0 ? 1 : -1
        if (tr.dir !== 0 && dir !== tr.dir) {
          tr.reversals += 1
          // Запоминаем обстановку ПЕРВОГО разворота — по ней и ищут причину
          if (!tr.firstAt) tr.firstAt = { t: Math.round(now - t0), анимаций: anims.всего, высота: anims.высота, трансформ: anims.трансформ }
        }
        tr.dir = dir
        tr.moves += 1
      }
      tr.prev = top
      if (top < tr.min) tr.min = top
      if (top > tr.max) tr.max = top
    })

    if (now - t0 >= seconds * 1000) { finish() ; return }
    raf = requestAnimationFrame(tick)
  }

  function finish() {
    cancelAnimationFrame(raf)
    running = null
    const rows = [...tracks.values()].map(t => ({
      строка: t.label,
      разворотов: t.reversals,
      размах: +(t.max - t.min).toFixed(2),
      кадровСДвижением: t.moves,
      кадровСДробнымСдвигом: t.fract,
      свойСлой: t.ownLayer,
      первыйРазворот: t.firstAt ?? null,
    }))
    const shaky = rows.filter(r => r.разворотов >= 3 && r.размах <= SUBPIXEL)
    const moving = rows.filter(r => r.размах > SUBPIXEL)
    // Плывущий текст: строка ехала дробными значениями и своего слоя не имела
    const blurry = rows.filter(r => r.кадровСДробнымСдвигом >= 3 && !r.свойСлой)
    const summary = {
      наблюдалиСек: seconds,
      кадров: frames.length,
      строк: rows.length,
      дрожат: shaky,
      плывётТекст: blurry.map(r => ({ строка: r.строка, кадров: r.кадровСДробнымСдвигом })),
      ездят: moving.map(r => ({ строка: r.строка, размах: r.размах })),
      вывод: verdict(shaky, blurry, frames),
      строки: rows,
      кадры: frames,
    }
    pLog(`[jitter] итог: строк=${rows.length}, дрожат=${shaky.length}, плывёт текст=${blurry.length}, ездят=${moving.length}`)
    pLog(`[jitter] вывод: ${summary.вывод}`)
    shaky.slice(0, 8).forEach(r =>
      pLog(`[jitter] ${r.строка}: разворотов ${r.разворотов}, размах ${r.размах}px, первый на ${r.первыйРазворот?.t}мс (анимаций ${r.первыйРазворот?.анимаций})`))
    stop(summary)
  }

  // Диагноз, а не наблюдение: три разные причины дают три разные картины
  function verdict(shaky, blurry, frames) {
    const maxAnims = frames.reduce((m, f) => Math.max(m, f.трансформ), 0)
    if (blurry.length) {
      return `${blurry.length} строк(и) ехали ДРОБНЫМ translateY без своего слоя — браузер каждый кадр `
        + 'заново кладёт текст на субпиксельную сетку, и буквы «плывут». Коробка при этом стоит ровно, '
        + `поэтому глазом это читается как дрожь на месте. Одновременно шло до ${maxAnims} transform-анимаций `
        + '(PlayerFeed даёт свою FLIP-анимацию КАЖДОЙ строке — чем больше сообщений, тем их больше)'
    }
    if (!shaky.length) return 'дрожания не поймали — либо его не было, либо лента в это время стояла'
    const withHeight = frames.filter(f => f.высота > 0).length
    const withTransform = frames.filter(f => f.трансформ > 0).length
    const idle = frames.filter(f => f.анимаций === 0).length
    if (withHeight > frames.length * 0.2) {
      return `похоже на анимацию ВЫСОТЫ пузыря: в ${withHeight} кадрах из ${frames.length} шла height-анимация `
        + '(PlayerBubble.animateTo по ResizeObserver). Она двигает разметку, и вся лента едет следом'
    }
    if (withTransform > frames.length * 0.2) {
      return `похоже на трансформ-анимации прилёта: в ${withTransform} кадрах из ${frames.length} шли transform-анимации `
        + '(PlayerFeed делает свою FLIP-анимацию КАЖДОЙ строке). Дробный translateY без своего слоя '
        + 'заставляет браузер перерисовывать текст каждый кадр — это и читается как дрожь'
    }
    if (idle > frames.length * 0.8) {
      return `строки шевелились, когда НИЧЕГО не анимировалось (${idle} кадров из ${frames.length} без анимаций) — `
        + 'причина не в анимациях: смотри на scaleY(-1) ленты и дробные высоты сообщений'
    }
    return 'картина смешанная — смотри поля «кадры» и «строки» в отчёте'
  }

  raf = requestAnimationFrame(tick)
  running = { promise, cancel: finish }
  return promise
}

export function cancelJitterProbe() { running?.cancel() }

// Последняя сводка — её подхватывает отчёт дебага
let last = null
export function getJitterReport() { return last }
export async function runJitterProbe(seconds) {
  last = await startJitterProbe(seconds)
  return last
}
