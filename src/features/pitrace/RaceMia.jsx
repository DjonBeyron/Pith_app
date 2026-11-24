import { useMiaTail } from './mia/useMiaTail.js'
import { wantStep } from './mia/miaTailWant.js'
import { restTail, driveTail, redLevelOf, pillsOf } from './mia/miaTailCalmDom.js'
import { slitOn, SLIT_TAIL_MS, peakTarget, smoothPeak } from './mia/miaSlit.js'
import { OFFSCREEN_IDS } from './mia/useMiaPlate.js' // реплики Мии из-за правого края (она ещё не прыгнула): справа дуги звука
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderTree } from '../scene/v2/renderTree.js'
import { buildMiaCat, MIA_FACES } from './mia/miaCat.js'
import { useMiaLife } from '../player/modules/rotate-phone/useMiaLife.js'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { createBox, ART } from './mia/boxArt.js'
import { arrivalAt, leaveAt, flightPath, talkLevel, soloLeave, panicAt, PANIC_LEN, SOLO, ARR } from './mia/miaMotion.js'
import { GAZE, readPills, pickPill, stepGaze } from './mia/miaGaze.js'
import { layoutOf, artMatrix, toScene, poseApply, poseSvg, poseOfMotion, miaCss, MIA_W, MIA_H } from './mia/miaLayout.js'

// Эпизод «Мия» поверх сцены игры (.wlStage, прототип 2026-11-14): картонная коробка падает на голову Пита (его голова скрыта, в прорези коробки — глаза Пита, совмещённые
// с настоящими), Мия запрыгивает на крышку из-за экрана, коробка прогибается; пока Пит говорит (рот его головы живёт по озвучке), из краёв прорези идут звуковые линии —
// замена рта. Три верных подряд — Мия присаживается и отпрыгивает с коробкой в лапах за правый край, голова Пита возвращается. Состояние ведёт чистая машина (mia/raceMia.js):
// компонент рисует его в своём ритме (rAF, часы стоят на паузе игры). Реплики идут очередью mia/miaSpeech.js (звук голосом Мии из слота или, если не озвучена, подпись caption над Мией).
// Ничего не монтируется и не считает, пока Мии нет (phase 'off'): коробка и спрайт появляются с её приходом и убираются после ухода.
const SEAT_DROP = 12 // Мия сидит ГЛУБЖЕ на крышке (лапы ниже центра верхней грани), а не на уголке (владелец 2026-11-15)

