import { createLane, stepLane, laneLook, settled, retimeSpeed, slowRampMs, RUN_SPEED, SPEED_RAMP_MS, SLOW_RAMP_MIN_MS, SLOW_RAMP_MAX_MS, SLOW_CUT_MS } from './wordLaneConveyor.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { periodPx, shiftPx, pxText, viewOf, RACE_SPLIT } from './laneConveyorPx.js'

// Привод конвейера: один rAF на все три дорожки (по образцу scene/v2/whiskerDrive.js). Каждый кадр — шаг модели (wordLaneConveyor.js) для каждой дорожки и запись двух CSS-переменных в её колонку
// .wlLanes i: --run-y (сдвиг узора, px до пикселя устройства — едет transform ::before), --run-a (яркость — opacity слоя ::before, композитор без перерисовки; на «зажигании» её ведёт мигание, v3.3.101).
// v3.3.133: период узора --run-px (px, кратен пикселям устройства) пишет тоже привод — из той же высоты экрана, что и сдвиг (laneConveyorPx.js): шов на оборачивании не прыгает; высота кэшируется, resize — пересчёт.
// Стили — word-lane-lane-run.css. Запись только при изменении значения. Все дорожки встали (idle) — цикл засыпает сам; будят его команда (setArmed), появление / уход пилюль и снятие паузы. Команда '2' (акт репетиции идёт, v3.3.87): дорожка едет непрерывно, пока команда стоит, — без пилюль тоже (Пит говорит, ученик промахнулся, стадии сменяются); тормозит только когда команду сняли (граница акта) и летящие пилюли ушли.
// Пилюли на дорожке считаются по DOM: у взятой из пула пилюли стоит data-held, дорожка — data-lane (wordLanePool.take); give снимает data-held. Пилюли, стоящие на месте (data-still: «Дубль и зеркало» на дорожках, wordLaneMirrorScene.js), не считаются: дорожки под ними остановлены. MutationObserver на корне поля срабатывает только на эти признаки — движок пилюль (useWordLanePills) трогать не нужно. Слабое устройство (wl--lite) и reduced-motion (still): без движения и без мигания, только яркость (still уходит в модель). Пауза игры — привод стоит, состояние сохраняется.
// «Встряхни память» (v3.3.142): четвёртый знак команды 'h' (wordLaneConveyorStart.HOLD_CHAR) — игра идёт, дорожки между ступенями не тормозят, а держат ход (модель: hold); скорость следующей ступени
// (setSpeedHint) они набирают плавно за SPEED_RAMP_MS — журнал «[conveyor] ступень …: скорость X → Y за Z мс». Лента этапа «Фразы» (data-tape на корне игры, wordLaneTape.js): узор едет РОВНО со скоростью пилюли
// (множитель — скорость пилюли ступени, в том числе меньше 1), а не «не медленнее конвейера». Пауза в гонке — полная остановка: дорожки плавно тормозят до покоя (decel → idle), потом цикл засыпает;
// снятие паузы — дорожки, которые ехали до неё, «горячие» (L.warm): из покоя сразу разгон, без мигания «зажигания».
// Замедление между этапами (v3.3.173): ступень сменилась и множитель упал — дорожки тормозят не за 800 мс, а пока Пит говорит о следующем этапе (talk() — его занятость, мс; askMs из setSpeedHint),
// от SLOW_RAMP_MIN_MS до SLOW_RAMP_MAX_MS. Реплика зазвучала позже смены — замедление продлевается (не дольше MAX от начала), выехала новая пилюля — дотягивается за SLOW_CUT_MS. Лента «Фраз» и нить
// с узелками — те же колонки и та же модель: замедляются синхронно. Журнал: «… за Z мс (замедление под реплику, Пит говорит ещё M мс)», «… замедление продлено до Z мс …».
export const MAX_DT = 64        // шаг модели за кадр не больше 64 мс: после паузы вкладки разгон не перепрыгивает

