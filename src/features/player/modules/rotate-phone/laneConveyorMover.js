// «Двигатель» узора дорожки: сдвиг слоя ::before колонки .wlLanes i без пересчёта её стилей.
// Раньше привод (laneConveyorDrive.js) каждый кадр писал переменную --run-y в стиль колонки: браузер заново считал стили самой колонки и обоих её псевдоэлементов (длинные градиенты узора
// раскрываются из переменных заново) — на три дорожки ≈ 160 мкс за кадр на ноутбуке, при CPU 4× это 170 мс из каждой секунды конвейера (замер 2026-11-25, трасса Chromium и микрозамер).
// Здесь сдвиг ведёт стоящая на паузе анимация псевдоэлемента: её значение в момент t мс — ровно t px, привод пишет «время» = нужный сдвиг в px. Стили колонки не трогаются (≈ 18 мкс за кадр),
// а на экране то же самое: тот же transform translate3d(0, y px, 0) того же слоя, сдвиг по-прежнему кратен пикселю устройства (его считает привод). Правила CSS не менялись: анимация лишь
// перекрывает transform слоя; обратный конвейер (data-up, CSS: период − сдвиг) привод считает сам.
// Браузер без анимации псевдоэлементов (pseudoElement — Safari 14+, Chrome 84+) → null: привод пишет --run-y, как раньше.
export const MOVE_SPAN = 100000 // длина анимации в мс и её ход в px: 1 мс = 1 px (сдвиг узора не больше периода — сотни px)

/** col — колонка дорожки → { set(px), stop() } | null (не поддерживается — работать по-старому, через --run-y) */
export function pseudoMover(col) {
  try {
    if (typeof col?.animate !== 'function') return null
    const a = col.animate([{ transform: 'translate3d(0, 0px, 0)' }, { transform: `translate3d(0, ${MOVE_SPAN}px, 0)` }], { pseudoElement: '::before', duration: MOVE_SPAN, easing: 'linear', fill: 'both' })
    if (a?.effect?.pseudoElement !== '::before') { a?.cancel?.(); return null } // параметр не понят: анимация встала бы на саму колонку и увезла бы её
    a.pause(); a.currentTime = 0
    return { set(px) { a.currentTime = px }, stop() { try { a.cancel() } catch { /* уже снята */ } } }
  } catch { return null }
}

/** Слабое устройство (v3.3.380): узор ЕДЕТ сам — одна бесконечная анимация слоя ::before на композиторе (translate 0 → период, 1 мс = 1 px), привод не пишет ничего в кадр: только меняет скорость (playbackRate),
 *  когда она ушла от прежней больше чем на 4 %. Без пересчёта стилей колонок. col → { setPeriod(px), setRate(px/с), setUp(bool), stop() } | null (браузер не умеет — узор стоит, как раньше) */
export const STEPS_HZ = 10 // режим «Реже» (v3.3.387): узор меняет положение ≈ 10 раз в секунду (дискретные шаги), а не каждый кадр
const STEPS_MIN = 3, STEPS_MAX = 120
const divisorsOf = n => { const d = []; for (let k = 1; k * k <= n; k++) if (n % k === 0) { d.push(k); if (k * k !== n) d.push(n / k) } return d.sort((a, b) => a - b) }
/** Сколько шагов на период узора: ≈ STEPS_HZ смен в секунду при скорости pxPerSec, но делитель периода в пикселях УСТРОЙСТВА (шаг — целый пиксель: нить 1 px не размывается, шва на обороте нет) */
export function stepsFor(periodCss, pxPerSec, dpr = 1) {
  const pd = Math.max(1, Math.round(periodCss * (dpr > 0 ? dpr : 1)))
  const want = Math.min(STEPS_MAX, Math.max(STEPS_MIN, (periodCss * STEPS_HZ) / Math.max(1, pxPerSec)))
  const ds = divisorsOf(pd).filter(d => d >= STEPS_MIN && d <= STEPS_MAX)
  const best = ds.length ? ds.reduce((b, d) => (Math.abs(Math.log(d / want)) < Math.abs(Math.log(b / want)) ? d : b), ds[0]) : 0
  return best && best / want > 0.5 && best / want < 2 ? best : Math.round(want) // нет подходящего делителя (период — простое число пикселей): шаг дробный, лучше чем 300 смен в секунду
}

export function loopMover(col, { steps = false } = {}) {
  try {
    if (typeof col?.animate !== 'function') return null
    const frames = p => [{ transform: 'translate3d(0, 0px, 0)' }, { transform: `translate3d(0, ${p}px, 0)` }]
    const a = col.animate(frames(100), { pseudoElement: '::before', duration: 100, easing: 'linear', iterations: Infinity, fill: 'both' })
    if (a?.effect?.pseudoElement !== '::before') { a?.cancel?.(); return null }
    a.pause()
    let per = 100, rate = 0, dpr = 1, pxs = 0, n = 0, dirUp = false
    const ease = () => { // «Реже»: easing steps(n, end) на том же композиторном слое — кадр перерисовывается только при смене шага; скорость растёт через playbackRate, как раньше
      if (!steps || !(pxs > 0)) return
      const k = stepsFor(per, pxs, dpr)
      if (k !== n) { n = k; a.effect.updateTiming({ easing: `steps(${k}, end)` }) }
    }
    return {
      setPeriod(p, ratio = 1) { if (!(p > 0)) return; dpr = ratio > 0 ? ratio : 1; if (p === per) return; per = p; a.effect.setKeyframes(frames(p)); a.effect.updateTiming({ duration: p }); ease() },
      setRate(pxPerSec) {
        const r = Math.max(0, pxPerSec) / 1000
        if (r === 0) { if (rate !== 0) { rate = 0; a.pause() } return }
        if (rate !== 0 && Math.abs(r - rate) < rate * 0.04) return
        a.playbackRate = r; if (rate === 0) a.play(); rate = r; pxs = pxPerSec; ease()
      },
      setUp(up) { // смена направления без скачка: при reverse тот же currentTime даёт 1 − p, поэтому отражаем время внутри периода — узор остаётся на месте и едет в другую сторону (журнал iPhone 2026-11-28)
        if (up === dirUp) return
        const t = a.currentTime; dirUp = up
        a.effect.updateTiming({ direction: up ? 'reverse' : 'normal' })
        if (typeof t === 'number' && per > 0) { try { a.currentTime = per - (((t % per) + per) % per) } catch { /* время не ставится — останется прежнее */ } }
      },
      stop() { try { a.cancel() } catch { /* уже снята */ } },
    }
  } catch { return null }
}
