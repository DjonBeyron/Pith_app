// Кадры шкалы экзамена «Шкала памяти» (вынесено из RaceBossScale.jsx, v3.3.375: компонент — разметка, здесь — работа по кадрам; узлы приходят снаружи, поэтому логика проверяется тестом без браузера).
// stage — сцена игры (.wlStage), field — поле пилюль (.wlField); box / line / pillEl / dLine / marks — ref-ы узлов шкалы; clock — ref { paused, onZone, demo }. → функция остановки.
import { setBossZoneNow, setBossWonZone, setBossZoneIdle, setBossZoneProbe, setBossSeen } from './bossZoneNow.js'
import { createFollower, flightOf } from './bossFollow.js'
import { ZONE_RU } from './examLog.js'
import { pLog } from '../../../shared/lib/debug.js'
import { takeBossAnswerAt } from './bossAnswer.js'
import { zoneAt, trackStep, lineOn, zoneRgb, marksStep, nextPill, fadeProgress, demoCaption } from './bossScale.js'
import { frameTick, frameCancel } from '../../player/modules/rotate-phone/gameFrame.js' // общий цикл кадров игры: один requestAnimationFrame на все циклы

export function startScaleDrive({ stage, field, box, line, pillEl, dLine, marks, clock }) {
  let raf = 0, tr = null, topShown = -1, blShown = -1, last = 0, fadedId = -1, exitId = -1 // exitId — пилюля, чья линия уже уходит слева направо;
  let fd = { id: null, from: null, p: 1 } // выцветание маркера последнего законченного слова (фиолетовый → серый, пока следующая пилюля не станет видна целиком)
  let lost = -1 // слово, кончившееся без верного ответа: его треугольник гаснет у низа шкалы
  let slots = [] // маркеры слов (bossScale.marksStep): у каждого слова свой, живых не больше двух
  // v3.3.375 (владелец, слабый Android: «линия под пилюлей не кадр в кадр», «сказал в красной, а пилюля улетела жёлтая»). (1) Линию и треугольник слова в работе везёт композитор теми же часами, что пилюлю (bossFollow.js),
  // JS положение по кадрам не пишет. (2) Слово ПРИНЯТО для шкалы — когда пилюля ВСТАЛА (заливка доехала, хлопок, data-rise), а не в кадре зачёта (data-lock): между ними пилюля ехала вниз ещё ≈ 0,1 с (LOCK_MS),
  // а линия уже стояла выше её низа. Линия, треугольник, цвет рамки, зона для Мии, трофеи угла и журнал берутся одним вызовом accept() из одного числа — где низ пилюли в кадре остановки.
  const follow = createFollower(), half = new WeakMap(), shown = { y: null, op: null, zone: null, mark: [] }
  let Hn = 0, tried = -1, paint = null
  const RGB_RU = { '120, 230, 150': ZONE_RU.fast, '255, 200, 70': ZONE_RU.mid, '255, 96, 80': ZONE_RU.slow }
  const accept = y => {
    const z = zoneAt(Math.min(1, Math.max(0, y / Hn))), pe = tr.el, pct = Math.round(Math.min(1, Math.max(0, y / Hn)) * 100)
    tr = { ...tr, y, done: true, at: tr.done ? tr.at : performance.now(), won: true }
    takeBossAnswerAt(); follow.release()
    const ty = Math.min(Hn, Math.max(0, y)).toFixed(1), ln = line.current, m = slots.find(x => x.id === tr.id && !x.dying), me = m && marks.current[m.k] // привод снят — место остановки пишется тут же: линия и треугольник не мелькают у верха шкалы до кадра шкалы
    if (ln) { shown.y = ty; ln.style.transform = `translate3d(0, ${ty}px, 0)` }
    if (me) { m.y = Math.min(1, Math.max(m.y, y / Hn)); shown.mark[m.k] = `0 ${(m.y * Hn).toFixed(1)}px`; me.style.translate = shown.mark[m.k] }
    if (pe.dataset.bz !== z) pe.dataset.bz = z
    pe.setAttribute('data-bzf', '') // цвет зоны закрепляется на рамке сразу; жидкость — всегда цвета Пита (race-boss.css)
    paint = { el: pe, z, pct }
    setBossSeen({ pct }); setBossWonZone(z); clock.current.onZone?.(z) // зона слова уходит в машину Мии (не принятые — красные по событиям движка)
    return z
  }
  setBossZoneProbe(commit => { // трофеи угла спрашивают зону в кадре, где пилюля встала (useWordLaneFlow.win → bossXp), — раньше кадра шкалы: слово фиксируется здесь же, по часам полёта пилюли (без чтения вёрстки)
    if (!tr || tr.done || !(Hn > 0) || !tr.el.hasAttribute('data-lock') || tr.el.hasAttribute('data-rise')) return null
    const y = Math.max(tr.y, (follow.pill() === tr.el ? follow.y() : null) ?? tr.el.getBoundingClientRect().bottom - (box.current?.getBoundingClientRect().top ?? 0))
    return commit ? accept(y) : zoneAt(Math.min(1, Math.max(0, y / Hn)))
  })
  const frame = now => {
    raf = frameTick(frame)
    const dt = last ? Math.min(100, now - last) : 0
    last = now
    if (clock.current.paused) { follow.sync(); return } // пауза: полёт пилюли стоит — линия стоит с ним
    const lanes = stage.querySelector('.wlLanes'), s0 = stage.getBoundingClientRect(), f = field.getBoundingClientRect()
    const top = Math.round((lanes ? lanes.getBoundingClientRect().top : f.top + 80) - s0.top) // верх ленты: под кнопками (на ленте дорожки сдвинуты на 80 px)
    if (box.current && top !== topShown) { topShown = top; box.current.style.top = `${top}px` }
    const b = box.current?.getBoundingClientRect(), H = b?.height ?? 0
    const edge = lanes?.querySelector('.wlLaneEdge'), bl = edge && b ? Math.max(0, Math.round(edge.getBoundingClientRect().right - b.left)) : 0 // левая граница конвейера: линия упирается в его вертикальную полосу и за неё не заходит
    if (box.current && bl !== blShown) { blShown = bl; box.current.style.setProperty('--bl', `${bl}px`) }
    if (!(H > 0)) return
    const dm = clock.current.demo // пример на церемонии: путь пилюли по плану
    if (dm && pillEl.current && dLine.current) {
      dm.t += dt
      const t = Math.min(dm.t, dm.plan.total), p = dm.plan.pos(t), y = p * H
      pillEl.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`; pillEl.current.style.setProperty('--pc', zoneRgb(p).join(', '))
      const cap = demoCaption(dm.plan, t); if (pillEl.current.textContent !== cap) pillEl.current.textContent = cap // короткий смысл слов Мии о зоне: «Знаю» / «Вспоминаю» / «Не помню»
      const ln = dLine.current; ln.style.transform = `translate3d(0, ${Math.min(H, Math.max(0, y)).toFixed(1)}px, 0)`; ln.dataset.zone = zoneAt(p)
      ln.style.opacity = p <= 0 || p >= 1 ? '0' : Math.min(1, 0.15 + p / 0.2).toFixed(2) // появляется на касании плавно, у нижней отметки пропадает
    }
    if (paint) { const c = /(\d+), (\d+), (\d+)/.exec(globalThis.getComputedStyle?.(paint.el)?.borderTopColor ?? '')?.slice(1).join(', '); pLog(`[exam] шкала: «${paint.el.getAttribute('data-cap') ?? ''}» — линия на ${paint.pct} % шкалы, зона ${ZONE_RU[paint.z]}, рамка пилюли на экране ${RGB_RU[c] ?? `rgb(${c})`}`); paint = null } // сверка «что посчитано / что нарисовано»: в начале кадра стили чистые, чтение дешёвое; раз на слово
    Hn = H
    const pills = [...field.querySelectorAll('.wlPill[data-wide]')].map(el => { // locked — пилюля ВСТАЛА (принята и взлетает, data-rise); принятая, но ещё доезжающая заливку (data-lock) — в работе: линия идёт за ней
      const r = el.getBoundingClientRect(), locked = el.hasAttribute('data-rise')
      if (!locked) half.set(el, r.height / 2) // у вставшей идёт хлопок (scale) — низ считаем от центра и прежней половины высоты
      return { el, h: r.height, top: r.top - b.top, bottom: (locked ? (r.top + r.bottom) / 2 + (half.get(el) ?? r.height / 2) : r.bottom) - b.top, locked, failed: el.hasAttribute('data-fail') }
    }).filter(p => p.h > 0)
    const was = tr
    tr = trackStep(tr, pills, H, now)
    if (tr && was !== tr && (tr.done || tr.id !== was?.id)) takeBossAnswerAt() // момент начала ответа (bossAnswer.js) шкалу больше не двигает (v3.3.349): пишется только в журнал, здесь — сброс
    // v3.3.349 (владелец: «треугольник скачет; он должен фиксироваться там, где была линия под пилюлей в момент, когда пилюля подтвердила верный ответ, — линия уходит вправо к линейке — и больше никуда не скакать»): линия, треугольник и зона остаются РОВНО там, где слово принято; перенос на момент начала голоса (v3.3.344) убран
    if (tr && tr.done && was !== tr && !pills.find(p => p.el === tr.el)?.locked) lost = tr.id // «не успел» / ушло вниз: верного ответа не было
    const el = line.current
    if (!el) return
    if (tr && tr.done && was !== tr && pills.find(p => p.el === tr.el)?.locked) accept(tr.y) // пилюля встала, а трофеи зону не спрашивали (запасной путь): то же самое из кадра шкалы
    if (tr && !tr.done) { // привод линии — часы полёта пилюли (bossFollow.js)
      if (follow.pill() !== tr.el) { if (follow.on()) { follow.release(); shown.y = null } if (tried !== tr.id) { tried = tr.id; const fa = tr.el.hasAttribute('data-up') ? null : flightOf(tr.el); if (fa) { follow.start(tr.el, fa, tr.y, H); follow.add(el) } } }
      else if (!follow.step(tr.y)) { follow.release(); shown.y = null }
    } else if (follow.on()) { follow.release(); shown.y = null }
    for (const p of pills) { // пилюля красится в цвет зоны вместе с линией (data-bz → race-boss.css): зелёная с самого выезда из-за верхнего края, дальше по зоне линии; принятая / не успевшая остаётся в цвете своей зоны
      const mine = tr && !tr.done && p.el === tr.el
      const want = mine ? zoneAt(Math.min(1, Math.max(0, tr.y / H))) : p.locked || p.failed ? null : 'fast'
      if (want && p.el.dataset.bz !== want) p.el.dataset.bz = want
      if (p.locked && !p.el.hasAttribute('data-bzf')) { // слово принято: пилюля улетает цветом зоны, в которой её приняли, — цвет закрепляется сразу (без плавного перехода от прежней зоны)
        const z = tr && tr.el === p.el ? zoneAt(Math.min(1, Math.max(0, tr.y / H))) : p.el.dataset.bz
        if (z && p.el.dataset.bz !== z) p.el.dataset.bz = z
        p.el.setAttribute('data-bzf', '')
      }
    }
    if (tr && !tr.done && tr.y >= H) fadedId = tr.id // у нижней отметки линия растворяется и для этой пилюли больше не появляется (после «не успел» она не моргает снова)
    const accepted = !!tr?.won
    if (accepted && exitId !== tr.id) { exitId = tr.id; el.dataset.exit = '' } else if (tr && !tr.done && el.dataset.exit !== undefined) delete el.dataset.exit // верный ответ: пилюля улетает вверх, а линия уходит слева направо с той же скоростью (CSS wlBossLineOut = RISE_DELAY_MS + RISE_MS, тот же easing)
    if (tr && !tr.done) setBossZoneNow(zoneAt(Math.min(1, Math.max(0, tr.y / H)))) // зона слова в работе: игра читает её при ответе (трофеи слова — по зоне, bossTrophies.js)
    else if (pills.some(p => !p.locked && !p.failed && p.bottom <= 0)) setBossZoneIdle() // следующая пилюля ещё не коснулась шкалы: ответ сейчас — зелёная зона (раньше здесь оставалась зона ПРОШЛОГО слова)
    const on = lineOn(tr, now) && tr.id !== fadedId && !(tr && !tr.done && tr.y >= H)
    const op = on ? (tr.done ? '1' : Math.min(1, 0.15 + tr.y / (H * 0.2)).toFixed(2)) : '0' // появляется плавно, чуть проявляясь на зелёной (прозрачность растёт на первых 20 % шкалы)
    if (op !== shown.op) { shown.op = op; el.style.opacity = op } // стиль пишется, только когда значение сменилось
    if (tr) {
      const y = Math.min(H, Math.max(0, tr.y)), ty = y.toFixed(1), z = zoneAt(y / H)
      if (!follow.has(el) && ty !== shown.y) { shown.y = ty; el.style.transform = `translate3d(0, ${ty}px, 0)` } // линию везёт композитор — JS положение не пишет; стоит (ответ принят, «не успел») — пишет один раз
      if (z !== shown.zone) { shown.zone = z; el.dataset.zone = z }
    }
    slots = marksStep(slots, { id: tr ? tr.id : null, y: tr ? Math.min(1, Math.max(0, tr.y / H)) : 0, now, drop: !!tr && tr.id === lost }) // слово взято в работу (линия коснулась шкалы) — у него маркер; он идёт за линией и замирает на ответе
    if (tr?.done && fd.id !== tr.id) fd = { id: tr.id, from: null, p: 0 } // слово закончено (принято / «не успел» / ушло вниз): маркер начинает выцветать
    if (fd.id != null && fd.p < 1) {
      const cur = tr && !tr.done && tr.id !== fd.id ? pills.find(x => x.el === tr.el) : nextPill(pills, H) // следующая пилюля: уже взятая линией или ближайшая к шкале
      if (cur) { if (fd.from == null) fd.from = cur.top; fd.p = Math.max(fd.p, fadeProgress(fd.from, cur.top)) }
    }
    marks.current.forEach((e, k) => { if (!e) return; const m = slots.find(x => x.k === k); e.style.opacity = m && !m.dying ? '1' : '0'; if (m) e.style.setProperty('--g', (m.id === fd.id ? fd.p : m.id < fd.id ? 1 : 0).toFixed(3)); const ride = !!m && !m.dying && !!tr && !tr.done && m.id === tr.id && follow.on(); if (ride) follow.add(e); else follow.drop(e); const my = m ? `0 ${(m.y * H).toFixed(1)}px` : null; if (m && (!ride || shown.mark[k] == null) && my !== shown.mark[k]) { shown.mark[k] = my; e.style.translate = my } e.toggleAttribute('data-set', !!m && fd.id != null && m.id <= fd.id) }) // слово закончено (ответ верный / неверный / «не успел») — маркер на месте, плавно крупнее на 20 % (CSS); место — свойством translate, а не transform: у зафиксированного маркера CSS-свойство scale 1,2 умножало сдвиг из transform, и треугольник вставал на 20 % НИЖЕ линии слова (на y × 1,2) — тот самый «скачок вниз» из замечаний владельца
  }
  raf = frameTick(frame)
  return () => { frameCancel(raf); follow.release(); setBossZoneProbe(null) }
}
