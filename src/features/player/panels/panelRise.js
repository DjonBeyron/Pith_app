import { pLog, isTraceOn } from '../../../shared/lib/debug.js'
import { easingFn } from '../../../shared/lib/cubicBezier.js'

// Подъём/спуск панели ответа ВМЕСТЕ с историей чата — одной парой WAAPI-
// анимаций на одном таймлайне, чтобы они шли пиксель в пиксель.
//
// Что было не так раньше (choose-word): распорка под лентой анимировала
// height той же кривой и длительностью, что и панель свой transform. Это два
// разных конвейера — height это layout (пересчёт раскладки каждый кадр, на
// длинной переписке заметно тормозит), transform композитится на GPU, — и
// история трогалась с первого же кадра, хотя панель ещё далеко внизу.
//
// Теперь: распорка меняет высоту РАЗОМ (раскладка сразу конечная), а видимый
// скачок гасит трансформ на ленте. Панель и лента едут двумя
// WAAPI-анимациями, стартующими в одном тике:
//
//   · панель — translateY(100% → 0), своя кривая (easing браузера);
//   · история стоит, пока верх панели не коснётся низа последнего сообщения
//     (с тем самым зазором, что останется в конце), и только потом едет
//     вверх с той же скоростью, что и панель. Касание — при прогрессе
//     p_c = 1 − drop/panelH (drop — на сколько распорка реально подняла
//     историю; вывод: зазор в конце = зазор в момент касания). Кусок кривой
//     одной CSS-функцией не задать, поэтому history-кадры сэмплируются из
//     той же bezier (cubicBezier.js) с linear между точками — SAMPLES точек
//     на 380мс это шаг ~8мс, вдвое чаще кадра.
//
// Трансформ вешается на САМ контейнер ленты (.playerFeed, overflow:auto), а не
// на .playerFeedInner: на подъёме контейнер уже стал короче (распорка забрала
// место), и удерживаемое ниже содержимое резалось бы его краем — так и
// выглядело «что-то перекрывает низ чата» в начале подъёма. Когда едет сам
// контейнер, его клип-бокс едет вместе с содержимым. Контейнер перевёрнут
// (scaleY(-1)), в его системе translateY(−v) = визуально ВНИЗ на v.
const SAMPLES = 48

function sample(duration, easing, holdDownAt) {
  const p = easingFn(easing)
  const frames = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    frames.push({
      offset: t,
      transform: `scaleY(-1) translateY(${(-holdDownAt(p(t))).toFixed(2)}px)`,
      easing: 'linear',
    })
  }
  return frames
}

function run(panelEl, panelFrames, historyFrames, duration, easing, label) {
  const feed = document.querySelector('.playerFeed')
  // На время анимации CSS-переход панели выключен: иначе он стартует
  // на кадр позже WAAPI и в конце «дожимает» уже стоящую панель
  const prevTransition = panelEl.style.transition
  panelEl.style.transition = 'none'
  const panelAnim = panelEl.animate(panelFrames, { duration, easing, fill: 'both' })
  const histAnim = feed
    ? feed.animate(historyFrames, { duration, fill: 'both' })
    : null
  const finish = () => {
    panelEl.style.transition = prevTransition
    if (feed) feed.style.transform = ''
    // fill:both держал конечный кадр; снимаем анимации — конечное состояние
    // дальше держат классы панели и чистая раскладка ленты
    panelAnim.cancel()
    histAnim?.cancel()
  }
  panelAnim.finished.then(finish).catch(finish)
  pLog(`[${label}] WAAPI старт: панель+история ${duration}мс ${easing}`)
  return panelAnim
}

// drop — на сколько распорка ТОЛЬКО ЧТО подняла историю (уже в раскладке);
// panelH — полная высота панели (translateY(100%) считается от неё)
export function playPanelRise(panelEl, { drop, panelH, duration = 380, easing = 'cubic-bezier(0.22, 1, 0.36, 1)', label = 'rise' }) {
  const pc = panelH > 0 ? Math.max(0, 1 - drop / panelH) : 0
  pLog(`[${label}] подъём: drop=${drop.toFixed(1)} panelH=${panelH} → касание при p=${pc.toFixed(3)}`)
  const histFrames = sample(duration, easing, p => Math.min(drop, panelH * (1 - p)))
  return run(
    panelEl,
    [{ transform: 'translateY(100%)' }, { transform: 'translateY(0%)' }],
    histFrames, duration, easing, label,
  )
}

