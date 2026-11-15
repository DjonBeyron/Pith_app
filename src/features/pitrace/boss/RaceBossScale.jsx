import { useEffect, useRef } from 'react'
import { timeAt, zoneOf, fmt, ticks, trackStep, lineOn } from './bossScale.js'

// Шкала финала «Шкала памяти» поверх сцены игры (.wlStage; владелец 2026-11-14): справа вертикальная шкала времени реакции (деления в секундах), через все дорожки идёт горизонтальная линия, её
// толкает широкая пилюля (линия на нижнем краю пилюли), на конце линии цифровой счётчик. Ответ принят или «не успел» — линия замирает на своей высоте, счётчик остаётся ещё немного, потом гаснет.
// Чем ниже уехала линия, тем дольше вспоминалось слово и тем слабее оно держится (цвет зон: крепко / средне / слабо, boss/bossScale.js). Рисует по кадрам (rAF), положение читает у самой пилюли
// (.wlPill[data-wide] в .wlField): никаких событий движка. speed — скорость пилюли финала (доли конвейера); paused — кадры стоят. Ничего не считает, пока финала нет (live = false).
export default function RaceBossScale({ live, speed, paused = false }) {
  const host = useRef(null), line = useRef(null), num = useRef(null), scale = useRef(null), clock = useRef({ paused })
  useEffect(() => { clock.current.paused = paused }, [paused])
  useEffect(() => {
    if (!live) return undefined
    const stage = host.current?.parentElement, field = stage?.querySelector('.wlField')
    if (!stage || !field) return undefined
    let raf = 0, tr = null, shownH = 0 // tr — отслеживаемая пилюля (bossScale.trackStep)
    const frame = now => {
      raf = requestAnimationFrame(frame)
      if (clock.current.paused) return
      const f = field.getBoundingClientRect(), s0 = stage.getBoundingClientRect(), H = f.height, off = f.top - s0.top // off — поле начинается на столько px ниже верха сцены
      if (!(H > 0)) return
      if (scale.current && shownH !== Math.round(H)) { shownH = Math.round(H); scale.current.style.top = `${Math.round(off)}px`; scale.current.style.height = `${shownH}px` }
      const pills = [...field.querySelectorAll('.wlPill[data-wide]')].map(el => { const r = el.getBoundingClientRect(); return { el, h: r.height, top: r.top - f.top, bottom: r.bottom - f.top, locked: el.hasAttribute('data-lock'), failed: el.hasAttribute('data-fail') } }).filter(p => p.h > 0)
      tr = trackStep(tr, pills, H, now)
      const el = line.current, n = num.current
      if (!el || !n) return
      const on = lineOn(tr, now)
      el.style.opacity = on ? '1' : '0'
      if (!tr) return
      const t = timeAt((tr.y / H) * 100, speed)
      el.style.transform = `translate3d(0, ${Math.round(tr.y + off)}px, 0)`
      el.dataset.zone = zoneOf(t)
      n.textContent = fmt(t)
      n.style.visibility = tr.y > 70 ? 'visible' : 'hidden' // у самого верха счётчик не показываем: он ложился на кнопки в правом верхнем углу
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [live, speed])

  const marks = ticks(speed, 96)
  return (
    <div ref={host} className="wlBoss" data-live={live || undefined} aria-hidden="true" data-testid="race-boss-scale">
      {live && (
        <>
          <div ref={scale} className="wlBossScale">{marks.map(m => <i key={m.t} style={{ top: `${m.y}%` }} data-zone={zoneOf(m.t - 0.01)}><b>{m.t}</b></i>)}</div>
          <div ref={line} className="wlBossLine" data-zone="fast" style={{ opacity: 0 }}><span ref={num} className="wlBossNum">0,0 с</span></div>
        </>
      )}
    </div>
  )
}
