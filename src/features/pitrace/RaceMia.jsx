import { useEffect, useMemo, useRef, useState } from 'react'
import { renderTree } from '../scene/v2/renderTree.js'
import { buildMiaCat, MIA_FACES } from './mia/miaCat.js'
import { useMiaLife } from '../player/modules/rotate-phone/useMiaLife.js'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { createBox, ART } from './mia/boxArt.js'
import { arrivalAt, leaveAt, flightPath, talkLevel } from './mia/miaMotion.js'
import { layoutOf, artMatrix, toScene, poseApply, poseSvg, poseOfMotion, miaCss, MIA_W, MIA_H } from './mia/miaLayout.js'

// Эпизод «Мия» поверх сцены игры (.wlStage, прототип 2026-11-14): картонная коробка падает на голову Пита (его голова скрыта, в прорези коробки — глаза Пита, совмещённые
// с настоящими), Мия запрыгивает на крышку из-за экрана, коробка прогибается; пока Пит говорит (рот его головы живёт по озвучке), из краёв прорези идут звуковые линии —
// замена рта. Три верных подряд — Мия присаживается и отпрыгивает с коробкой в лапах за правый край, голова Пита возвращается. Состояние ведёт чистая машина (mia/raceMia.js):
// компонент рисует его в своём ритме (rAF, часы стоят на паузе игры). Реплики идут очередью mia/miaSpeech.js (звук голосом Мии из слота или, если не озвучена, подпись caption над Мией).
// Ничего не монтируется и не считает, пока Мии нет (phase 'off'): коробка и спрайт появляются с её приходом и убираются после ухода.
export default function RaceMia({ mia, caption = null, talk = null, paused = false }) {
  const [gone, setGone] = useState(-1)                          // at прихода, чей уход (анимация) уже доигран: после него коробку и спрайт убираем
  const live = mia.phase === 'in' || (mia.phase === 'out' && gone !== mia.at)
  const host = useRef(null), poseG = useRef(null), artG = useRef(null), catEl = useRef(null), miaEl = useRef(null)
  useMiaLife(miaEl, live, talk)                                    // Мия в тишине: взгляд, усы, смена лица
  const clock = useRef({ arr: 0, lv: 0, mode: 'off', paused })
  const atRef = useRef(mia.at)
  useEffect(() => { atRef.current = mia.at }, [mia.at])
  const miaTree = useMemo(() => (live ? renderTree(buildMiaCat(isWeakDevice() ? MIA_FACES.slice(0, 1) : MIA_FACES)) : null), [live])
  useEffect(() => { clock.current.paused = paused }, [paused])

  // фаза машины → часы эпизода
  useEffect(() => {
    const c = clock.current
    if (mia.phase === 'in') { c.arr = (performance.now() - mia.at) / 1000 /* at — момент падения коробки (после реплики Пита): до него время отрицательное, коробки нет */; c.lv = 0; c.mode = 'arr' }
    else if (mia.phase === 'out' && c.mode === 'arr') { c.lv = 0; c.mode = 'lv' }
    else if (mia.phase === 'off') c.mode = 'off'
  }, [mia.phase, mia.at])

  // кадры, пока Мия на экране
  useEffect(() => {
    if (!live) return undefined
    const stage = host.current?.parentElement, cat = stage?.querySelector('.wlCat')
    if (!stage || !cat) return undefined
    catEl.current = cat
    const box = createBox(); artG.current.appendChild(box.el)
    let raf = 0, last = performance.now(), L = null, M = null, talk = 0, n = 0, tt = 0
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
      if (!c.paused) { if (c.mode === 'arr') c.arr += dt; else if (c.mode === 'lv') c.lv += dt; tt += dt }
      if (n++ % 20 === 0 || !L) measure()
      if (!L || L.f <= 0) return
      const leaving = c.mode === 'lv', m = leaving ? leaveAt(c.lv) : arrivalAt(c.arr)
      const head = cat.querySelector(`[data-part="head"][data-face="${cat.getAttribute('data-face') || 'base'}"]`)
      talk = Math.max(talkLevel(head?.getAttribute('data-vis'), head?.getAttribute('data-mouth')), talk * 0.8)
      const tk = m.hideCat && m.shown && !leaving ? talk : 0
      box.update({ ...m.eyes, thNear: m.box.thNear, thFar: m.box.thFar, talk: tk, t: tt, live: true })
      const pose = poseOfMotion(m.box, L)
      pose.dx += 0.35 * Math.sin(2 * Math.PI * 22 * tt) * tk * L.f; pose.rot += 0.08 * Math.sin(2 * Math.PI * 17 * tt + 1) * tk // Пит говорит из коробки: дрожь минимальная (владелец 2026-11-14)
      const piv = toScene(M, ART.BOTTOM)
      poseG.current.setAttribute('transform', poseSvg(pose, piv))
      poseG.current.setAttribute('visibility', m.shown ? 'visible' : 'hidden') // до падения коробки (и после ухода) её не видно: без этого она мигала на месте за кадр до падения
      cat.style.visibility = m.hideCat ? 'hidden' : ''
      const mi = miaEl.current
      if (mi) {                                                  // Мия: прыжок из-за экрана → сидит на крышке (едет с коробкой) → уезжает с ней в лапах за экран
        const top = toScene(M, ART.TOP), seat = poseApply(pose, piv)(top), rest = [top[0], top[1] - 4 * L.f]
        let a = [seat[0], seat[1] - 4 * L.f], mr = m.mia
        if (mr.mode === 'flight') a = Object.values(flightPath(mr.u, [L.W + 150 * L.f, 0.55 * L.H], rest))
        mi.style.display = mr.mode === 'off' ? 'none' : 'block'
        if (mr.mode !== 'off') mi.style.transform = miaCss(a[0], a[1], L.f, mr.rot, mr.sx, mr.sy)
      }
      if (leaving && !m.shown) { c.mode = 'off'; setGone(g => (g === atRef.current ? g : atRef.current)) } // уход доигран: убираем (setState — в кадре rAF, не в эффекте)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); box.el.remove(); cat.style.visibility = '' }
  }, [live])

  return (
    <div ref={host} className="wlMia" data-live={live || undefined} aria-hidden="true" data-testid="race-mia">
      {live && (
        <>
          <svg className="wlMiaSvg"><g ref={poseG} visibility="hidden"><g ref={artG} /></g></svg>
          <div ref={miaEl} className="scn scn--v2 wlMiaCat" style={{ width: MIA_W, height: MIA_H, transformOrigin: '50% 93%', display: 'none', background: 'transparent', border: 'none', boxShadow: 'none' }}>
            <svg viewBox="0 0 200 240" width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}><g className="scn-cat">{miaTree}</g></svg>
          </div>
        </>
      )}
      {live && talk?.id === 'mia_push' && (
        <div key={talk.key} className="wlMiaSrc" style={{ '--src-ms': `${talk.ms}ms` }} data-testid="race-mia-src"><i /><i /><i /></div>
      )}
      {caption && <div key={caption.key} className="wlMiaCap" data-who={caption.who} data-testid="race-mia-cap">{caption.text}</div>}
    </div>
  )
}