// Спуск — зеркально: история едет вниз с панелью с первого кадра и
// останавливается, отдав свои drop px; панель уезжает дальше одна.
// Возвращает { anim, historyStopMs } — через сколько мс история встанет
// (panelH·p(t) = drop, t ищется по той же кривой): в этот момент вызывающий
// проявляет ответ, чтобы он полетел вверх ровно с остановки истории
export function playPanelDrop(panelEl, { drop, panelH, duration = 280, easing = 'cubic-bezier(0.4, 0, 1, 1)', label = 'drop' }) {
  const histFrames = sample(duration, easing, p => -(drop - Math.min(drop, panelH * p)))
  const historyStopMs = Math.round(timeAtProgress(easing, panelH > 0 ? drop / panelH : 0) * duration)
  pLog(`[${label}] спуск: drop=${drop.toFixed(1)} panelH=${panelH} → история встанет через ${historyStopMs}мс`)
  const anim = run(
    panelEl,
    [{ transform: 'translateY(0%)' }, { transform: 'translateY(100%)' }],
    histFrames, duration, easing, label,
  )
  return { anim, historyStopMs }
}

// t ∈ [0..1], при котором кривая даёт прогресс target (кривые монотонны —
// бисекция). target ≥ 1 → 1, ≤ 0 → 0
function timeAtProgress(easing, target) {
  if (target <= 0) return 0
  if (target >= 1) return 1
  const p = easingFn(easing)
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (p(mid) < target) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

// Покадровая трасса с длительностью кадра: «лагает/мало кадров» — это либо
// долгие кадры (dt ≫ 16.7), либо рассинхрон (зазор панель↔сообщение плавает
// после касания). Пишет оба
export function tracePanelRise(label, panelEl, spacerSel, frames = 28) {
  if (!isTraceOn()) return
  const feed = document.querySelector('.playerFeedInner')
  const t0 = performance.now()
  let prev = t0
  let n = 0
  let prevGap = null
  let contactAt = null
  const tick = () => {
    const now = performance.now()
    const dt = now - prev
    prev = now
    const rows = feed ? [...feed.querySelectorAll('.playerMsgRow')].filter(el => !el.closest('[data-pending]')) : []
    const last = rows[rows.length - 1]?.getBoundingClientRect()
    const panel = panelEl?.getBoundingClientRect()
    const spacer = document.querySelector(spacerSel)?.getBoundingClientRect()
    const gap = panel && last ? panel.top - last.bottom : null
    const dGap = prevGap != null && gap != null ? gap - prevGap : 0
    // Касание: зазор перестал уменьшаться — дальше он обязан стоять
    if (contactAt == null && prevGap != null && gap != null && Math.abs(dGap) < 0.5 && n > 1) contactAt = n
    prevGap = gap
    pLog(`[${label}] +${Math.round(now - t0)}мс кадр${n} dt=${dt.toFixed(1)}${dt > 25 ? ' ⚠ ДОЛГИЙ КАДР' : ''}`
      + ` | панель top=${panel ? panel.top.toFixed(1) : '—'}`
      + ` | низ сообщ=${last ? last.bottom.toFixed(1) : '—'}`
      + ` | зазор=${gap != null ? gap.toFixed(1) : '—'}${dGap ? ` (${dGap > 0 ? '+' : ''}${dGap.toFixed(1)})` : ''}`
      + `${contactAt != null && contactAt < n && Math.abs(dGap) > 0.5 ? ' ⚠ РАССИНХРОН ПОСЛЕ КАСАНИЯ' : ''}`
      + ` | распорка=${spacer ? spacer.height.toFixed(1) : '—'}`)
    if (++n < frames) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
