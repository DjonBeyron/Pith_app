import { createLane, stepLane, laneLook, settled, PERIOD, WAVE_PAD } from './wordLaneConveyor.js'

// Привод конвейера: один rAF на все три дорожки (по образцу scene/v2/whiskerDrive.js). Каждый кадр — шаг модели (wordLaneConveyor.js) для каждой дорожки и запись трёх CSS-переменных в её колонку
// .wlLanes i: --run-y (сдвиг пунктира, dvh — едет transform ::before), --run-a (прозрачность штрихов — яркость), --run-w (позиция волны «зажигания» вдоль пунктира; 999dvh — волны нет, всё горит ровно).
// Стили — word-lane-lane-run.css. Запись только при изменении значения. Все дорожки встали (idle) — цикл засыпает сам; будят его команда (setArmed), появление / уход пилюль и снятие паузы.
// Пилюли на дорожке считаются по DOM: у взятой из пула пилюли стоит data-held, дорожка — data-lane (wordLanePool.take); give снимает data-held. MutationObserver на корне поля срабатывает только на эти два
// признака — движок пилюль (useWordLanePills) трогать не нужно. Слабое устройство (wl--lite) и reduced-motion (still): без движения, только яркость (волны тоже нет). Пауза игры — привод стоит, состояние сохраняется.
export const MAX_DT = 64        // шаг модели за кадр не больше 64 мс: после паузы вкладки разгон не перепрыгивает
export const NO_WAVE = '999dvh'

export const reducedMotion = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false } }

/** Позиция волны в координатах слоя ::before (он выше колонки на PERIOD и сдвинут на y): wave 0…1 → dvh */
export const waveLocal = (wave, y) => `${(-WAVE_PAD + wave * (100 + 2 * WAVE_PAD) + PERIOD - y).toFixed(2)}dvh`

export function createConveyorDrive({
  root, still = false, now = () => globalThis.performance.now(),
  raf = f => globalThis.requestAnimationFrame(f), caf = i => globalThis.cancelAnimationFrame(i),
  observe = (el, fn) => { const o = new globalThis.MutationObserver(fn); o.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-held', 'data-lane'] }); return () => o.disconnect() },
}) {
  const cols = [...root.querySelectorAll('.wlLanes i')]
  const lanes = cols.map(createLane)
  const shown = cols.map(() => ({}))
  let armed = cols.map(() => false), pills = cols.map(() => 0)
  let id = null, last = 0, paused = false

  const put = (i, name, value) => {
    if (shown[i][name] === value) return
    shown[i][name] = value
    cols[i].style.setProperty(name, value)
  }
  const draw = (i, look) => {
    put(i, '--run-y', `${look.y.toFixed(2)}dvh`)
    put(i, '--run-a', look.a.toFixed(3))
    put(i, '--run-w', look.wave == null || still ? NO_WAVE : waveLocal(look.wave, look.y))
  }
  const frame = ts => {
    id = null
    const dt = Math.min(MAX_DT, Math.max(0, ts - last)); last = ts
    lanes.forEach((L, i) => { draw(i, laneLook(stepLane(L, dt, { armed: armed[i], pills: pills[i], still }))) })
    if (!settled(lanes) && !paused) id = raf(frame)
  }
  const wake = () => { if (id === null && !paused && cols.length) { last = now(); id = raf(frame) } }
  const recount = () => {
    pills = cols.map(() => 0)
    for (const el of root.querySelectorAll('.wlPill[data-held]')) { const k = Number(el.dataset.lane); if (k >= 0 && k < pills.length) pills[k] += 1 }
    wake()
  }
  const stopObserving = observe(root, recount)

  return {
    /** Команда игры: строка '101' — на каких дорожках сейчас можно ехать (wordLaneConveyorStart.armedLanes) */
    setArmed(str) { armed = cols.map((_, i) => str?.[i] === '1'); recount() },
    /** Пауза игры: привод стоит (кадры не идут, состояние сохраняется), снятие — продолжает */
    setPaused(on) { paused = !!on; if (paused) { if (id !== null) { caf(id); id = null } } else wake() },
    dispose() { if (id !== null) caf(id); id = null; stopObserving() },
    /** Для тестов и отладки */
    state: () => ({ phases: lanes.map(L => L.phase), running: id !== null, pills: [...pills], armed: [...armed] }),
    frame,
  }
}
