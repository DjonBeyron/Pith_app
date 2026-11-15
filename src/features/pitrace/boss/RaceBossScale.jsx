import { useEffect, useRef } from 'react'
import { zoneAt, ZONES, EDGES, TICKS, spanOf, trackStep, lineOn } from './bossScale.js'

// Шкала финала «Шкала памяти» поверх сцены игры (.wlStage; владелец 2026-11-15): справа вертикальная линейка с рисками цвета зоны и полупрозрачным фоном зон (зелёная 45 %, жёлтая 35 %, красная 20 % длины), без цифр.
// Линейка идёт от верха ленты (под кнопками паузы и админа) до низа с отступом под скругление экрана. Через все дорожки идёт горизонтальная линия — мягкая, с растушёванными краями: она появляется ровно в миг, когда
// нижний край пилюли касается верха линейки, дальше идёт за этим краем и мгновенно меняет цвет, когда доезжает до зоны другого цвета. Ответ принят или «не успел» — линия замирает, через HOLD_MS гаснет, а зона слова
// уходит в onZone('fast' | 'mid' | 'slow'): красные слова считает машина Мии. На церемонии Мия объясняет шкалу: flash — зона мигает полупрозрачной заливкой на её слова о зонах; demo — пример-пилюля со словом едет
// по линейке под её реплики (на каждой реплике свой отрезок пути), линия идёт за ней. show — шкалу видно. Рисует по кадрам (rAF), положение читает у пилюли (.wlPill[data-wide]). live = false — ничего не рисует.
export default function RaceBossScale({ live, show = true, flash = null, demo = null, word = '', paused = false, onZone = null }) { // demo — { key, ms }: пример на церемонии (одна ровная анимация)
  const host = useRef(null), box = useRef(null), line = useRef(null), clock = useRef({ paused, onZone })
  useEffect(() => { clock.current.paused = paused; clock.current.onZone = onZone }, [paused, onZone])
  useEffect(() => {
    if (!live) return undefined
    const stage = host.current?.parentElement, field = stage?.querySelector('.wlField')
    if (!stage || !field) return undefined
    let raf = 0, tr = null, topShown = -1 // tr — отслеживаемая пилюля (bossScale.trackStep), topShown — записанный верх рамки
    const frame = now => {
      raf = requestAnimationFrame(frame)
      if (clock.current.paused) return
      const lanes = stage.querySelector('.wlLanes'), s0 = stage.getBoundingClientRect()
      const top = Math.round((lanes ? lanes.getBoundingClientRect().top : field.getBoundingClientRect().top + 80) - s0.top) // верх ленты: под кнопками (на ленте дорожки сдвинуты на 80 px)
      if (box.current && top !== topShown) { topShown = top; box.current.style.top = `${top}px` }
      const b = box.current?.getBoundingClientRect(), H = b?.height ?? 0
      if (!(H > 0)) return
      const pills = [...field.querySelectorAll('.wlPill[data-wide]')].map(el => { const r = el.getBoundingClientRect(); return { el, h: r.height, top: r.top - b.top, bottom: r.bottom - b.top, locked: el.hasAttribute('data-lock'), failed: el.hasAttribute('data-fail') } }).filter(p => p.h > 0)
      const was = tr
      tr = trackStep(tr, pills, H, now)
      const el = line.current
      if (!el) return
      if (tr && tr.done && was !== tr && pills.find(p => p.el === tr.el)?.locked) clock.current.onZone?.(zoneAt(Math.min(1, Math.max(0, tr.y / H)))) // слово принято: его зона уходит в машину Мии (не принятые — красные по событиям движка)
      for (const p of pills) { // пилюля красится в цвет зоны вместе с линией (data-bz → race-boss.css); чужие и ещё не коснувшиеся шкалы — без окраски
        const want = tr && p.el === tr.el ? zoneAt(Math.min(1, Math.max(0, tr.y / H))) : null
        if (want) { if (p.el.dataset.bz !== want) p.el.dataset.bz = want } else if (p.el.dataset.bz) delete p.el.dataset.bz
      }
      el.style.opacity = lineOn(tr, now) ? '1' : '0'
      if (!tr) return
      const y = Math.min(H, Math.max(0, tr.y))
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`
      el.dataset.zone = zoneAt(y / H)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [live])

  const fl = flash ? { top: EDGES[ZONES.findIndex(z => z.id === flash.zone)] * 100, h: spanOf(flash.zone) * 100 } : null
  return (
    <div ref={host} className="wlBoss" data-live={live || undefined} data-show={(live && show) || undefined} aria-hidden="true" data-testid="race-boss-scale">
      {live && (
        <div ref={box} className="wlBossBox">
          {ZONES.map((z, i) => <i key={`${z.id}${flash?.zone === z.id ? flash.key : ''}`} className="wlBossZone" data-zone={z.id} data-flash={flash?.zone === z.id || undefined} style={{ top: `${EDGES[i] * 100}%`, height: `${spanOf(z.id) * 100}%`, '--flash-ms': `${flash?.ms ?? 2000}ms` }} />)}
          {TICKS.map(t => <b key={t.p} className="wlBossTick" data-zone={t.zone} data-major={t.major || undefined} style={{ top: `${t.p * 100}%` }} />)}
          {fl && <i key={flash.key} className="wlBossFlash" data-zone={flash.zone} style={{ top: `${fl.top}%`, height: `${fl.h}%`, '--flash-ms': `${flash.ms}ms` }} data-testid="race-boss-flash" />}
          {demo && (
            <>
              <i key={`p${demo.key}`} className="wlBossDemo" style={{ '--ms': `${demo.ms}ms` }} data-testid="race-boss-demo">{word}</i>
              <i key={`l${demo.key}`} className="wlBossLine" data-demo="" style={{ '--ms': `${demo.ms}ms` }} />
            </>
          )}
          <div ref={line} className="wlBossLine" data-zone="fast" style={{ opacity: 0 }} />
        </div>
      )}
    </div>
  )
}