export const reducedMotion = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export function createConveyorDrive({
  root, still = false, now = () => globalThis.performance.now(), log = pLog, talk = () => 0, // talk — сколько мс Пит ещё говорит (директор гонки: pitLeft)
  raf = f => globalThis.requestAnimationFrame(f), caf = i => globalThis.cancelAnimationFrame(i),
  observe = (el, fn) => { const o = new globalThis.MutationObserver(fn); o.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-held', 'data-lane', 'data-still', 'data-speed'] }); return () => o.disconnect() },
  view = viewOf, onResize = fn => { const g = globalThis, vv = g.visualViewport; g.addEventListener?.('resize', fn); vv?.addEventListener?.('resize', fn); return () => { g.removeEventListener?.('resize', fn); vv?.removeEventListener?.('resize', fn) } },
}) {
  const cols = [...root.querySelectorAll('.wlLanes i')]
  const host = root.closest?.('[data-race]') ?? null // корень игры «Гонки» (data-race, data-tape)
  const race = !!host // «Гонка с Питом»: дорожки независимы (ход ±4 %, своя фаза, узор «---|---:---»), wordLaneConveyor.js
  const tape = () => host?.hasAttribute?.('data-tape') === true // лента этапа «Фразы»: узор — со скоростью пилюли
  const lanes = cols.map((_, i) => createLane(race ? i : -1))
  const shown = cols.map(() => ({}))
  let vp = view(), P = 0 // vp — высота экрана и dpr (кэш), P — период узора в px (у гонки кратен RACE_SPLIT (12) пикселям устройства: шаг нити — целый пиксель)
  const measure = () => { vp = view(); P = lanes.length ? periodPx(lanes[0].per, vp.h, vp.dpr, race ? RACE_SPLIT : 1) : 0 }
  let armed = cols.map(() => false), keep = cols.map(() => false), pills = cols.map(() => 0)
  let id = null, last = 0, paused = false, hold = false
  let hint = null, hintKey = null, peak = 0 // «Гонка с Питом»: hint — скорость первой пилюли ближайшей стадии (дорожка набирает её ЗАРАНЕЕ, до выезда пилюли), peak — наибольшая скорость пилюль, виденных при этом hint
  let tapeV = null // лента: последняя скорость пилюль ступени (на паузе подсказки нет — держим её)
  const wanted = () => { // множитель скорости пунктира: пилюли разгона быстрее конвейера в speed раз; пунктир едет быстрее пропорционально, внутри стадии не откатывается между пилюлями
    if (!tape()) return Math.max(1, hint ?? 1, peak)
    if (hint != null) tapeV = hint
    return hint ?? (peak > 0 ? peak : tapeV ?? 1) // лента: ровно скорость пилюли (0,55 / 0,4 конвейера)
  }
  let aim = null, aimKey = null // множитель (и ступень), к которому дорожки шли на прошлом кадре: смена — строка журнала
  let ask = 0, slow = null, seen = 0 // ask — длина замедления, которую попросила сцена (setSpeedHint); slow — идёт замедление под реплику { t0, ms }; seen — сколько пилюль было на дорожках
  const said = () => Math.max(0, Number(talk()) || 0)
  const stage = () => `[conveyor] ступень ${hintKey ?? '—'}`
  const retime = (ms, line) => { lanes.forEach(L => retimeSpeed(L, ms)); log(line) }
  const follow = ts => { // замедление идёт: Пит говорит дольше — продлить (не дольше MAX от начала)
    const el = ts - slow.t0
    if (el >= slow.ms) { slow = null; return }
    if (slow.cut) return
    const pit = said(), want = Math.min(SLOW_RAMP_MAX_MS, Math.max(SLOW_RAMP_MIN_MS, el + pit))
    if (want > slow.ms + 100) { slow.ms = Math.round(want); retime(slow.ms - el, `${stage()}: замедление продлено до ${slow.ms} мс (Пит говорит ещё ${Math.round(pit)} мс)`) }
  }
  let waves = 0, waveEl = null // waves — сколько импульсов уже показала «волна скорости» (data-wave, word-lane-lane-run.css)

  const put = (i, name, value) => {
    if (shown[i][name] === value) return
    shown[i][name] = value
    cols[i].style.setProperty(name, value)
  }
  const draw = (i, look) => {
    put(i, '--run-px', pxText(P))
    put(i, '--run-y', pxText(shiftPx(look.y, lanes[i].per, P, vp.dpr))) // целые пиксели устройства: без пересэмплирования слоя; кадр без сдвига на пиксель — без записи
    put(i, '--run-a', look.a.toFixed(2)) // opacity слоя (word-lane-lane-run.css): шаг 0,01 — меньше записей на переходах, на глаз не виден
    if (!still && !race) put(i, '--run-dash', `${(2.2 * look.sy).toFixed(2)}dvh`) // импульс скорости: штрихи длиннее (до ×1,4); на слабом устройстве и при reduced-motion только яркость
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
    const stop = paused && race // пауза гонки: тормозим до покоя (пилюли на паузе стоят — их не считаем)
    const v = wanted()
    let ramp = SPEED_RAMP_MS
    if (v !== aim) {
      const moving = aim !== null && !stop && lanes.some(L => L.phase !== 'idle'), pit = said()
      slow = null
      if (moving && race && v < aim && hintKey !== aimKey) { ramp = slowRampMs(pit, ask); slow = { t0: ts, ms: ramp } } // этап сменился, скорость падает — замедление под реплику
      if (moving) log(`${stage()}: скорость ${(RUN_SPEED * aim).toFixed(1)} → ${(RUN_SPEED * v).toFixed(1)} dvh/с (×${aim.toFixed(2)} → ×${v.toFixed(2)}) за ${ramp} мс${tape() ? ', лента' : ''}${slow ? ` (замедление под реплику, Пит говорит ещё ${Math.round(pit)} мс)` : ''}`)
      aim = v
    } else if (slow) follow(ts)
    aimKey = hintKey
    lanes.forEach((L, i) => { draw(i, laneLook(stepLane(L, dt, stop ? { still, speed: v, ramp } : { armed: armed[i], keep: keep[i], pills: pills[i], still, speed: v, hold, ramp }))) })
    wave()
    if (!settled(lanes) && (!paused || race)) id = raf(frame)
  }
  const wake = () => { if (id === null && (!paused || (race && !settled(lanes))) && cols.length) { last = now(); id = raf(frame) } }
  const recount = () => {
    pills = cols.map(() => 0)
    for (const el of root.querySelectorAll('.wlPill[data-held]:not([data-still])')) { const k = Number(el.dataset.lane); if (k >= 0 && k < pills.length) pills[k] += 1; peak = Math.max(peak, Number(el.dataset.speed) || 1) }
    const n = pills.reduce((a, b) => a + b, 0)
    if (slow && !slow.cut && n > seen) { const el = last - slow.t0; if (slow.ms - el > SLOW_CUT_MS) { slow.ms = Math.round(el + SLOW_CUT_MS); slow.cut = true; retime(SLOW_CUT_MS, `${stage()}: выехала пилюля — замедление дотягивается за ${SLOW_CUT_MS} мс`) } } // пилюля уже на конечной скорости
    seen = n
    wake()
  }
  const stopObserving = observe(root, recount)
  const redraw = () => { measure(); lanes.forEach((L, i) => draw(i, laneLook(L))) }
  const stopResize = onResize(redraw)
  redraw() // период и покой в px сразу, до первого кадра

  return {
    /** Команда игры: строка '101' — на каких дорожках сейчас можно ехать (wordLaneConveyorStart.armedLanes); '2' вместо '1' — акт репетиции идёт, дорожка едет непрерывно, пока команда стоит (пилюли не нужны) */
    setArmed(str) { armed = cols.map((_, i) => str?.[i] === '1' || str?.[i] === '2'); keep = cols.map((_, i) => str?.[i] === '2'); hold = str?.[3] === 'h'; recount() },
    /** Скорость первой пилюли ближайшей стадии (множитель к конвейеру; null — стадия без разгона): дорожки плавно (SPEED_RAMP_MS) набирают её до выезда пилюли. Смена подсказки или стадии (key — номер стадии) обнуляет «виденный максимум».
     *  rampMs — сцена знает, сколько продлится переход (мс): при падении скорости на смене этапа замедление идёт не короче этого (в пределах SLOW_RAMP_MIN_MS … SLOW_RAMP_MAX_MS) */
    setSpeedHint(v, key = null, rampMs = 0) { const h = v > 0 ? v : null; ask = rampMs > 0 ? rampMs : 0; if (h === hint && key === hintKey) return; hint = h; hintKey = key; peak = 0; recount() },
    /** Пауза игры: привод стоит (кадры не идут, состояние сохраняется), снятие — продолжает; в гонке — дорожки сначала плавно тормозят до покоя */
    setPaused(on) {
      const was = paused; paused = !!on
      if (paused && !was && race) lanes.forEach(L => { if (L.phase !== 'idle') L.warm = true }) // ехали до паузы — после неё без «зажигания»
      if (paused && !race) { if (id !== null) { caf(id); id = null } } else wake()
    },
    dispose() { if (id !== null) caf(id); id = null; stopObserving(); stopResize() },
    /** Для тестов и отладки */
    state: () => ({ phases: lanes.map(L => L.phase), running: id !== null, speed: wanted(), slow: slow ? { ...slow } : null, v: lanes.map(L => L.v), pills: [...pills], armed: [...armed], keep: [...keep], hold, warm: lanes.map(L => L.warm), tape: tape() }),
    frame,
  }
}
