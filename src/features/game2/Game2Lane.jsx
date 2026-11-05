import { useRef, useState, useMemo, useLayoutEffect, useEffect } from 'react'
import Game2Pill from './Game2Pill.jsx'
import { pillBox, trackY, layoutScale, LINE_Y, LANE_WIDTH } from './game2Geometry.js'
import { flyUp } from './game2Fly.js'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'

// Лента времени «Мини-игры 2.0» (CONCEPT_GAME2.md): одна вертикальная лента по центру экрана (LANE_WIDTH % ширины), линия «сейчас» на LINE_Y % высоты. Все пилюли режима лежат в одной дорожке,
// дорожка едет вниз ОДНИМ transform (setT пишет его прямо в DOM каждый кадр, React в кадрах не участвует): пилюля доезжает до линии ровно в начале своего слова (game2Geometry, timelinePlan).
// Пилюли одной высоты, лента растягивается по самой тесной паре слов фразы (layoutScale по view.all — все слова фразы; в «Ловлю» видны не все, а лента та же).
// apiRef.current = { setT(t мс), mark(i, state, opts), label(i), win(i, on) }: win — окно попадания пилюли «Ловлю» открыто (пилюля светится ярче); mark ставит пилюле data-state (lit — «горит» по ходу слова, done, hit — слово сказано, miss — не успел, полоски) и в «Ловлю» (opts.rise)
// запускает взлёт копии (game2Fly.js); label — показать подпись одной пилюли (подсказка «По памяти»). view = { key, mode, pills, labels }: смена key пересобирает пилюли (состояния сбрасываются).
const LITE_HOLD_MS = 350 // слабое устройство: сколько залитая пойманная пилюля стоит перед тем, как погаснуть

export default function Game2Lane({ view, apiRef, onPillTap = null, height = 812 }) {
  const rootRef = useRef(null)
  const trackRef = useRef(null)
  const flyRef = useRef(null)
  const [h, setH] = useState(height)
  const [lite] = useState(() => { try { return isWeakDevice() || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false } })
  const hRef = useRef(h)
  const fadeTimers = useRef([])
  const scale = useMemo(() => layoutScale(view.all ?? view.pills, h), [view.all, view.pills, h])
  const boxes = useMemo(() => view.pills.map(p => pillBox(p, h, scale)), [view.pills, h, scale])
  const scaleRef = useRef(scale)

  useLayoutEffect(() => { hRef.current = h; scaleRef.current = scale })
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    const measure = () => { if (el.clientHeight > 0) setH(el.clientHeight) }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => { if (trackRef.current) trackRef.current.style.transform = `translate3d(0, ${trackY(0, h, scale)}px, 0)` }, [view.key, h, scale]) // новая лента встаёт в нулевой момент (до первого кадра часов)

  useEffect(() => {
    if (!apiRef) return undefined
    const find = i => trackRef.current?.querySelector(`[data-i="${i}"]`)
    apiRef.current = {
      setT(t) { if (trackRef.current) trackRef.current.style.transform = `translate3d(0, ${trackY(t, hRef.current, scaleRef.current).toFixed(1)}px, 0)` },
      mark(i, state, opts = {}) {
        const el = find(i)
        if (!el) return
        if (state === 'lit' && opts.ms) el.style.setProperty('--ms', `${Math.round(opts.ms)}ms`)
        el.setAttribute('data-state', state)
        el.removeAttribute('data-window')
        if (state === 'hit' && opts.rise && flyRef.current) { // «Ловлю»: пойманная пилюля улетает вверх копией, оригинал прячется; на слабом устройстве полёта нет — залита, мигнула и погасла
          if (flyUp(el, flyRef.current, hRef.current, lite)) el.setAttribute('data-state', 'gone')
          else fadeTimers.current.push(setTimeout(() => el.setAttribute('data-state', 'gone'), LITE_HOLD_MS))
        }
      },
      label(i) { find(i)?.setAttribute('data-label', '') },
      win(i, on) { const el = find(i); if (el) { if (on) el.setAttribute('data-window', ''); else el.removeAttribute('data-window') } },
    }
    return () => { apiRef.current = null; fadeTimers.current.forEach(clearTimeout); fadeTimers.current = [] }
  }, [apiRef, lite])

  return (
    <div ref={rootRef} className="g2Lane" data-mode={view.mode} data-labels={view.labels ? '1' : '0'} data-scale={scale.toFixed(2)} data-lite={lite || undefined} style={{ '--g2-line': `${LINE_Y}%`, '--g2-w': `${LANE_WIDTH}%` }} data-testid="g2-lane">
      <div ref={trackRef} className="g2Track" data-testid="g2-track">
        {view.pills.map((p, k) => <Game2Pill key={`${view.key}-${p.i}`} p={p} box={boxes[k]} tap={!!onPillTap} />)}
      </div>
      <div ref={flyRef} className="g2Fly" />
      <div className="g2Line" data-testid="g2-line" />
      {onPillTap && <TapLayer onTap={onPillTap} trackRef={trackRef} />}
    </div>
  )
}

// «Тап вместо речи»: касание в ленте засчитывается ближайшей к пальцу пилюле (не дальше TAP_REACH_PX): пилюли едут и невысокие, попасть точно по ним на ходу трудно
const TAP_REACH_PX = 48
function TapLayer({ onTap, trackRef }) {
  const press = e => {
    let best = null
    for (const n of trackRef.current?.querySelectorAll('.g2Pill') ?? []) {
      const r = n.getBoundingClientRect()
      const d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0
      if (d <= TAP_REACH_PX && (!best || d < best.d)) best = { d, i: Number(n.getAttribute('data-i')) }
    }
    if (best) onTap(best.i)
  }
  return <div className="g2TapLayer" onPointerDown={press} data-testid="g2-tap" />
}
