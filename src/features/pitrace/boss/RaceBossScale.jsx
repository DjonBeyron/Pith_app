import { useEffect, useRef } from 'react'
import { zoneAt, ZONES, EDGES, TICKS, spanOf, trackStep, lineOn } from './bossScale.js'

// Шкала финала «Шкала памяти» поверх сцены игры (.wlStage; владелец 2026-11-15): справа вертикальная линейка с рисками цвета зоны и полупрозрачным фоном зон (зелёная 45 %, жёлтая 35 %, красная 20 % длины), без цифр.
// Линейка идёт от верха ленты (под кнопками паузы и админа) до низа с отступом под скругление экрана. Через все дорожки идёт горизонтальная линия — мягкая, с растушёванными краями: она появляется ровно в миг, когда
// нижний край пилюли касается верха линейки, дальше идёт за этим краем и мгновенно меняет цвет, когда доезжает до зоны другого цвета. Ответ принят или «не успел» — линия замирает, через HOLD_MS гаснет, а зона слова
// уходит в onZone('fast' | 'mid' | 'slow'): красные слова считает машина Мии. На церемонии Мия объясняет шкалу: flash — зона мигает полупрозрачной заливкой на её слова о зонах; demo — пример-пилюля со словом едет
// по линейке под её реплики (на каждой реплике свой отрезок пути), линия идёт за ней. show — шкалу видно. Рисует по кадрам (rAF), положение читает у пилюли (.wlPill[data-wide]). live = false — ничего не рисует.
export default function RaceBossScale({ live, show = true, flash = null, demo = null, word = '', paused = false, onZone = null }) {
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
      if (tr && tr.done && was !== tr) { // пилюля только что закончилась: зона отыграна (принята — зона линии, «не успел» — красная)
        const ok = pills.find(p => p.el === tr.el)?.locked
        clock.current.onZone?.(ok ? zoneAt(Math.min(1, Math.max(0, tr.y / H))) : 'slow')
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
          {ZONES.map((z, i) => <i key={z.id} className="wlBossZone" data-zone={z.id} style={{ top: `${EDGES[i] * 100}%`, height: `${spanOf(z.id) * 100}%` }} />)}
          {TICKS.map(t => <b key={t.p} className="wlBossTick" data-zone={t.zone} data-major={t.major || undefined} style={{ top: `${t.p * 100}%` }} />)}
          {fl && <i key={flash.key} className="wlBossFlash" data-zone={flash.zone} style={{ top: `${fl.top}%`, height: `${fl.h}%`, '--flash-ms': `${flash.ms}ms` }} data-testid="race-boss-flash" />}
          {demo && !demo.out && (
            <>
              <i key={`p${demo.key}`} className="wlBossDemo" data-zone={demo.zone} style={{ '--from': demo.from, '--to': demo.to, '--ms': `${demo.ms}ms` }} data-testid="race-boss-demo">{word}</i>
              {demo.to > 0 && <i key={`l${demo.key}`} className="wlBossLine" data-zone={demo.zone} data-demo="" style={{ '--from': Math.max(0, demo.from), '--to': demo.to, '--ms': `${demo.ms}ms` }} />}
            </>
          )}
          {demo?.out && <i key={`o${demo.key}`} className="wlBossDemo" data-out="" data-zone="slow" style={{ '--from': 1, '--to': 1 }}>{word}</i>}
          <div ref={line} className="wlBossLine" data-zone="fast" style={{ opacity: 0 }} />
        </div>
      )}
    </div>
  )
}
