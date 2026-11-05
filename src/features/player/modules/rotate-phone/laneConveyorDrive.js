import { createLane, stepLane, laneLook, settled } from './wordLaneConveyor.js'

// Привод конвейера: один rAF на все три дорожки (по образцу scene/v2/whiskerDrive.js). Каждый кадр — шаг модели (wordLaneConveyor.js) для каждой дорожки и запись двух CSS-переменных в её колонку
// .wlLanes i: --run-y (сдвиг пунктира, dvh — едет transform ::before), --run-a (прозрачность штрихов — яркость; на «зажигании» её ведёт мигание, v3.3.101).
// Стили — word-lane-lane-run.css. Запись только при изменении значения. Все дорожки встали (idle) — цикл засыпает сам; будят его команда (setArmed), появление / уход пилюль и снятие паузы. Команда '2' (акт репетиции идёт, v3.3.87): дорожка едет непрерывно, пока команда стоит, — без пилюль тоже (Пит говорит, ученик промахнулся, стадии сменяются); тормозит только когда команду сняли (граница акта) и летящие пилюли ушли.
// Пилюли на дорожке считаются по DOM: у взятой из пула пилюли стоит data-held, дорожка — data-lane (wordLanePool.take); give снимает data-held. Пилюли, стоящие на месте (data-still: «Дубль и зеркало» на дорожках, wordLaneMirrorScene.js), не считаются: дорожки под ними остановлены. MutationObserver на корне поля срабатывает только на эти признаки — движок пилюль (useWordLanePills) трогать не нужно. Слабое устройство (wl--lite) и reduced-motion (still): без движения и без мигания, только яркость (still уходит в модель). Пауза игры — привод стоит, состояние сохраняется.
export const MAX_DT = 64        // шаг модели за кадр не больше 64 мс: после паузы вкладки разгон не перепрыгивает

export const reducedMotion = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export function createConveyorDrive({
  root, still = false, now = () => globalThis.performance.now(),
  raf = f => globalThis.requestAnimationFrame(f), caf = i => globalThis.cancelAnimationFrame(i),
  observe = (el, fn) => { const o = new globalThis.MutationObserver(fn); o.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-held', 'data-lane', 'data-still', 'data-speed'] }); return () => o.disconnect() },
}) {
  const cols = [...root.querySelectorAll('.wlLanes i')]
  const lanes = cols.map(createLane)
  const shown = cols.map(() => ({}))
  let armed = cols.map(() => false), keep = cols.map(() => false), pills = cols.map(() => 0)
  let id = null, last = 0, paused = false
  let hint = null, hintKey = null, peak = 0 // «Гонка с Питом»: hint — скорость первой пилюли ближайшей стадии (дорожка набирает её ЗАРАНЕЕ, до выезда пилюли), peak — наибольшая скорость пилюль, виденных при этом hint
  const wanted = () => Math.max(1, hint ?? 1, peak) // множитель скорости пунктира: пилюли разгона быстрее конвейера в speed раз; пунктир едет быстрее пропорционально, внутри стадии не откатывается между пилюлями
  let waves = 0, waveEl = null // waves — сколько импульсов уже показала «волна скорости» (data-wave, word-lane-lane-run.css)

  const put = (i, name, value) => {
    if (shown[i][name] === value) return
    shown[i][name] = value
    cols[i].style.setProperty(name, value)
  }
  const draw = (i, look) => {
    put(i, '--run-y', `${look.y.toFixed(2)}dvh`)
    put(i, '--run-a', look.a.toFixed(3))
    if (!still) put(i, '--run-dash', `${(2.2 * look.sy).toFixed(2)}dvh`) // импульс скорости: штрихи длиннее (до ×1,4); на слабом устройстве и при reduced-motion только яркость
  }
  const wave = () => { // по дорожкам пробегает «волна скорости» сверху вниз (CSS-анимация; имя меняется a ↔ b, чтобы она перезапускалась на каждом импульсе)
    const n = lanes.reduce((m, L) => Math.max(m, L.pn), 0)
    if (still || n === waves) return
    waves = n; waveEl ??= root.querySelector('.wlLanes')
    if (waveEl) waveEl.dataset.wave = n % 2 ? 'a' : 'b'
  }
  const frame = ts => {
    id = null
    const dt = Math.min(MAX_DT, Math.max(0, ts - last)); last = ts
    lanes.forEach((L, i) => { draw(i, laneLook(stepLane(L, dt, { armed: armed[i], keep: keep[i], pills: pills[i], still, speed: wanted() }))) })
    wave()
    if (!settled(lanes) && !paused) id = raf(frame)
  }
  const wake = () => { if (id === null && !paused && cols.length) { last = now(); id = raf(frame) } }
  const recount = () => {
    pills = cols.map(() => 0)
    for (const el of root.querySelectorAll('.wlPill[data-held]:not([data-still])')) { const k = Number(el.dataset.lane); if (k >= 0 && k < pills.length) pills[k] += 1; peak = Math.max(peak, Number(el.dataset.speed) || 1) }
    wake()
  }
  const stopObserving = observe(root, recount)

  return {
    /** Команда игры: строка '101' — на каких дорожках сейчас можно ехать (wordLaneConveyorStart.armedLanes); '2' вместо '1' — акт репетиции идёт, дорожка едет непрерывно, пока команда стоит (пилюли не нужны) */
    setArmed(str) { armed = cols.map((_, i) => str?.[i] === '1' || str?.[i] === '2'); keep = cols.map((_, i) => str?.[i] === '2'); recount() },
    /** Скорость первой пилюли ближайшей стадии (множитель к конвейеру; null — стадия без разгона): дорожки плавно (SPEED_RAMP_MS) набирают её до выезда пилюли. Смена подсказки или стадии (key — номер стадии) обнуляет «виденный максимум» */
    setSpeedHint(v, key = null) { const h = v > 0 ? v : null; if (h === hint && key === hintKey) return; hint = h; hintKey = key; peak = 0; recount() },
    /** Пауза игры: привод стоит (кадры не идут, состояние сохраняется), снятие — продолжает */
    setPaused(on) { paused = !!on; if (paused) { if (id !== null) { caf(id); id = null } } else wake() },
    dispose() { if (id !== null) caf(id); id = null; stopObserving() },
    /** Для тестов и отладки */
    state: () => ({ phases: lanes.map(L => L.phase), running: id !== null, speed: wanted(), pills: [...pills], armed: [...armed], keep: [...keep] }),
    frame,
  }
}