export default function RaceMia({ mia, caption = null, talk = null, alarm = null, stageKind = null, paused = false, onStuck = null, onTry = null, onBoxHit = null }) { // onStuck — Мия выпрыгнула одна (финал пройден плохо), onBoxHit — касание коробки на Пите (два подряд снимают её, mia/useMiaBoxFree.js); // alarm — { key }: слово финала в красной зоне, зрачки Пита в коробке сжимаются (испуг)
  const [gone, setGone] = useState(-1)                          // at прихода, чей уход (анимация) уже доигран: после него коробку и спрайт убираем
  const live = mia.phase === 'in' || (mia.phase === 'out' && gone !== mia.at)
  const host = useRef(null), poseG = useRef(null), artG = useRef(null), catEl = useRef(null), miaEl = useRef(null), hitEl = useRef(null), soloRef = useRef({ mode: null, at: 0, alone: false }), cbRef = useRef({}), hitAt = useRef(-1e9)
  const tailCtl = useRef({ want: false, cancel: null }), tailW = useRef({ want: false, seen: new Map() }), kindRef = useRef(stageKind) // хвост (mia/miaTailWant.js): лежит, дёргается на церемонии и когда пилюля дошла до красного уровня
  useEffect(() => { kindRef.current = stageKind }, [stageKind])
  const pleased = useMiaTail({ wins: mia.wins, streak: mia.streak, live }) // хвост: нервный, на верный ответ — прямой и пушистый (mia/useMiaTail.js, race-mia.css)
  useMiaLife(miaEl, live, talk)                                    // Мия в тишине: взгляд, усы, смена лица
  const clock = useRef({ arr: 0, lv: 0, mode: 'off', paused })
  const atRef = useRef(mia.at), jumpRef = useRef(null), alarmAt = useRef(-1e9), talkRef = useRef(null), slit = useRef(false), peak = useRef({ v: 0, q: 0 })
  useEffect(() => { soloRef.current = { mode: mia.solo, at: mia.soloAt, alone: !!mia.alone }; cbRef.current = { onStuck, onTry } }, [mia.solo, mia.soloAt, mia.alone, onStuck, onTry])
  useEffect(() => { talkRef.current = talk ? { id: talk.id, until: performance.now() + (talk.ms ?? 2500) + SLIT_TAIL_MS } : null }, [talk]) // щель держится, пока реплика звучит (не дольше её длины)
  const alarmKey = alarm?.key ?? null
  useEffect(() => { if (alarmKey != null) alarmAt.current = performance.now() }, [alarmKey]) // красное слово: отметка времени испуга Пита
  useEffect(() => { atRef.current = mia.at; jumpRef.current = mia.jump }, [mia.at, mia.jump])
  const miaTree = useMemo(() => (live ? renderTree(buildMiaCat(isWeakDevice() ? MIA_FACES.slice(0, 1) : MIA_FACES)) : null), [live])
  useEffect(() => { clock.current.paused = paused }, [paused])

  // фаза машины → часы эпизода
  useEffect(() => {
    const c = clock.current
    if (mia.phase === 'in') { c.arr = (performance.now() - mia.at) / 1000 /* at — момент падения коробки (после реплики Пита): до него время отрицательное, коробки нет */; c.lv = 0; c.mode = 'arr' }
    else if (mia.phase === 'out' && ['arr', 'solo', 'rave', 'stuck'].includes(c.mode)) { c.lv = 0; c.mode = 'lv' } // коробка со снятия (alone) отлетает без Мии
    else if (mia.phase === 'off') c.mode = 'off'
  }, [mia.phase, mia.at])

  // кадры, пока Мия на экране
  useEffect(() => {
    if (!live) return undefined
    const stage = host.current?.parentElement, cat = stage?.querySelector('.wlCat')
    if (!stage || !cat) return undefined
    catEl.current = cat
    const box = createBox(); artG.current.appendChild(box.el)
    let tailInit = false
    const later = (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id) }
    let raf = 0, last = performance.now(), L = null, M = null, talk = 0, n = 0, tt = 0, gz = { look: 0, w: 0 }, gzPill = null, talkUntil = 0 // gz — взгляд на пилюлю (mia/miaGaze.js)
    const measure = () => {
      const s = stage.getBoundingClientRect(), c = cat.getBoundingClientRect()
      L = layoutOf({ stageW: s.width, stageH: s.height, catX: c.x - s.x, catY: c.y - s.y, catW: c.width, catH: c.height }, ART.PER_EYE)
      M = artMatrix(L, ART.EYE_MID)
      artG.current.setAttribute('transform', `matrix(${M.join(' ')})`)
    }
    const frame = now => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const c = clock.current
      const sp = soloRef.current
      if (sp.mode === 'keep' && c.mode === 'arr' && !c.paused && performance.now() >= sp.at) { c.mode = 'solo'; c.sl = 0; c.tried = false; c.tryEnd = 0 } // «Допрос» с ошибками: Мия договорила и выпрыгивает ОДНА, коробка остаётся на Пите
      if (!c.paused) { if (c.mode === 'lv') c.lv += dt; else { c.arr += dt; if (c.mode === 'solo') c.sl += dt; else if (c.mode === 'rave') c.rv += dt }; tt += dt }
      if (n++ % 20 === 0 || !L) measure()
      if (!L || L.f <= 0) return
      const leaving = c.mode === 'lv', m = leaving ? leaveAt(c.lv) : arrivalAt(c.arr, jumpRef.current ?? ARR.JUMP)
      const head = cat.querySelector(`[data-part="head"][data-face="${cat.getAttribute('data-face') || 'base'}"]`)
      talk = Math.max(talkLevel(head?.getAttribute('data-vis'), head?.getAttribute('data-mouth')), talk * 0.8)
      const tk = m.hideCat && m.shown && !leaving ? talk : 0
      const sc = (now - alarmAt.current) / 1000, fear = sc < 0 || sc > 1.6 ? 0 : sc < 0.12 ? sc / 0.12 : sc < 0.9 ? 1 : 1 - (sc - 0.9) / 0.7 // испуг: зрачки быстро сжимаются, держатся, медленно отпускают
      if (n % 4 === 0) gzPill = c.mode === 'lv' ? null : pickPill(readPills(stage)) // следим за пилюлей в середине её падения (30…70 % ленты), в остальное время глаза живут сами
      if (tk > 0.04) talkUntil = now + 350 // Пит говорит — смотрит прямо (по перспективе чуть влево); паузы между слогами не считаются концом речи
      gz = stepGaze(gz, { pill: gzPill, talking: now < talkUntil && !leaving, dt: c.paused || leaving ? 0 : dt })
      const rave = c.mode === 'rave' ? panicAt(c.rv) : null // метание после ухода Мии
      box.update({ ...m.eyes, look: (m.eyes.look ?? 0) * (1 - gz.w) + gz.look * GAZE.EYE_PART * (leaving ? 0 : 1) + (rave ? 5 * rave.vn : 0) + (fear ? Math.sin(sc * 38) * 1.6 * fear : 0), gaze: leaving ? 0 : gz.look / GAZE.MAX, scale: (m.eyes.scale ?? 1) * (rave ? 1 + 0.1 * Math.abs(rave.vn) : 1), pupil: (m.eyes.pupil ?? 1) * (1 - 0.58 * fear), thNear: m.box.thNear, thFar: m.box.thFar, talk: tk, t: tt, live: true })
      const pose = poseOfMotion(m.box, L)
      if (rave) { pose.dx += rave.x * L.f; pose.rot += rave.vn * 7; pose.sx *= 1 + 0.04 * Math.abs(rave.vn) } // Пит мечется из стороны в сторону, как при падении коробки (miaMotion.panicAt)
      if (c.mode === 'stuck') { const k = Math.max(0, 1 - (now - hitAt.current) / 280); pose.dx += 3.4 * k * Math.sin(2 * Math.PI * 21 * tt) * L.f; pose.rot += 0.9 * k * Math.sin(2 * Math.PI * 17 * tt + 1) } // стоит ровно по центру; на касание коробка вздрагивает
      pose.dx += 0.35 * Math.sin(2 * Math.PI * 22 * tt) * tk * L.f; pose.rot += 0.08 * Math.sin(2 * Math.PI * 17 * tt + 1) * tk // Пит говорит из коробки: дрожь минимальная (владелец 2026-11-14)
      const piv = toScene(M, ART.BOTTOM)
      poseG.current.setAttribute('transform', poseSvg(pose, piv))
      poseG.current.setAttribute('visibility', m.shown ? 'visible' : 'hidden') // до падения коробки (и после ухода) её не видно: без этого она мигала на месте за кадр до падения
      cat.style.visibility = m.hideCat ? 'hidden' : ''
      const mi = miaEl.current
      if (mi) {                                                  // Мия: прыжок из-за экрана → сидит на крышке (едет с коробкой) → уезжает с ней в лапах за экран
        const top = toScene(M, ART.TOP), seat = poseApply(pose, piv)(top), rest = [top[0], top[1] + SEAT_DROP * L.f]
        let a = [seat[0], seat[1] + SEAT_DROP * L.f], mr = m.mia
        if (mr.mode === 'flight') a = Object.values(flightPath(mr.u, [L.W + 150 * L.f, 0.55 * L.H], rest))
        if (c.mode === 'solo') { const so = soloLeave(c.sl); mr = { mode: 'seat', rot: so.rot, sx: so.sx, sy: so.sy }; a = Object.values(flightPath(so.u, rest, [L.W + 170 * L.f, 0.28 * L.H], 0.14)); if (!c.tried && c.sl >= SOLO.TRY_AT) { c.tried = true; c.tryEnd = c.arr + (cbRef.current.onTry?.() ?? 0) / 1000 + SOLO.AFTER_TRY } if (so.done) { c.mode = 'rave'; c.rv = 0 } } // Пит «Эй, ты куда?…» — ПАРАЛЛЕЛЬНО прыжку Мии и тряске коробки, а не после них (владелец: «тишина 2,9 с — анимация без речи»)
        else if (c.mode === 'rave' || c.mode === 'stuck' || (leaving && soloRef.current.alone)) mr = { mode: 'off' } // Мии нет: коробка одна (ждёт касаний / отлетает)
        mi.style.display = mr.mode === 'off' ? 'none' : 'block'
        if (!tailInit) { restTail(mi); tailInit = true } // хвост лежит на кадре 1, пока не позовут
        if (n % 3 === 0) { const kind = kindRef.current, s0 = stage.getBoundingClientRect(), round = kind === 'round'; tailW.current = wantStep(tailW.current, { kind, shown: mr.mode !== 'off' && !leaving, pills: round ? pillsOf(stage, s0) : [], redY: round ? redLevelOf(stage, s0) : 0 }); driveTail(mi, tailCtl.current, tailW.current.want, later) }
        const tk0 = talkRef.current, sl = slitOn(tk0 && now < tk0.until ? tk0.id : null, mr.mode); if (sl !== slit.current) { slit.current = sl; mi.toggleAttribute('data-slit', sl) } // зрачок-щель: в прыжке и на колких репликах (mia/miaSlit.js)
        let pk = 0 // пик речи: широкий рот → зрачок плавно шире (mia/miaSlit.js)
        if (tk0 && now < tk0.until) { const h = [...mi.querySelectorAll('[data-part="head"]')].find(x => x.style.display !== 'none'); pk = peakTarget(talkLevel(h?.getAttribute('data-vis'), h?.getAttribute('data-mouth'))) }
        peak.current.v = smoothPeak(peak.current.v, pk); const pq = Math.round(peak.current.v * 10) / 10
        if (pq !== peak.current.q) { peak.current.q = pq; mi.style.setProperty('--peak', String(pq)) }
        if (mr.mode !== 'off') mi.style.transform = miaCss(a[0], a[1], L.f, mr.rot, mr.sx, mr.sy)
      }
      if (c.mode === 'rave' && c.rv >= PANIC_LEN + SOLO.SETTLE && c.arr >= (c.tryEnd ?? 0)) { c.mode = 'stuck'; cbRef.current.onStuck?.() } // Пит остановился по центру И договорил «Эй, ты куда?…» — только теперь просит снять коробку
      const he = hitEl.current // зона касаний по коробке (пока Пит просит помочь): по её настоящему прямоугольнику на экране
      if (he && poseG.current && host.current && n % 3 === 0) { const r = box.el.getBoundingClientRect(), h = host.current.getBoundingClientRect(), x0 = Math.max(r.left, h.left), y0 = Math.max(r.top, h.top), x1 = Math.min(r.right, h.right), y1 = Math.min(r.bottom, h.bottom); Object.assign(he.style, { left: `${x0 - h.left}px`, top: `${y0 - h.top}px`, width: `${Math.max(0, x1 - x0)}px`, height: `${Math.max(0, y1 - y0)}px` }) } // только видимая часть коробки (низ коробки может уходить за экран)
      if (leaving && !m.shown) { c.mode = 'off'; setGone(g => (g === atRef.current ? g : atRef.current)) } // уход доигран: убираем (setState — в кадре rAF, не в эффекте)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); tailCtl.current.cancel?.(); tailCtl.current = { want: false, cancel: null }; tailW.current = { want: false, seen: new Map() }; box.el.remove(); cat.style.visibility = ''; slit.current = false }
  }, [live])

  return (
    <>
    <div ref={host} className="wlMia" data-live={live || undefined} aria-hidden="true" data-testid="race-mia">
      {live && (
        <>
          <svg className="wlMiaSvg"><g ref={poseG} visibility="hidden"><g ref={artG} /></g></svg>
          <div ref={miaEl} className="scn scn--v2 wlMiaCat" data-tail={pleased ? 'pleased' : undefined} data-paused={paused || undefined} style={{ width: MIA_W, height: MIA_H, transformOrigin: '50% 93%', display: 'none', background: 'transparent', border: 'none', boxShadow: 'none' }}>
            <svg viewBox="0 0 200 240" width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}><g className="scn-cat">{miaTree}</g></svg>
          </div>
        </>
      )}
      {live && OFFSCREEN_IDS.includes(talk?.id) && (
        <div key={talk.key} className="wlMiaSrc" style={{ '--src-ms': `${talk.ms}ms` }} data-testid="race-mia-src"><i /><i /><i /></div>
      )}
      {caption && <div key={caption.key} className="wlMiaCap" data-who={caption.who} data-testid="race-mia-cap">{caption.text}</div>}
    </div>
    {live && mia.solo === 'stuck' && <div ref={hitEl} className="wlMiaHit" role="button" aria-label="Коробка на Пите: проведи пальцем или тапни два раза" data-testid="race-mia-hit" onPointerDown={e => { e.preventDefault(); hitAt.current = performance.now(); onBoxHit?.() }} />}
    </>
  )
}
