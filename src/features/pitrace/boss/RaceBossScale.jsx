import { useEffect, useRef } from 'react'
import { setBossZoneNow, setBossWonZone, setBossZoneIdle } from './bossZoneNow.js'
import { takeBossAnswerAt } from './bossAnswer.js'
import { zoneAt, ZONES, EDGES, TICKS, spanOf, trackStep, lineOn, zoneRgb, marksStep, nextPill, fadeProgress, demoCaption, demoSync } from './bossScale.js'
import { frameTick, frameCancel } from '../../player/modules/rotate-phone/gameFrame.js' // общий цикл кадров игры: один requestAnimationFrame на все циклы

// Шкала финала «Шкала памяти» поверх сцены игры (.wlStage; владелец 2026-11-15): справа вертикальная линейка с рисками цвета зоны и тусклым полупрозрачным фоном зон (зелёная 45 %, жёлтая 35 %, красная 20 % длины), без цифр.
// Линейка идёт от верха ленты (под кнопками паузы и админа) до низа с отступом под скругление экрана. Через все дорожки идёт тонкая горизонтальная линия — от «ствола» линейки поверх рисок, к левому краю утончается от края
// пилюли: она появляется в миг, когда нижний край пилюли касается верха линейки (плавно проявляясь на зелёной зоне), дальше идёт за этим краем и мгновенно меняет цвет в зоне другого цвета; у нижней отметки быстро растворяется
// и для этой пилюли больше не появляется. Ответ принят — пилюля улетает вверх, а линия уходит слева направо с той же скоростью (CSS wlBossLineOut), зона слова уходит в onZone('fast' | 'mid' | 'slow'). У каждого слова свой фиолетовый
// треугольник-маркер (острием вправо, остриё на «стволе» линейки, глубоко в ней): он идёт за линией своего слова вниз и замирает на месте ответа; живых не больше двух — когда выходит третье слово, самый старый плавно гаснет. Пилюля, которую толкает линия, красится в цвет зоны
// (data-bz, переход плавный). На церемонии Мия объясняет шкалу: flash — зона мигает на её слова о зонах; demo = { key, plan } — пример-пилюля со словом идёт по линейке по плану (bossScale.demoPlan: путь по длительности реплик, без пауз
// у Мии, скорость меняется плавно), цвет плавно по зонам, линия идёт за ней; конвейер идёт как в круге финала. Рисует по кадрам (rAF). live = false — ничего не рисует.
export default function RaceBossScale({ live, show = true, flash = null, demo = null, paused = false, onZone = null }) {
  const host = useRef(null), box = useRef(null), line = useRef(null), pillEl = useRef(null), dLine = useRef(null), marks = useRef([]), clock = useRef({ paused, onZone, demo })
  useEffect(() => { clock.current.paused = paused; clock.current.onZone = onZone }, [paused, onZone])
  const demoKey = demo?.key ?? null
  useEffect(() => { clock.current.demo = demo ? { plan: demo.plan, t: 0 } : null }, [demoKey]) // eslint-disable-line react-hooks/exhaustive-deps -- пример стартует с новой отметкой
  const markN = demo?.mark?.n ?? null
  useEffect(() => { const d = clock.current.demo; if (d && demo?.mark) d.t = demoSync(d.plan, demo.mark.k, d.t) }, [markN]) // eslint-disable-line react-hooks/exhaustive-deps -- следующая реплика объяснения РЕАЛЬНО началась: часы примера сверяются с началом её звука (озвучка другой длины пример не рассинхронит)
  useEffect(() => {
    if (!live) return undefined
    const stage = host.current?.parentElement, field = stage?.querySelector('.wlField')
    if (!stage || !field) return undefined
    let raf = 0, tr = null, topShown = -1, blShown = -1, last = 0, fadedId = -1, exitId = -1 // exitId — пилюля, чья линия уже уходит слева направо;
    let fd = { id: null, from: null, p: 1 } // выцветание маркера последнего законченного слова (фиолетовый → серый, пока следующая пилюля не станет видна целиком)
    let lost = -1 // слово, кончившееся без верного ответа: его треугольник гаснет у низа шкалы
    let slots = [] // маркеры слов (bossScale.marksStep): у каждого слова свой, живых не больше двух
    const frame = now => {
      raf = frameTick(frame)
      const dt = last ? Math.min(100, now - last) : 0
      last = now
      if (clock.current.paused) return
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
      const pills = [...field.querySelectorAll('.wlPill[data-wide]')].map(el => { const r = el.getBoundingClientRect(); return { el, h: r.height, top: r.top - b.top, bottom: r.bottom - b.top, locked: el.hasAttribute('data-lock'), failed: el.hasAttribute('data-fail') } }).filter(p => p.h > 0)
      const was = tr
      tr = trackStep(tr, pills, H, now)
      if (tr && was !== tr && (tr.done || tr.id !== was?.id)) takeBossAnswerAt() // момент начала ответа (bossAnswer.js) шкалу больше не двигает (v3.3.349): пишется только в журнал, здесь — сброс
      // v3.3.349 (владелец: «треугольник скачет; он должен фиксироваться там, где была линия под пилюлей в момент, когда пилюля подтвердила верный ответ, — линия уходит вправо к линейке — и больше никуда не скакать»): линия, треугольник и зона остаются РОВНО там, где слово принято; перенос на момент начала голоса (v3.3.344) убран
      if (tr && tr.done && was !== tr && !pills.find(p => p.el === tr.el)?.locked) lost = tr.id // «не успел» / ушло вниз: верного ответа не было
      const el = line.current
      if (!el) return
      if (tr && tr.done && was !== tr && pills.find(p => p.el === tr.el)?.locked) { const z = zoneAt(Math.min(1, Math.max(0, tr.y / H))); setBossWonZone(z); clock.current.onZone?.(z) } // слово принято: его зона уходит в машину Мии (не принятые — красные по событиям движка)
      for (const p of pills) { // пилюля красится в цвет зоны вместе с линией (data-bz → race-boss.css): зелёная с самого выезда из-за верхнего края, дальше по зоне линии; принятая / не успевшая остаётся в цвете своей зоны
        const mine = tr && !tr.done && p.el === tr.el
        const want = mine ? zoneAt(Math.min(1, Math.max(0, tr.y / H))) : p.locked || p.failed ? null : 'fast'
        if (want && p.el.dataset.bz !== want) p.el.dataset.bz = want
        if (p.locked && !p.el.hasAttribute('data-bzf')) { // слово принято: пилюля улетает цветом зоны, в которой её приняли, — цвет закрепляется сразу (без плавного перехода от прежней зоны)
          const z = tr && tr.el === p.el ? zoneAt(Math.min(1, Math.max(0, tr.y / H))) : p.el.dataset.bz
          if (z) p.el.dataset.bz = z; p.el.setAttribute('data-bzf', '')
        }
      }
      if (tr && !tr.done && tr.y >= H) fadedId = tr.id // у нижней отметки линия растворяется и для этой пилюли больше не появляется (после «не успел» она не моргает снова)
      const accepted = !!tr && tr.done && pills.find(p => p.el === tr.el)?.locked
      if (accepted && exitId !== tr.id) { exitId = tr.id; el.dataset.exit = '' } else if (tr && !tr.done && el.dataset.exit !== undefined) delete el.dataset.exit // верный ответ: пилюля улетает вверх, а линия уходит слева направо с той же скоростью (CSS wlBossLineOut = RISE_DELAY_MS + RISE_MS, тот же easing)
      if (tr && !tr.done) setBossZoneNow(zoneAt(Math.min(1, Math.max(0, tr.y / H)))) // зона слова в работе: игра читает её при ответе (трофеи слова — по зоне, bossTrophies.js)
      else if (pills.some(p => !p.locked && !p.failed && p.bottom <= 0)) setBossZoneIdle() // следующая пилюля ещё не коснулась шкалы: ответ сейчас — зелёная зона (раньше здесь оставалась зона ПРОШЛОГО слова)
      const on = lineOn(tr, now) && tr.id !== fadedId && !(tr && !tr.done && tr.y >= H)
      el.style.opacity = on ? (tr.done ? '1' : Math.min(1, 0.15 + tr.y / (H * 0.2)).toFixed(2)) : '0' // появляется плавно, чуть проявляясь на зелёной (прозрачность растёт на первых 20 % шкалы)
      if (tr) {
        const y = Math.min(H, Math.max(0, tr.y))
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`
        el.dataset.zone = zoneAt(y / H)
      }
      slots = marksStep(slots, { id: tr ? tr.id : null, y: tr ? Math.min(1, Math.max(0, tr.y / H)) : 0, now, drop: !!tr && tr.id === lost }) // слово взято в работу (линия коснулась шкалы) — у него маркер; он идёт за линией и замирает на ответе
      if (tr?.done && fd.id !== tr.id) fd = { id: tr.id, from: null, p: 0 } // слово закончено (принято / «не успел» / ушло вниз): маркер начинает выцветать
      if (fd.id != null && fd.p < 1) {
        const cur = tr && !tr.done && tr.id !== fd.id ? pills.find(x => x.el === tr.el) : nextPill(pills, H) // следующая пилюля: уже взятая линией или ближайшая к шкале
        if (cur) { if (fd.from == null) fd.from = cur.top; fd.p = Math.max(fd.p, fadeProgress(fd.from, cur.top)) }
      }
      marks.current.forEach((e, k) => { if (!e) return; const m = slots.find(x => x.k === k); e.style.opacity = m && !m.dying ? '1' : '0'; if (m) e.style.setProperty('--g', (m.id === fd.id ? fd.p : m.id < fd.id ? 1 : 0).toFixed(3)); if (m) e.style.translate = `0 ${(m.y * H).toFixed(1)}px`; e.toggleAttribute('data-set', !!m && fd.id != null && m.id <= fd.id) }) // слово закончено (ответ верный / неверный / «не успел») — маркер на месте, плавно крупнее на 20 % (CSS); место — свойством translate, а не transform: у зафиксированного маркера CSS-свойство scale 1,2 умножало сдвиг из transform, и треугольник вставал на 20 % НИЖЕ линии слова (на y × 1,2) — тот самый «скачок вниз» из замечаний владельца
    }
    raf = frameTick(frame)
    return () => frameCancel(raf)
  }, [live])

  const fl = flash ? { top: EDGES[ZONES.findIndex(z => z.id === flash.zone)] * 100, h: spanOf(flash.zone) * 100 } : null
  return (
    <div ref={host} className="wlBoss" data-live={live || undefined} data-show={(live && show) || undefined} aria-hidden="true" data-testid="race-boss-scale">
      {live && (
        <div ref={box} className="wlBossBox">
          {ZONES.map((z, i) => <i key={`${z.id}${flash?.zone === z.id ? flash.key : ''}`} className="wlBossZone" data-zone={z.id} data-flash={flash?.zone === z.id || undefined} style={{ top: `${EDGES[i] * 100}%`, height: `${spanOf(z.id) * 100}%`, '--flash-ms': `${flash?.ms ?? 2000}ms` }} />)}
          {TICKS.map(t => <b key={t.p} className="wlBossTick" data-zone={t.zone} data-major={t.major || undefined} data-border={t.border || undefined} style={{ top: `${t.p * 100}%` }} />)}
          {fl && <i key={flash.key} className="wlBossFlash" data-zone={flash.zone} style={{ top: `${fl.top}%`, height: `${fl.h}%`, '--flash-ms': `${flash.ms}ms` }} data-testid="race-boss-flash" />}
          {demo && (
            <>
              <i key={`p${demo.key}`} ref={pillEl} className="wlBossDemo" data-testid="race-boss-demo" />
              <i key={`l${demo.key}`} ref={dLine} className="wlBossLine" data-demo="" style={{ opacity: 0 }} />
            </>
          )}
          {[0, 1, 2].map(k => <i key={k} ref={e => { marks.current[k] = e }} className="wlBossMark" style={{ opacity: 0 }} data-testid="race-boss-mark" />)}
          <div ref={line} className="wlBossLine" data-zone="fast" style={{ opacity: 0 }} />
        </div>
      )}
    </div>
  )
}
