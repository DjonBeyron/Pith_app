import { useEffect, useRef } from 'react'
import { timeAt, zoneOf, yAt, ZONES, trackStep, lineOn } from './bossScale.js'

// Шкала финала «Шкала памяти» поверх сцены игры (.wlStage; владелец 2026-11-14): справа вертикальная трёхцветная шкала (зелёная, жёлтая, красная зоны, без цифр), через все дорожки идёт горизонтальная
// линия, её толкает широкая пилюля (линия на нижнем краю пилюли). Линия мгновенно меняет цвет, когда пилюля доезжает до зоны другого цвета. Ответ принят или «не успел» — линия замирает, через HOLD_MS гаснет, а
// зона, в которой слово отыграно, уходит в onZone('fast' | 'mid' | 'slow'): красные слова считает машина Мии (пять — Пит остаётся внутри). Мия объясняет шкалу репликами: flash — { zone, key, ms }: на её слова
// «зелёная / жёлтая / красная зона» зона мигает полупрозрачной заливкой через всю ширину. show — шкалу видно (на церемонии — с реплики «видите шкалу справа?», в круге — всегда). Рисует по кадрам (rAF),
// положение читает у самой пилюли (.wlPill[data-wide] в .wlField). speed — скорость пилюли финала (доли конвейера); paused — кадры стоят. live = false — ничего не считает и не рисует.
export default function RaceBossScale({ live, show = true, speed, flash = null, paused = false, onZone = null }) {
  const host = useRef(null), box = useRef(null), line = useRef(null), clock = useRef({ paused, onZone })
  useEffect(() => { clock.current.paused = paused; clock.current.onZone = onZone }, [paused, onZone])
  useEffect(() => {
    if (!live) return undefined
    const stage = host.current?.parentElement, field = stage?.querySelector('.wlField')
    if (!stage || !field) return undefined
    let raf = 0, tr = null, shown = '' // tr — отслеживаемая пилюля (bossScale.trackStep), shown — последняя записанная рамка поля
    const frame = now => {
      raf = requestAnimationFrame(frame)
      if (clock.current.paused) return
      const f = field.getBoundingClientRect(), s0 = stage.getBoundingClientRect(), H = f.height
      if (!(H > 0)) return
      const key = `${Math.round(f.top - s0.top)}:${Math.round(H)}`
      if (box.current && shown !== key) { shown = key; box.current.style.top = `${Math.round(f.top - s0.top)}px`; box.current.style.height = `${Math.round(H)}px` }
      const pills = [...field.querySelectorAll('.wlPill[data-wide]')].map(el => { const r = el.getBoundingClientRect(); return { el, h: r.height, top: r.top - f.top, bottom: r.bottom - f.top, locked: el.hasAttribute('data-lock'), failed: el.hasAttribute('data-fail') } }).filter(p => p.h > 0)
      const was = tr
      tr = trackStep(tr, pills, H, now)
      const el = line.current
      if (!el) return
      if (tr && tr.done && was !== tr) { // пилюля только что закончилась: зона отыграна (принята — зона линии, «не успел» — красная)
        const failed = !pills.find(p => p.el === tr.el)?.locked
        clock.current.onZone?.(failed ? 'slow' : zoneOf(timeAt((tr.y / H) * 100, speed)))
      }
      el.style.opacity = lineOn(tr, now) ? '1' : '0'
      if (!tr) return
      el.style.transform = `translate3d(0, ${Math.round(tr.y)}px, 0)`
      el.dataset.zone = zoneOf(timeAt((tr.y / H) * 100, speed))
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [live, speed])

  const edges = ZONES.map((z, i) => (i === 0 ? 0 : yAt(ZONES[i - 1].to, speed))) // верх каждой зоны, % высоты поля
  return (
    <div ref={host} className="wlBoss" data-live={live || undefined} data-show={(live && show) || undefined} aria-hidden="true" data-testid="race-boss-scale">
      {live && (
        <div ref={box} className="wlBossBox">
          {ZONES.map((z, i) => <i key={z.id} className="wlBossZone" data-zone={z.id} style={{ top: `${edges[i]}%`, height: i === ZONES.length - 1 ? `${100 - edges[i]}%` : `${edges[i + 1] - edges[i]}%` }} />)}
          {flash && <i key={flash.key} className="wlBossFlash" data-zone={flash.zone} style={{ top: `${edges[ZONES.findIndex(z => z.id === flash.zone)]}%`, height: flash.zone === 'slow' ? `${100 - edges[2]}%` : `${edges[ZONES.findIndex(z => z.id === flash.zone) + 1] - edges[ZONES.findIndex(z => z.id === flash.zone)]}%`, '--flash-ms': `${flash.ms}ms` }} data-testid="race-boss-flash" />}
          <div ref={line} className="wlBossLine" data-zone="fast" style={{ opacity: 0 }} />
        </div>
      )}
    </div>
  )
}
